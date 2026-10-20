#![allow(dead_code)]
use codegraph_engine::lang;
use codegraph_engine::parse::{self, FileFacts};
use std::path::Path;

/// Parses `src` as if it lived at `path`.
pub fn facts(path: &str, src: &str) -> FileFacts {
    let spec = lang::detect(Path::new(path)).unwrap_or_else(|| panic!("no language for {path}"));
    parse::extract(spec, path, src)
}

/// `name:kind` for every definition, in source order.
pub fn defs(path: &str, src: &str) -> Vec<String> {
    facts(path, src)
        .symbols
        .iter()
        .map(|s| format!("{}:{}", s.name, s.kind))
        .collect()
}

pub fn calls(path: &str, src: &str) -> Vec<String> {
    facts(path, src)
        .references
        .iter()
        .map(|r| r.name.clone())
        .collect()
}

pub fn imports(path: &str, src: &str) -> Vec<String> {
    facts(path, src)
        .imports
        .iter()
        .map(|i| i.candidates[0].clone())
        .collect()
}

/// Writes `files` under a fresh temp dir and returns it.
pub fn write_tree(files: &[(&str, &[u8])]) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    for (path, contents) in files {
        let full = dir.path().join(path);
        std::fs::create_dir_all(full.parent().unwrap()).unwrap();
        std::fs::write(full, contents).unwrap();
    }
    dir
}
