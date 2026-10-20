//! Maps raw import strings onto files in the repository.

use crate::lang::{ImportStyle, LangSpec};
use crate::parse::{Import, ImportKind};
use std::collections::{HashMap, HashSet};

pub struct Resolver {
    files: HashSet<String>,
    /// Every trailing segment run of each file's extensionless path (`a/b/c`, `b/c`, `c`).
    /// Package entry files (`__init__.py`, `index.ts`, `mod.rs`) also register their directory.
    stems: HashMap<String, Vec<String>>,
    /// Go module path -> directory holding its go.mod ("" for the repo root).
    go_modules: Vec<(String, String)>,
    go_dirs: HashMap<String, Vec<String>>,
}

fn dir_of(path: &str) -> &str {
    path.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("")
}

fn join(dir: &str, rel: &str) -> String {
    if dir.is_empty() {
        rel.to_string()
    } else {
        format!("{dir}/{rel}")
    }
}

/// Resolves `.` and `..` segments; `None` if the path climbs out of the repository.
fn normalize(path: &str) -> Option<String> {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            _ => parts.push(part),
        }
    }
    Some(parts.join("/"))
}

fn stem(path: &str) -> &str {
    let name_start = path.rfind('/').map(|i| i + 1).unwrap_or(0);
    let stem = path.strip_suffix(".d.ts").unwrap_or(path);
    match stem[name_start..].rfind('.') {
        Some(dot) if dot > 0 => &stem[..name_start + dot],
        _ => stem,
    }
}

fn extension(path: &str) -> &str {
    let name = &path[path.rfind('/').map(|i| i + 1).unwrap_or(0)..];
    name.rfind('.').map(|i| &name[i + 1..]).unwrap_or("")
}

const PACKAGE_ENTRIES: [&str; 3] = ["__init__", "index", "mod"];

/// Whether `entry.ext` is a directory's package entry in its language (`mod.py` is not).
fn is_package_entry(entry: &str, ext: &str) -> bool {
    match entry {
        "__init__" => matches!(ext, "py" | "pyi"),
        "mod" => ext == "rs",
        "index" => !matches!(ext, "py" | "pyi" | "rs"),
        _ => false,
    }
}

