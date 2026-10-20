//! HTTP contract of the analysis service and the clone step.

mod common;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use codegraph_engine::scan::{scan, ScanOptions};
use codegraph_engine::server::{clone_repo, router, validate, AnalyzeRequest, AppState, Config};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use std::process::Command;
use std::time::Duration;
use tower::ServiceExt;

fn config(max_queued: usize) -> Config {
    Config {
        concurrency: 1,
        max_queued,
        clone_timeout: Duration::from_secs(5),
        scan: ScanOptions::default(),
    }
}

async fn call(
    app: &axum::Router,
    method: &str,
    uri: &str,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json");
    let request = request
        .body(
            body.map(|b| Body::from(b.to_string()))
                .unwrap_or_else(Body::empty),
        )
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

fn request(url: &str, token: Option<&str>, branch: Option<&str>) -> AnalyzeRequest {
    AnalyzeRequest {
        url: Some(url.into()),
        token: token.map(Into::into),
        branch: branch.map(Into::into),
    }
}

#[test]
fn accepts_only_github_https_urls() {
    for url in [
        "https://github.com/owner/repo",
        "https://github.com/owner/repo.git",
        "https://github.com/o-1/r_2.x/",
    ] {
        assert!(validate(&request(url, None, None)).is_ok(), "{url}");
    }
    for url in [
        "",
        "http://github.com/o/r",
        "https://gitlab.com/o/r",
        "file:///etc",
        "git@github.com:o/r.git",
        "https://user:pass@github.com/o/r",
        "https://github.com/o/r/../../x",
        "https://github.com/o",
        "https://github.com.evil.io/o/r",
        "https://github.com/o/r?x=1",
        "https://github.com/o/r\n",
        "ssh://github.com/o/r",
        "https://github.com/o/r/tree/main",
    ] {
        assert!(
            validate(&request(url, None, None)).is_err(),
            "{url:?} must be rejected"
        );
    }
    assert!(validate(&AnalyzeRequest {
        url: None,
        token: None,
        branch: None
    })
    .is_err());
}

#[test]
fn rejects_unsafe_branches_and_tokens() {
    let url = "https://github.com/o/r";
    for branch in ["main", "feature/x-1", "release_2.0", ""] {
        assert!(
            validate(&request(url, None, Some(branch))).is_ok(),
            "{branch}"
        );
    }
    for branch in ["-upload-pack=x", "a b", "a;rm -rf", "../x", "a..b", "$(id)"] {
        assert!(
            validate(&request(url, None, Some(branch))).is_err(),
            "{branch}"
        );
    }
    assert!(validate(&request(url, Some("ghp_abc123"), None)).is_ok());
    for token in ["a b", "x@evil", "tok\n", "a/b"] {
        assert!(
            validate(&request(url, Some(token), None)).is_err(),
            "{token:?}"
        );
    }
}

#[tokio::test]
async fn health_endpoints() {
    let app = router(AppState::new(config(4)));
    let (status, body) = call(&app, "GET", "/", None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["message"].as_str().unwrap().contains("running"));
    assert_eq!(
        call(&app, "GET", "/health/live", None).await,
        (StatusCode::OK, json!({ "status": "ok" }))
    );
}

#[tokio::test]
async fn analyze_rejects_bad_input_with_detail() {
    let app = router(AppState::new(config(4)));
    let (status, body) = call(
        &app,
        "POST",
        "/api/analyze",
        Some(json!({ "url": "file:///etc/passwd" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["detail"].as_str().unwrap().contains("github.com"));
    let (status, _) = call(
        &app,
        "POST",
        "/api/analyze",
        Some(json!({ "url": "https://github.com/o/r", "branch": "--evil" })),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = call(&app, "POST", "/api/analyze", Some(json!("not an object"))).await;
    assert!(status.is_client_error());
}

#[tokio::test]
async fn analyze_queues_a_pollable_task() {
    let app = router(AppState::new(config(1)));
    let body = json!({ "url": "https://github.com/o/r" });
    let (status, queued) = call(&app, "POST", "/api/analyze", Some(body)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(queued["status"], "queued");
    let task_id = queued["task_id"].as_str().unwrap();
    assert_eq!(task_id.len(), 36, "uuid; the Node API checks this shape");
    let (status, task) = call(&app, "GET", &format!("/api/tasks/{task_id}"), None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(["queued", "processing", "failed"].contains(&task["status"].as_str().unwrap()));
}

#[tokio::test]
async fn a_full_queue_returns_503() {
    let app = router(AppState::new(config(0)));
    let (status, body) = call(
        &app,
        "POST",
        "/api/analyze",
        Some(json!({ "url": "https://github.com/o/r" })),
    )
    .await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert!(body["detail"].as_str().unwrap().contains("queue"));
}

#[tokio::test]
async fn unknown_tasks_are_404() {
    let app = router(AppState::new(config(4)));
    let (status, body) = call(
        &app,
        "GET",
        "/api/tasks/00000000-0000-0000-0000-000000000000",
        None,
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(body["detail"], "Task not found");
}

fn git(dir: &std::path::Path, args: &[&str]) {
    let ok = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .status()
        .unwrap()
        .success();
    assert!(ok, "git {args:?}");
}

fn local_repo() -> tempfile::TempDir {
    let repo = common::write_tree(&[
        (
            "src/app.py",
            b"from .util import f\n\ndef main():\n    f()\n",
        ),
        ("src/util.py", b"def f():\n    pass\n"),
    ]);
    git(repo.path(), &["init", "-q", "-b", "main"]);
    git(
        repo.path(),
        &["-c", "user.name=t", "-c", "user.email=t@t", "add", "."],
    );
    git(
        repo.path(),
        &[
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "commit",
            "-qm",
            "init",
        ],
    );
    git(repo.path(), &["branch", "feature"]);
    repo
}

#[tokio::test]
async fn clones_shallowly_and_reports_the_commit() {
    let repo = local_repo();
    let url = format!("file://{}", repo.path().display());
    let dest = tempfile::tempdir().unwrap();
    let target = dest.path().join("checkout");
    let commit = clone_repo(
        &url,
        Some("secret-token"),
        Some("feature"),
        &target,
        Duration::from_secs(30),
    )
    .await
    .unwrap();
    let head = Command::new("git")
        .arg("-C")
        .arg(repo.path())
        .args(["rev-parse", "HEAD"])
        .output()
        .unwrap();
    assert_eq!(
        commit.as_deref(),
        Some(String::from_utf8_lossy(&head.stdout).trim())
    );

    let analysis = serde_json::to_value(scan(
        &target,
        &ScanOptions {
            commit,
            ..ScanOptions::default()
        },
    ))
    .unwrap();
    assert_eq!(analysis["stats"]["files"], 2, ".git is not scanned");
    let calls: Vec<_> = analysis["graphify"]["links"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["relation"] == "calls")
        .collect();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0]["source"], "src/app.py::main");
    assert_eq!(calls[0]["target"], "src/util.py::f");
}

#[tokio::test]
async fn clone_errors_never_leak_the_token() {
    let dest = tempfile::tempdir().unwrap();
    let missing = format!("file://{}/nope", dest.path().display());
    let error = clone_repo(
        &missing,
        Some("ghp_supersecret"),
        None,
        &dest.path().join("x"),
        Duration::from_secs(30),
    )
    .await
    .unwrap_err();
    assert!(error.starts_with("git clone failed"), "{error}");
    assert!(!error.contains("ghp_supersecret"));

    let repo = local_repo();
    let url = format!("file://{}", repo.path().display());
    let error = clone_repo(
        &url,
        None,
        Some("no-such-branch"),
        &dest.path().join("y"),
        Duration::from_secs(30),
    )
    .await
    .unwrap_err();
    assert!(error.contains("no-such-branch"), "{error}");
}
