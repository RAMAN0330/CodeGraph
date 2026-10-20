//! Turns one source file into symbols, call references and raw imports.

use crate::django::{self, Model, Relationship};
use crate::lang::LangSpec;
use serde::Serialize;
use std::cell::RefCell;
use std::time::{Duration, Instant};
use tree_sitter::{ParseOptions, Parser, QueryCursor, StreamingIterator, Tree};

/// A grammar this slow on one file is pathological (generated code); its file still counts in stats.
const PARSE_BUDGET: Duration = Duration::from_secs(5);

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Symbol {
    pub name: String,
    pub kind: String,
    pub line: usize,
    pub end_line: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reference {
    pub name: String,
    pub line: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportKind {
    /// Resolved with the language's import style.
    Module,
    /// A path relative to the importing file (`require_relative`, `include`, `source`).
    Relative,
    /// Rust `mod foo;`, which names a sibling or child file.
    RustMod,
}

/// One import, with the specs to try in order (`from a import b` tries `a.b`, then `a`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Import {
    pub candidates: Vec<String>,
    pub kind: ImportKind,
}

#[derive(Debug, Default)]
pub struct FileFacts {
    pub symbols: Vec<Symbol>,
    pub references: Vec<Reference>,
    pub imports: Vec<Import>,
    pub models: Vec<Model>,
    pub relationships: Vec<Relationship>,
    pub parsed: bool,
}

thread_local! {
    static PARSER: RefCell<Parser> = RefCell::new(Parser::new());
}

/// Parses `src` and extracts everything the graph needs. Returns `parsed: false` when the
/// language has no grammar or the parse ran out of budget.
pub fn extract(spec: &LangSpec, rel_path: &str, src: &str) -> FileFacts {
    let Some(queries) = spec.queries() else {
        return FileFacts::default();
    };
    let Some(tree) = parse(&queries.language, src) else {
        return FileFacts::default();
    };
    let bytes = src.as_bytes();
    let mut facts = FileFacts {
        parsed: true,
        ..FileFacts::default()
    };

    let mut cursor = QueryCursor::new();
    let names = queries.tags.capture_names();
    let mut matches = cursor.matches(&queries.tags, tree.root_node(), bytes);
    while let Some(m) = matches.next() {
        let mut name = None;
        let mut role = None;
        for capture in m.captures {
            let capture_name = names[capture.index as usize];
            if capture_name == "name" {
                name = capture.node.utf8_text(bytes).ok();
            } else if let Some(kind) = capture_name.strip_prefix("definition.") {
                role = Some((true, kind, capture.node));
            } else if let Some(kind) = capture_name.strip_prefix("reference.") {
                role = Some((false, kind, capture.node));
            }
        }
        let (Some(name), Some((is_def, kind, node))) = (name, role) else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() {
            continue;
        }
        let line = node.start_position().row + 1;
        if is_def {
            facts.symbols.push(Symbol {
                name: name.to_string(),
                kind: kind.to_string(),
                line,
                end_line: node.end_position().row + 1,
            });
        } else if kind == "call" || kind == "class" {
            facts.references.push(Reference {
                name: name.to_string(),
                line,
            });
        }
    }
    // Doc-comment patterns can match one definition more than once.
    facts
        .symbols
        .sort_by(|a, b| (a.line, &a.name, &a.kind).cmp(&(b.line, &b.name, &b.kind)));
    facts
        .symbols
        .dedup_by(|a, b| a.line == b.line && a.name == b.name);
    facts
        .references
        .sort_by(|a, b| (a.line, &a.name).cmp(&(b.line, &b.name)));
    facts.references.dedup();

    facts.imports = imports(spec, &queries.imports, &tree, bytes);

    if spec.name == "Python" && django::is_models_file(rel_path) {
        let (models, relationships) = django::introspect(&tree, bytes, rel_path);
        facts.models = models;
        facts.relationships = relationships;
    }
    facts
}

fn parse(language: &tree_sitter::Language, src: &str) -> Option<Tree> {
    PARSER.with(|parser| {
        let mut parser = parser.borrow_mut();
        parser.set_language(language).ok()?;
        let start = Instant::now();
        let mut over_budget = |_: &tree_sitter::ParseState| start.elapsed() > PARSE_BUDGET;
        let bytes = src.as_bytes();
        let tree = parser.parse_with_options(
            &mut |offset, _| &bytes[offset.min(bytes.len())..],
            None,
            Some(ParseOptions::new().progress_callback(&mut over_budget)),
        );
        parser.reset();
        tree
    })
}

fn imports(spec: &LangSpec, query: &tree_sitter::Query, tree: &Tree, bytes: &[u8]) -> Vec<Import> {
    let names = query.capture_names();
    let mut cursor = QueryCursor::new();
    let mut out: Vec<Import> = Vec::new();
    let mut matches = cursor.matches(query, tree.root_node(), bytes);
    while let Some(m) = matches.next() {
        let mut module = None;
        let mut member = None;
        for capture in m.captures {
            let Ok(text) = capture.node.utf8_text(bytes) else {
                continue;
            };
            match names[capture.index as usize] {
                "import" => out.push(Import {
                    candidates: vec![clean_import(spec.name, text)],
                    kind: ImportKind::Module,
                }),
                "relative" => out.push(Import {
                    candidates: vec![unquote(text).to_string()],
                    kind: ImportKind::Relative,
                }),
                "mod" => out.push(Import {
                    candidates: vec![text.to_string()],
                    kind: ImportKind::RustMod,
                }),
                "module" => module = Some(text),
                "name" => member = Some(text),
                _ => {}
            }
        }
        if let (Some(module), Some(member)) = (module, member) {
            let joined = if module.ends_with('.') {
                format!("{module}{member}")
            } else {
                format!("{module}.{member}")
            };
            out.push(Import {
                candidates: vec![joined, module.to_string()],
                kind: ImportKind::Module,
            });
        }
    }
    out.retain(|import| !import.candidates[0].is_empty());
    out.dedup();
    out
}

fn unquote(text: &str) -> &str {
    text.trim()
        .trim_matches(|c| matches!(c, '"' | '\'' | '`' | '<' | '>'))
}

/// Reduces an import node's text to the module path it names.
pub fn clean_import(language: &str, text: &str) -> String {
    let mut s = unquote(text).trim();
    // `global using static X;` stacks keywords, so strip them in order.
    for keyword in ["global ", "import ", "using ", "static "] {
        s = s.strip_prefix(keyword).map(str::trim_start).unwrap_or(s);
    }
    let s = s.trim_end_matches(';');
    // Aliases (`x as y`, `using Y = X`) and selector lists (`a::{b, c}`, `a.{b, c}`) keep only the path.
    let s = s.split(" as ").next().unwrap_or(s);
    let s = if language == "C#" {
        s.rsplit_once('=').map(|(_, rhs)| rhs).unwrap_or(s).trim()
    } else {
        s
    };
    let s = s.split('{').next().unwrap_or(s);
    let s = if language == "Rust" {
        s.trim_end_matches("::*").trim_end_matches("::")
    } else {
        s
    };
    let s = s
        .trim_end_matches(".*")
        .trim_end_matches("._")
        .trim_end_matches('.')
        .trim_end_matches('\\');
    unquote(s.trim_start_matches('\\')).to_string()
}

#[cfg(test)]
mod tests {
    use super::clean_import;

    #[test]
    fn cleans_import_nodes_to_paths() {
        assert_eq!(
            clean_import("Java", "import java.util.List;"),
            "java.util.List"
        );
        assert_eq!(
            clean_import("Java", "import static org.junit.Assert.*;"),
            "org.junit.Assert"
        );
        assert_eq!(clean_import("Kotlin", "import a.b.C as D"), "a.b.C");
        assert_eq!(
            clean_import("Scala", "import scala.collection.{mutable, immutable}"),
            "scala.collection"
        );
        assert_eq!(clean_import("Scala", "import a.b._"), "a.b");
        assert_eq!(
            clean_import("Rust", "crate::graph::{build, Graph}"),
            "crate::graph"
        );
        assert_eq!(clean_import("Rust", "super::lang::*"), "super::lang");
        assert_eq!(clean_import("Rust", "std::io as stdio"), "std::io");
        assert_eq!(
            clean_import("PHP", "\\App\\Models\\User as U"),
            "App\\Models\\User"
        );
        assert_eq!(
            clean_import("C#", "using static System.Math;"),
            "System.Math"
        );
        assert_eq!(
            clean_import("C#", "using Json = Newtonsoft.Json;"),
            "Newtonsoft.Json"
        );
        assert_eq!(clean_import("JavaScript", "'./util'"), "./util");
        assert_eq!(clean_import("C", "\"lib/util.h\""), "lib/util.h");
    }
}