impl Resolver {
    /// `files` are repo-relative paths with `/` separators; `go_mods` are (go.mod path, contents).
    pub fn new<'a>(
        files: impl IntoIterator<Item = &'a str>,
        go_mods: &[(String, String)],
    ) -> Resolver {
        let mut resolver = Resolver {
            files: HashSet::new(),
            stems: HashMap::new(),
            go_modules: Vec::new(),
            go_dirs: HashMap::new(),
        };
        for file in files {
            resolver.files.insert(file.to_string());
            let mut key = stem(file);
            if let Some((dir, name)) = key.rsplit_once('/') {
                if is_package_entry(name, extension(file)) {
                    resolver.add_suffixes(dir, file);
                }
            }
            loop {
                resolver
                    .stems
                    .entry(key.to_string())
                    .or_default()
                    .push(file.to_string());
                match key.split_once('/') {
                    Some((_, rest)) => key = rest,
                    None => break,
                }
            }
            if extension(file) == "go" && !file.ends_with("_test.go") {
                resolver
                    .go_dirs
                    .entry(dir_of(file).to_string())
                    .or_default()
                    .push(file.to_string());
            }
        }
        for (path, contents) in go_mods {
            let module = contents
                .lines()
                .find_map(|line| line.trim().strip_prefix("module "))
                .map(|m| m.trim().trim_matches('"'));
            if let Some(module) = module.filter(|m| !m.is_empty()) {
                resolver
                    .go_modules
                    .push((module.to_string(), dir_of(path).to_string()));
            }
        }
        // Longest module path first so nested modules win over their parent.
        resolver
            .go_modules
            .sort_by_key(|m| std::cmp::Reverse(m.0.len()));
        resolver
    }

    fn add_suffixes(&mut self, path: &str, file: &str) {
        let mut key = path;
        loop {
            self.stems
                .entry(key.to_string())
                .or_default()
                .push(file.to_string());
            match key.split_once('/') {
                Some((_, rest)) => key = rest,
                None => break,
            }
        }
    }

    /// Repo files `import` refers to; empty when it is external or unresolvable.
    pub fn resolve(&self, from: &str, spec: &LangSpec, import: &Import) -> Vec<String> {
        let Some(grammar) = spec.grammar.as_ref() else {
            return Vec::new();
        };
        let exts = grammar.resolve_exts;
        let dir = dir_of(from);
        for candidate in &import.candidates {
            let found = match import.kind {
                ImportKind::Relative => normalize(&join(dir, candidate))
                    .and_then(|p| self.with_exts(&p, exts))
                    .into_iter()
                    .collect(),
                ImportKind::RustMod => self
                    .rust_path(&rust_module_dir(from), &[candidate.as_str()])
                    .into_iter()
                    .collect(),
                ImportKind::Module => self.module(from, grammar.import_style, exts, candidate),
            };
            if !found.is_empty() {
                return found.into_iter().filter(|f| f != from).collect();
            }
        }
        Vec::new()
    }

    fn module(&self, from: &str, style: ImportStyle, exts: &[&str], spec: &str) -> Vec<String> {
        let dir = dir_of(from);
        match style {
            ImportStyle::Path => {
                if spec.starts_with("./") || spec.starts_with("../") || spec == "." || spec == ".."
                {
                    return normalize(&join(dir, spec))
                        .and_then(|p| self.with_exts(&p, exts))
                        .into_iter()
                        .collect();
                }
                let aliased = spec.strip_prefix("@/").or_else(|| spec.strip_prefix("~/"));
                // Bare names are packages (`react`, `@scope/pkg`); only paths with a slash can be local.
                let local = aliased
                    .or_else(|| (spec.contains('/') && !spec.starts_with('@')).then_some(spec));
                local
                    .and_then(|p| {
                        self.by_suffix(from, strip_known_ext(p, exts), exts, aliased.is_some())
                    })
                    .into_iter()
                    .collect()
            }
            ImportStyle::Dotted => {
                let dots = spec.chars().take_while(|c| *c == '.').count();
                let rest = spec[dots..].replace('.', "/");
                if dots > 0 {
                    let mut base = dir.to_string();
                    for _ in 1..dots {
                        base = dir_of(&base).to_string();
                    }
                    let path = if rest.is_empty() {
                        base
                    } else {
                        join(&base, &rest)
                    };
                    return self.with_exts(&path, exts).into_iter().collect();
                }
                // `import a.b.C.member` names a member of C, so retry one segment up.
                self.by_suffix(from, &rest, exts, false)
                    .or_else(|| {
                        rest.rsplit_once('/')
                            .and_then(|(parent, _)| self.by_suffix(from, parent, exts, false))
                    })
                    .into_iter()
                    .collect()
            }
            ImportStyle::Backslash => {
                let path = spec.replace('\\', "/");
                // PSR-4 maps a namespace prefix onto a source directory, so leading segments may be absent.
                let mut key = path.as_str();
                loop {
                    if let Some(hit) = self.by_suffix(from, key, exts, true) {
                        return vec![hit];
                    }
                    match key.split_once('/') {
                        Some((_, rest)) if rest.contains('/') => key = rest,
                        _ => return Vec::new(),
                    }
                }
            }
            ImportStyle::Include => {
                let relative = normalize(&join(dir, spec)).filter(|p| self.files.contains(p));
                relative
                    .or_else(|| self.by_suffix(from, stem(spec), &[extension(spec)], true))
                    .into_iter()
                    .collect()
            }
            ImportStyle::Rust => self.rust_use(from, spec).into_iter().collect(),
            ImportStyle::GoPackage => self.go_package(spec),
            ImportStyle::None => Vec::new(),
        }
    }

    /// `path` itself, `path.<ext>`, or a package entry inside `path/`.
    fn with_exts(&self, path: &str, exts: &[&str]) -> Option<String> {
        if self.files.contains(path) {
            return Some(path.to_string());
        }
        let bare = strip_known_ext(path, exts);
        for base in [path, bare] {
            for ext in exts {
                let file = format!("{base}.{ext}");
                if self.files.contains(&file) {
                    return Some(file);
                }
            }
        }
        for entry in PACKAGE_ENTRIES {
            for ext in exts.iter().filter(|ext| is_package_entry(entry, ext)) {
                let file = join(path, &format!("{entry}.{ext}"));
                if self.files.contains(&file) {
                    return Some(file);
                }
            }
        }
        None
    }

    /// Finds the file whose path ends in `key`. A match counts when the part of its path before
    /// `key` is an ancestor of the importing file (that is where the import root lives); otherwise
    /// only a unique, multi-segment match is trusted (or any unique match when `trust_unique`).
    fn by_suffix(
        &self,
        from: &str,
        key: &str,
        exts: &[&str],
        trust_unique: bool,
    ) -> Option<String> {
        let hits: Vec<&String> = self
            .stems
            .get(key)?
            .iter()
            .filter(|f| exts.contains(&extension(f)))
            .collect();
        let root_of = |file: &str| -> String {
            let entry_dir = stem(file);
            let base = if entry_dir.ends_with(key) {
                entry_dir
            } else {
                dir_of(entry_dir)
            };
            base.strip_suffix(key)
                .unwrap_or("")
                .trim_end_matches('/')
                .to_string()
        };
        let mut rooted: Vec<(usize, &String)> = hits
            .iter()
            .filter_map(|file| {
                let root = root_of(file);
                (root.is_empty() || from.starts_with(&format!("{root}/")))
                    .then_some((root.len(), *file))
            })
            .collect();
        // Deepest root first, then the shortest (non-index) file.
        rooted.sort_by(|a, b| {
            b.0.cmp(&a.0)
                .then(a.1.len().cmp(&b.1.len()))
                .then(a.1.cmp(b.1))
        });
        if let Some((_, file)) = rooted.first() {
            return Some((*file).clone());
        }
        let unique = hits.len() == 1 && (trust_unique || key.contains('/'));
        unique.then(|| hits[0].clone())
    }

    fn rust_use(&self, from: &str, spec: &str) -> Option<String> {
        let mut segments: Vec<&str> = spec.split("::").filter(|s| !s.is_empty()).collect();
        let base = match segments.first().copied()? {
            "crate" => {
                segments.remove(0);
                rust_crate_root(from)
            }
            "self" => {
                segments.remove(0);
                rust_module_dir(from)
            }
            "super" => {
                let mut base = rust_module_dir(from);
                while segments.first() == Some(&"super") {
                    segments.remove(0);
                    base = dir_of(&base).to_string();
                }
                base
            }
            // Crate-relative paths without `crate::` (2015 edition, or a sibling module).
            _ => rust_module_dir(from),
        };
        // The tail may name an item (`crate::a::B`), so walk back until a module file matches.
        while !segments.is_empty() {
            if let Some(file) = self.rust_path(&base, &segments) {
                return Some(file);
            }
            segments.pop();
        }
        None
    }

    fn rust_path(&self, base: &str, segments: &[&str]) -> Option<String> {
        let path = join(base, &segments.join("/"));
        [format!("{path}.rs"), format!("{path}/mod.rs")]
            .into_iter()
            .find(|f| self.files.contains(f))
    }

    fn go_package(&self, spec: &str) -> Vec<String> {
        for (module, dir) in &self.go_modules {
            let rest = if spec == module {
                Some("")
            } else {
                spec.strip_prefix(&format!("{module}/"))
            };
            if let Some(rest) = rest {
                let pkg_dir = if rest.is_empty() {
                    dir.clone()
                } else {
                    join(dir, rest)
                };
                return self.go_dirs.get(&pkg_dir).cloned().unwrap_or_default();
            }
        }
        Vec::new()
    }
}

