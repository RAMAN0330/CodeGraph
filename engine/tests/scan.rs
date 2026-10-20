//! Whole-repository scans: walking, filtering, Django introspection and the graph payload.

mod common;
use codegraph_engine::scan::{scan, ScanOptions};
use common::write_tree;
use serde_json::Value;
use std::collections::BTreeSet;

const MODELS: &str = r#"
from django.db import models
from django.conf import settings


class Author(models.Model):
    name = models.CharField(max_length=100)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Book(models.Model):
    title = models.CharField(max_length=200)
    author = models.ForeignKey("Author", on_delete=models.CASCADE)
    tags = models.ManyToManyField(to="Tag")
    publisher = models.ForeignKey(Publisher, on_delete=models.SET_NULL, null=True)


class Abstract(models.Model):
    pass


class NotAModel:
    helper = make_helper()
"#;

fn polyglot() -> tempfile::TempDir {
    let minified = format!("var a={};", "x".repeat(10_000));
    let big = "x".repeat(2 * 1024 * 1024);
    let files: Vec<(&str, Vec<u8>)> = vec![
        (".gitignore", b"generated/\n*.log\n".to_vec()),
        ("web/src/app.ts", b"import { util } from './util';\nimport React from 'react';\nexport function main() { return util(); }\n".to_vec()),
        ("web/src/util.ts", b"export function util() { return helper(); }\nfunction helper() { return 1; }\n".to_vec()),
        ("web/src/vendor.min.js", minified.into_bytes()),
        ("shop/models.py", MODELS.as_bytes().to_vec()),
        ("shop/views.py", b"from .models import Book\n\ndef index(request):\n    return Book.objects.all()\n".to_vec()),
        ("shop/urls.py", b"from . import views\nurlpatterns = []\n".to_vec()),
        ("go.mod", b"module example.com/shop\n".to_vec()),
        ("cmd/main.go", b"package main\nimport \"example.com/shop/internal/store\"\nfunc main() { store.Open() }\n".to_vec()),
        ("internal/store/store.go", b"package store\nfunc Open() {}\n".to_vec()),
        ("crate/src/lib.rs", b"mod graph;\nuse crate::graph::build;\npub fn run() { build(); }\n".to_vec()),
        ("crate/src/graph.rs", b"pub fn build() {}\n".to_vec()),
        ("README.md", b"# Shop\n\nDocs.\n".to_vec()),
        // Everything below must be ignored.
        ("node_modules/react/index.js", b"export default {}".to_vec()),
        ("dist/bundle.js", b"function x(){}".to_vec()),
        ("generated/out.ts", b"export const x = 1;".to_vec()),
        (".hidden/secret.py", b"x = 1".to_vec()),
        ("crate/target/debug/build.rs", b"fn main(){}".to_vec()),
        ("assets/logo.png", vec![0x89, b'P', b'N', b'G', 0, 0, 0]),
        ("data/blob.js", vec![b'a', 0, b'b']),
        ("data/huge.json", big.into_bytes()),
    ];
    let refs: Vec<(&str, &[u8])> = files.iter().map(|(p, c)| (*p, c.as_slice())).collect();
    write_tree(&refs)
}

fn edges(graph: &Value, relation: &str) -> BTreeSet<(String, String)> {
    graph["links"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|l| l["relation"] == relation)
        .map(|l| {
            (
                l["source"].as_str().unwrap().to_string(),
                l["target"].as_str().unwrap().to_string(),
            )
        })
        .collect()
}

fn run(dir: &tempfile::TempDir, options: &ScanOptions) -> Value {
    serde_json::to_value(scan(dir.path(), options)).unwrap()
}

#[test]
fn walks_only_project_sources() {
    let dir = polyglot();
    let out = run(&dir, &ScanOptions::default());
    let files: BTreeSet<&str> = out["graphify"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|n| n["file_type"] == "code")
        .map(|n| n["id"].as_str().unwrap())
        .collect();
    let expected: BTreeSet<&str> = [
        "README.md",
        "cmd/main.go",
        "crate/src/graph.rs",
        "crate/src/lib.rs",
        "internal/store/store.go",
        "shop/models.py",
        "shop/urls.py",
        "shop/views.py",
        "web/src/app.ts",
        "web/src/util.ts",
        "web/src/vendor.min.js",
    ]
    .into_iter()
    .collect();
    assert_eq!(
        files, expected,
        "dependency, build, hidden, gitignored and binary files are skipped"
    );
    let stats = &out["stats"];
    assert_eq!(stats["files"], 11);
    assert_eq!(
        stats["skipped_files"], 2,
        "the NUL-containing blob and the 2 MiB file"
    );
    assert_eq!(
        stats["parsed_files"], 9,
        "README and the minified bundle are counted but not parsed"
    );
    assert_eq!(stats["languages"]["TypeScript"]["files"], 2);
    assert_eq!(stats["languages"]["Python"]["files"], 3);
    assert_eq!(stats["languages"]["Markdown"]["lines"], 3);
    assert_eq!(stats["languages"]["Markdown"]["blank"], 1);
}

