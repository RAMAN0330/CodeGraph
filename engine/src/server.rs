//! HTTP service: `POST /api/analyze` queues a clone-and-scan job, `GET /api/tasks/{id}` polls it.
//! Same contract as the Python/Celery service it replaces, so the Node API proxies to it unchanged.

use crate::scan::{self, ScanOptions};
use axum::extract::{Path as UrlPath, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::Engine as _;
use regex::Regex;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tokio::process::Command;
use tokio::sync::Semaphore;

const TASK_TTL: Duration = Duration::from_secs(3600);

// Only public github.com HTTPS clone URLs are accepted; anything else
// (file://, ssh, internal hosts, embedded credentials) never reaches git clone.
static GITHUB_CLONE_URL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^https://github\.com/[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}?(\.git)?/?$")
        .unwrap()
});
static SAFE_BRANCH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Za-z0-9_./-]{1,200}$").unwrap());
static SAFE_TOKEN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z0-9_\-.]+$").unwrap());

#[derive(Clone, Debug)]
pub struct Config {
    pub concurrency: usize,
    pub max_queued: usize,
    pub clone_timeout: Duration,
    pub scan: ScanOptions,
}

impl Config {
    pub fn from_env() -> Config {
        let num = |key: &str, default: u64| {
            std::env::var(key)
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(default)
        };
        let defaults = ScanOptions::default();
        Config {
            concurrency: num("ANALYSIS_CONCURRENCY", 2).max(1) as usize,
            max_queued: num("ANALYSIS_MAX_QUEUED", 64) as usize,
            clone_timeout: Duration::from_secs(num("CLONE_TIMEOUT_SECONDS", 300)),
            scan: ScanOptions {
                max_file_bytes: num("MAX_FILE_BYTES", defaults.max_file_bytes),
                max_nodes: num("GRAPH_MAX_NODES", defaults.max_nodes as u64) as usize,
                max_links: num("GRAPH_MAX_LINKS", defaults.max_links as u64) as usize,
                commit: None,
            },
        }
    }
}

struct Task {
    updated: Instant,
    /// Serialized once; polls return the bytes as they are.
    body: Arc<str>,
    finished: bool,
}

// shortcut: tasks live in this process's memory, so run one engine replica (or sticky routing);
// move them to Redis or Postgres before scaling the engine out.
pub struct AppState {
    config: Config,
    tasks: Mutex<HashMap<String, Task>>,
    permits: Arc<Semaphore>,
}

impl AppState {
    pub fn new(config: Config) -> Arc<AppState> {
        let permits = Arc::new(Semaphore::new(config.concurrency));
        Arc::new(AppState {
            config,
            tasks: Mutex::new(HashMap::new()),
            permits,
        })
    }

    fn set(&self, id: &str, body: Value) {
        let finished = matches!(body["status"].as_str(), Some("completed" | "failed"));
        let task = Task {
            updated: Instant::now(),
            body: body.to_string().into(),
            finished,
        };
        let mut tasks = self.tasks.lock().unwrap();
        tasks.retain(|_, task| task.updated.elapsed() < TASK_TTL);
        tasks.insert(id.to_string(), task);
    }

    fn get(&self, id: &str) -> Option<Arc<str>> {
        let mut tasks = self.tasks.lock().unwrap();
        tasks.retain(|_, task| task.updated.elapsed() < TASK_TTL);
        tasks.get(id).map(|task| task.body.clone())
    }

    fn pending(&self) -> usize {
        self.tasks
            .lock()
            .unwrap()
            .values()
            .filter(|t| !t.finished)
            .count()
    }
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route(
            "/",
            get(|| async { Json(json!({ "message": "CodeGraph engine is running" })) }),
        )
        .route(
            "/health/live",
            get(|| async { Json(json!({ "status": "ok" })) }),
        )
        .route("/api/analyze", post(analyze))
        .route("/api/tasks/{task_id}", get(task_status))
        .with_state(state)
}

#[derive(Debug, Deserialize)]
pub struct AnalyzeRequest {
    pub url: Option<String>,
    pub token: Option<String>,
    pub branch: Option<String>,
}

fn error(status: StatusCode, detail: impl Into<String>) -> Response {
    (status, Json(json!({ "detail": detail.into() }))).into_response()
}

pub fn validate(request: &AnalyzeRequest) -> Result<(), &'static str> {
    let url = request.url.as_deref().unwrap_or("");
    if !GITHUB_CLONE_URL.is_match(url) || format!("{url}/").contains("/../") {
        return Err("Only https://github.com/<owner>/<repo> URLs can be analyzed.");
    }
    if let Some(branch) = request.branch.as_deref().filter(|b| !b.is_empty()) {
        if !SAFE_BRANCH.is_match(branch) || branch.starts_with('-') || branch.contains("..") {
            return Err("Invalid branch name.");
        }
    }
    if let Some(token) = request.token.as_deref().filter(|t| !t.is_empty()) {
        if !SAFE_TOKEN.is_match(token) {
            return Err("Invalid token.");
        }
    }
    Ok(())
}