fn strip_known_ext<'a>(path: &'a str, exts: &[&str]) -> &'a str {
    let ext = extension(path);
    if !ext.is_empty() && (exts.contains(&ext) || matches!(ext, "js" | "mjs" | "cjs" | "jsx")) {
        &path[..path.len() - ext.len() - 1]
    } else {
        path
    }
}

/// Directory holding the crate root (`src/` for most crates).
fn rust_crate_root(from: &str) -> String {
    let mut dir = dir_of(from);
    loop {
        if dir == "src" || dir.ends_with("/src") {
            return dir.to_string();
        }
        if dir.is_empty() {
            return dir_of(from).to_string();
        }
        dir = dir_of(dir);
    }
}

/// Directory where a file's child modules live: `a/` for `a.rs`, the file's own dir for
/// `mod.rs`, `lib.rs` and `main.rs`.
fn rust_module_dir(from: &str) -> String {
    let name = from.rsplit('/').next().unwrap_or(from);
    if matches!(name, "mod.rs" | "lib.rs" | "main.rs") || dir_of(from).ends_with("/bin") {
        dir_of(from).to_string()
    } else {
        stem(from).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_rejects_escapes() {
        assert_eq!(normalize("a/./b/../c").as_deref(), Some("a/c"));
        assert_eq!(normalize("../x"), None);
        assert_eq!(stem("src/types.d.ts"), "src/types");
        assert_eq!(stem("src/.eslintrc"), "src/.eslintrc");
        assert_eq!(extension("a/b.test.ts"), "ts");
    }

    #[test]
    fn rust_module_dirs() {
        assert_eq!(rust_module_dir("src/lib.rs"), "src");
        assert_eq!(rust_module_dir("src/graph.rs"), "src/graph");
        assert_eq!(rust_module_dir("src/graph/mod.rs"), "src/graph");
        assert_eq!(rust_crate_root("crates/x/src/a/b.rs"), "crates/x/src");
    }
}