#[test]
fn builds_import_contains_and_call_edges() {
    let dir = polyglot();
    let out = run(
        &dir,
        &ScanOptions {
            commit: Some("abc123".into()),
            ..ScanOptions::default()
        },
    );
    let graph = &out["graphify"];
    assert_eq!(graph["built_at_commit"], "abc123");
    let imports = edges(graph, "imports");
    let expect = |a: &str, b: &str| (a.to_string(), b.to_string());
    for edge in [
        expect("web/src/app.ts", "web/src/util.ts"),
        expect("shop/views.py", "shop/models.py"),
        expect("shop/urls.py", "shop/views.py"),
        expect("cmd/main.go", "internal/store/store.go"),
        expect("crate/src/lib.rs", "crate/src/graph.rs"),
    ] {
        assert!(
            imports.contains(&edge),
            "missing import {edge:?} in {imports:?}"
        );
    }
    assert_eq!(
        imports.len(),
        5,
        "no edges to external packages: {imports:?}"
    );

    let calls = edges(graph, "calls");
    assert!(
        calls.contains(&expect("web/src/app.ts::main", "web/src/util.ts::util")),
        "cross-file call through an import"
    );
    assert!(
        calls.contains(&expect("web/src/util.ts::util", "web/src/util.ts::helper")),
        "same-file call"
    );
    assert!(calls.contains(&expect(
        "cmd/main.go::main",
        "internal/store/store.go::Open"
    )));
    assert!(calls.contains(&expect(
        "crate/src/lib.rs::run",
        "crate/src/graph.rs::build"
    )));

    assert!(
        edges(graph, "contains").contains(&expect("web/src/util.ts", "web/src/util.ts::helper"))
    );
    // Every link must point at real nodes, or the client drops it.
    let ids: BTreeSet<&str> = graph["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["id"].as_str().unwrap())
        .collect();
    for link in graph["links"].as_array().unwrap() {
        assert!(
            ids.contains(link["source"].as_str().unwrap())
                && ids.contains(link["target"].as_str().unwrap())
        );
    }
}

#[test]
fn nodes_carry_what_the_client_adapter_reads() {
    let dir = polyglot();
    let out = run(&dir, &ScanOptions::default());
    let node = out["graphify"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "web/src/util.ts::helper")
        .unwrap()
        .clone();
    assert_eq!(node["label"], "helper()");
    assert_eq!(node["file_type"], "function");
    assert_eq!(node["source_file"], "web/src/util.ts");
    assert_eq!(node["source_location"], "L2");
    assert_eq!(node["community_name"], "web/src");
    assert_eq!(node["language"], "TypeScript");
    assert!(node["community"].is_u64());
}

#[test]
fn introspects_django_models() {
    let dir = polyglot();
    let out = run(&dir, &ScanOptions::default());
    let models: Vec<&str> = out["models"]
        .as_array()
        .unwrap()
        .iter()
        .map(|m| m["name"].as_str().unwrap())
        .collect();
    assert_eq!(
        models,
        ["Abstract", "Author", "Book"],
        "Meta and plain classes are not models"
    );
    let book = out["models"]
        .as_array()
        .unwrap()
        .iter()
        .find(|m| m["name"] == "Book")
        .unwrap();
    assert_eq!(book["file"], "shop/models.py");
    let fields: Vec<(String, String)> = book["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|f| {
            (
                f["name"].as_str().unwrap().into(),
                f["type"].as_str().unwrap().into(),
            )
        })
        .collect();
    assert_eq!(
        fields,
        [
            ("title".into(), "CharField".into()),
            ("author".into(), "ForeignKey".into()),
            ("tags".into(), "ManyToManyField".into()),
            ("publisher".into(), "ForeignKey".into())
        ]
    );
    let relationships: Vec<(String, String, String, String)> = out["relationships"]
        .as_array()
        .unwrap()
        .iter()
        .map(|r| {
            (
                r["source"].as_str().unwrap().into(),
                r["target"].as_str().unwrap().into(),
                r["type"].as_str().unwrap().into(),
                r["field"].as_str().unwrap().into(),
            )
        })
        .collect();
    assert!(relationships.contains(&(
        "Book".into(),
        "Author".into(),
        "ForeignKey".into(),
        "author".into()
    )));
    assert!(
        relationships.contains(&(
            "Book".into(),
            "Tag".into(),
            "ManyToManyField".into(),
            "tags".into()
        )),
        "to= keyword"
    );
    assert!(
        relationships.contains(&(
            "Book".into(),
            "Publisher".into(),
            "ForeignKey".into(),
            "publisher".into()
        )),
        "bare name"
    );
    assert!(relationships.contains(&(
        "Author".into(),
        "settings.AUTH_USER_MODEL".into(),
        "OneToOneField".into(),
        "user".into()
    )));
    assert_eq!(out["views"], serde_json::json!(["shop/views.py"]));
    assert_eq!(out["urls"], serde_json::json!(["shop/urls.py"]));
}

