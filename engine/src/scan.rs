//! Walks a repository, parses every source file in parallel and assembles the analysis.

use crate::django::{Model, Relationship};
use crate::graph::{self, Graph};
use crate::lang::{self, LangSpec};
use crate::parse::{self, FileFacts};
use crate::resolve::Resolver;
use ignore::{WalkBuilder, WalkState};
use rayon::prelude::*;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

/// Directories that hold dependencies, build output or caches rather than the project's own code.
pub const IGNORED_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "bower_components",
    "jspm_packages",
    "vendor",
    "dist",
    "build",
    "out",
    "target",
    "__pycache__",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".turbo",
    ".cache",
    "coverage",
    ".venv",
    "venv",
    "env",
    ".env",
    ".tox",
    ".nox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "__pypackages__",
    ".eggs",
    ".gradle",
    ".idea",
    ".vscode",
    "Pods",
    "DerivedData",
    ".terraform",
    ".serverless",
    "site-packages",
];

#[derive(Clone, Debug)]
pub struct ScanOptions {
    /// Larger files are counted as skipped; they are almost always generated or data.
    pub max_file_bytes: u64,
    pub max_nodes: usize,
    pub max_links: usize,
    pub commit: Option<String>,
}

impl Default for ScanOptions {
    fn default() -> Self {
        ScanOptions {
            max_file_bytes: 1024 * 1024,
            max_nodes: 10_000,
            max_links: 30_000,
            commit: None,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
pub struct LanguageStats {
    pub files: usize,
    pub lines: usize,
    pub blank: usize,
    pub bytes: u64,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct Stats {
    pub files: usize,
    pub loc: usize,
    pub blank: usize,
    pub bytes: u64,
    pub parsed_files: usize,
    pub skipped_files: usize,
    pub symbols: usize,
    pub imports: usize,
    pub resolved_imports: usize,
    pub languages: BTreeMap<String, LanguageStats>,
    pub duration_ms: u128,
}

/// The analysis payload. `models`, `views`, `urls`, `relationships` and `graphify` keep the shape
/// the client already reads from the old Python service.
#[derive(Debug, Serialize)]
pub struct Analysis {
    pub models: Vec<Model>,
    pub views: Vec<String>,
    pub urls: Vec<String>,
    pub relationships: Vec<Relationship>,
    pub stats: Stats,
    pub graphify: Graph,
}

pub struct FileRecord {
    pub path: String,
    pub lang: &'static LangSpec,
    pub lines: usize,
    pub blank: usize,
    pub bytes: u64,
    pub facts: FileFacts,
}

enum Walked {
    Source(PathBuf),
    GoMod(PathBuf),
}

fn walk(root: &Path) -> Vec<Walked> {
    let found = Mutex::new(Vec::new());
    WalkBuilder::new(root)
        .hidden(true)
        .require_git(false)
        .follow_links(false)
        .filter_entry(|entry| {
            !(entry.file_type().is_some_and(|t| t.is_dir())
                && entry
                    .file_name()
                    .to_str()
                    .is_some_and(|n| IGNORED_DIRS.contains(&n)))
        })
        .build_parallel()
        .run(|| {
            let found = &found;
            Box::new(move |entry| {
                let Ok(entry) = entry else {
                    return WalkState::Continue;
                };
                if !entry.file_type().is_some_and(|t| t.is_file()) {
                    return WalkState::Continue;
                }
                let path = entry.into_path();
                let item = if path.file_name().is_some_and(|n| n == "go.mod") {
                    Walked::GoMod(path)
                } else if lang::detect(&path).is_some() {
                    Walked::Source(path)
                } else {
                    return WalkState::Continue;
                };
                found.lock().unwrap().push(item);
                WalkState::Continue
            })
        });
    found.into_inner().unwrap()
}

fn relative(root: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(root).ok()?.to_str()?;
    Some(rel.replace('\\', "/"))
}

fn looks_minified(path: &str, bytes: usize, lines: usize) -> bool {
    path.contains(".min.") || path.contains("-min.") || (bytes > 4096 && bytes / lines.max(1) > 400)
}

enum Outcome {
    Record(FileRecord),
    Skipped,
}

fn process(root: &Path, path: &Path, max_bytes: u64) -> Option<Outcome> {
    let rel = relative(root, path)?;
    let spec = lang::detect(path)?;
    let size = std::fs::metadata(path).ok()?.len();
    if size > max_bytes {
        return Some(Outcome::Skipped);
    }
    let raw = std::fs::read(path).ok()?;
    if raw[..raw.len().min(8000)].contains(&0) {
        return Some(Outcome::Skipped);
    }
    let src = String::from_utf8(raw)
        .unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned());
    let lines = src.lines().count();
    let blank = src.lines().filter(|l| l.trim().is_empty()).count();
    let facts = if looks_minified(&rel, src.len(), lines) {
        FileFacts::default()
    } else {
        parse::extract(spec, &rel, &src)
    };
    Some(Outcome::Record(FileRecord {
        path: rel,
        lang: spec,
        lines,
        blank,
        bytes: size,
        facts,
    }))
}

/// Scans `root` and returns the full analysis. Pure CPU and file I/O; callers run it off the async runtime.
pub fn scan(root: &Path, options: &ScanOptions) -> Analysis {
    let started = Instant::now();
    let walked = walk(root);
    let mut go_mods: Vec<(String, String)> = Vec::new();
    let mut sources = Vec::new();
    for item in walked {
        match item {
            Walked::Source(path) => sources.push(path),
            Walked::GoMod(path) => {
                if let (Some(rel), Ok(contents)) =
                    (relative(root, &path), std::fs::read_to_string(&path))
                {
                    go_mods.push((rel, contents));
                }
            }
        }
    }

    let outcomes: Vec<Outcome> = sources
        .par_iter()
        .filter_map(|path| process(root, path, options.max_file_bytes))
        .collect();
    let mut stats = Stats::default();
    let mut records = Vec::with_capacity(outcomes.len());
    for outcome in outcomes {
        match outcome {
            Outcome::Record(record) => records.push(record),
            Outcome::Skipped => stats.skipped_files += 1,
        }
    }
    // Parallel collection order varies; sort so identical repos give identical output.
    records.sort_by(|a, b| a.path.cmp(&b.path));

    let resolver = Resolver::new(records.iter().map(|r| r.path.as_str()), &go_mods);
    let resolved: Vec<Vec<String>> = records
        .par_iter()
        .map(|record| {
            let mut targets: Vec<String> = record
                .facts
                .imports
                .iter()
                .flat_map(|import| resolver.resolve(&record.path, record.lang, import))
                .collect();
            targets.sort();
            targets.dedup();
            targets
        })
        .collect();

    let mut models = Vec::new();
    let mut relationships = Vec::new();
    let mut views = Vec::new();
    let mut urls = Vec::new();
    for (record, targets) in records.iter_mut().zip(&resolved) {
        stats.files += 1;
        stats.loc += record.lines;
        stats.blank += record.blank;
        stats.bytes += record.bytes;
        stats.parsed_files += usize::from(record.facts.parsed);
        stats.symbols += record.facts.symbols.len();
        stats.imports += record.facts.imports.len();
        stats.resolved_imports += targets.len();
        let lang = stats
            .languages
            .entry(record.lang.name.to_string())
            .or_default();
        lang.files += 1;
        lang.lines += record.lines;
        lang.blank += record.blank;
        lang.bytes += record.bytes;
        models.append(&mut record.facts.models);
        relationships.append(&mut record.facts.relationships);
        match record.path.rsplit('/').next() {
            Some("views.py") => views.push(record.path.clone()),
            Some("urls.py") => urls.push(record.path.clone()),
            _ => {}
        }
    }

    let graphify = graph::build(&records, &resolved, options);
    stats.duration_ms = started.elapsed().as_millis();
    Analysis {
        models,
        views,
        urls,
        relationships,
        stats,
        graphify,
    }
}