async fn analyze(
    State(state): State<Arc<AppState>>,
    Json(request): Json<AnalyzeRequest>,
) -> Response {
    if let Err(detail) = validate(&request) {
        return error(StatusCode::BAD_REQUEST, detail);
    }
    if state.pending() >= state.config.max_queued {
        return error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Analysis queue is full; try again shortly.",
        );
    }
    let task_id = uuid::Uuid::new_v4().to_string();
    state.set(&task_id, json!({ "status": "queued", "progress": 0 }));
    tokio::spawn(run_job(state, task_id.clone(), request));
    Json(json!({ "task_id": task_id, "status": "queued" })).into_response()
}

async fn task_status(
    State(state): State<Arc<AppState>>,
    UrlPath(task_id): UrlPath<String>,
) -> Response {
    match state.get(&task_id) {
        Some(body) => (
            [(header::CONTENT_TYPE, "application/json")],
            body.to_string(),
        )
            .into_response(),
        None => error(StatusCode::NOT_FOUND, "Task not found"),
    }
}

async fn run_job(state: Arc<AppState>, task_id: String, request: AnalyzeRequest) {
    let Ok(_permit) = state.permits.clone().acquire_owned().await else {
        return;
    };
    state.set(&task_id, json!({ "status": "processing", "progress": 0 }));
    let result = async {
        let dir =
            tempfile::tempdir().map_err(|e| format!("Could not create a work directory: {e}"))?;
        state.set(&task_id, json!({ "status": "processing", "progress": 20 }));
        let url = request.url.as_deref().unwrap_or_default();
        let branch = request.branch.as_deref().filter(|b| !b.is_empty());
        let token = request.token.as_deref().filter(|t| !t.is_empty());
        let commit = clone_repo(url, token, branch, dir.path(), state.config.clone_timeout).await?;
        state.set(&task_id, json!({ "status": "processing", "progress": 50 }));
        let options = ScanOptions {
            commit,
            ..state.config.scan.clone()
        };
        let analysis = tokio::task::spawn_blocking(move || {
            let analysis = scan::scan(dir.path(), &options);
            drop(dir);
            serde_json::to_value(analysis)
        })
        .await
        .map_err(|e| format!("Analysis crashed: {e}"))?
        .map_err(|e| format!("Could not encode the analysis: {e}"))?;
        Ok::<Value, String>(analysis)
    }
    .await;
    match result {
        Ok(analysis) => state.set(
            &task_id,
            json!({ "status": "completed", "progress": 100, "result": analysis }),
        ),
        Err(message) => state.set(&task_id, json!({ "status": "failed", "error": message })),
    }
}

/// Shallow-clones `url` into `dest` and returns the checked-out commit. The token travels in an
/// environment-scoped auth header, never in the URL, argv or error messages.
pub async fn clone_repo(
    url: &str,
    token: Option<&str>,
    branch: Option<&str>,
    dest: &Path,
    timeout: Duration,
) -> Result<Option<String>, String> {
    let mut command = Command::new("git");
    command.args(["clone", "--depth", "1", "--single-branch", "--no-tags"]);
    if let Some(branch) = branch {
        command.args(["--branch", branch]);
    }
    command.arg("--").arg(url).arg(dest);
    command
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_LFS_SKIP_SMUDGE", "1")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true);
    if let Some(token) = token {
        let basic =
            base64::engine::general_purpose::STANDARD.encode(format!("x-access-token:{token}"));
        command
            .env("GIT_CONFIG_COUNT", "1")
            .env("GIT_CONFIG_KEY_0", "http.https://github.com/.extraheader")
            .env(
                "GIT_CONFIG_VALUE_0",
                format!("AUTHORIZATION: basic {basic}"),
            );
    }
    let output = tokio::time::timeout(timeout, command.output())
        .await
        .map_err(|_| format!("Cloning took longer than {}s.", timeout.as_secs()))?
        .map_err(|e| format!("Could not run git: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let detail: String = stderr
            .trim()
            .chars()
            .rev()
            .take(500)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        return Err(format!("git clone failed: {detail}"));
    }
    let head = Command::new("git")
        .arg("-C")
        .arg(dest)
        .args(["rev-parse", "HEAD"])
        .output()
        .await
        .ok();
    Ok(head
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()))
}

pub async fn serve(port: u16) -> std::io::Result<()> {
    let state = AppState::new(Config::from_env());
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    eprintln!("codegraph-engine listening on http://0.0.0.0:{port}");
    axum::serve(listener, router(state))
        .with_graceful_shutdown(async {
            let mut term =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("SIGTERM handler");
            tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = term.recv() => {} }
        })
        .await
}