#[test]
fn output_is_deterministic() {
    let dir = polyglot();
    let mut a = run(&dir, &ScanOptions::default());
    let mut b = run(&dir, &ScanOptions::default());
    a["stats"]["duration_ms"] = 0.into();
    b["stats"]["duration_ms"] = 0.into();
    assert_eq!(a, b);
}

#[test]
fn caps_nodes_and_links_keeping_files_first() {
    let dir = polyglot();
    let out = run(
        &dir,
        &ScanOptions {
            max_nodes: 11,
            max_links: 3,
            ..ScanOptions::default()
        },
    );
    let graph = &out["graphify"];
    assert_eq!(graph["truncated"], true);
    let nodes = graph["nodes"].as_array().unwrap();
    assert_eq!(nodes.len(), 11);
    assert!(
        nodes.iter().all(|n| n["file_type"] == "code"),
        "file nodes survive the cap before symbols"
    );
    let links = graph["links"].as_array().unwrap();
    assert_eq!(links.len(), 3);
    assert!(
        links.iter().all(|l| l["relation"] == "imports"),
        "import edges are kept first"
    );
}

#[test]
fn respects_the_file_size_limit() {
    let dir = write_tree(&[("a.py", b"def a():\n    pass\n"), ("b.py", &[b'#'; 600])]);
    let out = run(
        &dir,
        &ScanOptions {
            max_file_bytes: 500,
            ..ScanOptions::default()
        },
    );
    assert_eq!(out["stats"]["files"], 1);
    assert_eq!(out["stats"]["skipped_files"], 1);
}

#[test]
fn empty_and_non_utf8_repositories() {
    let empty = tempfile::tempdir().unwrap();
    let out = run(&empty, &ScanOptions::default());
    assert_eq!(out["stats"]["files"], 0);
    assert_eq!(out["graphify"]["nodes"], serde_json::json!([]));

    let latin1 = write_tree(&[("a.py", b"# caf\xe9\ndef f():\n    pass\n")]);
    let out = run(&latin1, &ScanOptions::default());
    assert_eq!(
        out["stats"]["symbols"], 1,
        "invalid UTF-8 is decoded lossily, not dropped"
    );
}

#[test]
fn duplicate_symbol_names_get_unique_ids() {
    let dir = write_tree(&[("a.py", b"class A:\n    def run(self):\n        pass\n\nclass B:\n    def run(self):\n        pass\n")]);
    let out = run(&dir, &ScanOptions::default());
    let ids: Vec<&str> = out["graphify"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n["id"].as_str().unwrap())
        .collect();
    assert_eq!(
        ids,
        ["a.py", "a.py::A", "a.py::run", "a.py::B", "a.py::run@L6"]
    );
}

#[test]
fn ambiguous_calls_stay_unlinked() {
    let dir = write_tree(&[
        ("a.py", b"def run():\n    pass\n"),
        ("b.py", b"def run():\n    pass\n"),
        ("c.py", b"def main():\n    run()\n"),
    ]);
    let out = run(&dir, &ScanOptions::default());
    assert!(
        edges(&out["graphify"], "calls").is_empty(),
        "two candidate definitions and no import: no guess"
    );
}

#[test]
fn scans_a_large_repository_quickly() {
    // 2,000 files, 200k lines: a release build does this in well under a second.
    let sources: Vec<(String, String)> = (0..2000)
        .map(|i| {
            let body: String = (0..100)
                .map(|j| format!("def f{i}_{j}(x):\n    return g{i}(x)\n"))
                .collect();
            (
                format!("pkg{}/m{i}.py", i % 20),
                format!("from .m{} import *\n{body}", (i + 1) % 2000),
            )
        })
        .collect();
    let refs: Vec<(&str, &[u8])> = sources
        .iter()
        .map(|(p, c)| (p.as_str(), c.as_bytes()))
        .collect();
    let dir = write_tree(&refs);
    let started = std::time::Instant::now();
    let out = run(&dir, &ScanOptions::default());
    assert_eq!(out["stats"]["files"], 2000);
    assert_eq!(out["stats"]["symbols"], 200_000);
    assert!(
        started.elapsed().as_secs() < 60,
        "scan took {:?}",
        started.elapsed()
    );
}

#[cfg(unix)]
#[test]
fn never_follows_symlinks_out_of_the_repository() {
    let outside = write_tree(&[("secret.py", b"def leaked():\n    pass\n")]);
    let repo = write_tree(&[("a.py", b"def a():\n    pass\n")]);
    std::os::unix::fs::symlink(
        outside.path().join("secret.py"),
        repo.path().join("link.py"),
    )
    .unwrap();
    std::os::unix::fs::symlink(outside.path(), repo.path().join("linked_dir")).unwrap();
    let out = run(&repo, &ScanOptions::default());
    assert_eq!(out["stats"]["files"], 1);
    assert_eq!(out["stats"]["symbols"], 1);
}
