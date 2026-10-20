//! Builds the Graphify-shaped node/link payload the client renders.

use crate::scan::{FileRecord, ScanOptions};
use serde::Serialize;
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Node {
    pub id: String,
    pub label: String,
    pub file_type: String,
    pub source_file: String,
    pub source_location: String,
    pub community: usize,
    pub community_name: String,
    pub language: String,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Link {
    pub source: String,
    pub target: String,
    pub relation: &'static str,
    pub confidence: &'static str,
    pub confidence_score: f32,
    pub source_file: String,
    pub source_location: String,
}

#[derive(Debug, Default, Serialize)]
pub struct Graph {
    pub nodes: Vec<Node>,
    pub links: Vec<Link>,
    pub hyperedges: Vec<serde_json::Value>,
    pub built_at_commit: Option<String>,
    /// True when `max_nodes` or `max_links` cut the graph short.
    pub truncated: bool,
}

/// Groups files by their first two directories, so `src/api/x.ts` lands in `src/api`.
fn community_name(path: &str) -> String {
    let dirs: Vec<&str> = path.split('/').collect();
    match dirs.len() {
        0 | 1 => ".".to_string(),
        2 => dirs[0].to_string(),
        _ => format!("{}/{}", dirs[0], dirs[1]),
    }
}

fn symbol_label(name: &str, kind: &str) -> String {
    if matches!(kind, "function" | "method" | "macro") {
        format!("{name}()")
    } else {
        name.to_string()
    }
}

pub fn build(records: &[FileRecord], resolved: &[Vec<String>], options: &ScanOptions) -> Graph {
    let communities: BTreeMap<String, usize> = {
        let names: std::collections::BTreeSet<String> =
            records.iter().map(|r| community_name(&r.path)).collect();
        names
            .into_iter()
            .enumerate()
            .map(|(i, name)| (name, i))
            .collect()
    };
    let mut graph = Graph {
        built_at_commit: options.commit.clone(),
        ..Graph::default()
    };

    // symbol_ids[file][symbol] is that symbol's node id.
    let mut symbol_ids: Vec<Vec<String>> = Vec::with_capacity(records.len());
    let mut taken: HashSet<String> = records.iter().map(|r| r.path.clone()).collect();
    let mut files = Vec::with_capacity(records.len());
    let mut symbols = Vec::new();
    for record in records {
        let community_name = community_name(&record.path);
        let community = communities[&community_name];
        let base = |id: String, label: String, file_type: &str, line: usize| Node {
            id,
            label,
            file_type: file_type.to_string(),
            source_file: record.path.clone(),
            source_location: format!("L{line}"),
            community,
            community_name: community_name.clone(),
            language: record.lang.name.to_string(),
        };
        let label = record
            .path
            .rsplit('/')
            .next()
            .unwrap_or(&record.path)
            .to_string();
        files.push(base(record.path.clone(), label, "code", 1));
        let mut ids = Vec::with_capacity(record.facts.symbols.len());
        for symbol in &record.facts.symbols {
            let mut id = format!("{}::{}", record.path, symbol.name);
            if !taken.insert(id.clone()) {
                id = format!("{id}@L{}", symbol.line);
                taken.insert(id.clone());
            }
            symbols.push(base(
                id.clone(),
                symbol_label(&symbol.name, &symbol.kind),
                &symbol.kind,
                symbol.line,
            ));
            ids.push(id);
        }
        symbol_ids.push(ids);
    }
    // Files first: when the cap bites, keep the module graph and drop the finest detail.
    let total = files.len() + symbols.len();
    graph.nodes = files
        .into_iter()
        .chain(symbols)
        .take(options.max_nodes)
        .collect();
    graph.truncated = total > graph.nodes.len();
    let kept: HashSet<&str> = graph.nodes.iter().map(|n| n.id.as_str()).collect();

    let link =
        |source: &str, target: &str, relation, confidence, score, file: &str, line: usize| Link {
            source: source.to_string(),
            target: target.to_string(),
            relation,
            confidence,
            confidence_score: score,
            source_file: file.to_string(),
            source_location: format!("L{line}"),
        };
    let mut imports = Vec::new();
    let mut contains = Vec::new();
    for (i, record) in records.iter().enumerate() {
        for target in &resolved[i] {
            imports.push(link(
                &record.path,
                target,
                "imports",
                "EXTRACTED",
                1.0,
                &record.path,
                1,
            ));
        }
        for (symbol, id) in record.facts.symbols.iter().zip(&symbol_ids[i]) {
            contains.push(link(
                &record.path,
                id,
                "contains",
                "EXTRACTED",
                1.0,
                &record.path,
                symbol.line,
            ));
        }
    }
    let calls = call_links(records, resolved, &symbol_ids, &link);

    let mut links: Vec<Link> = imports
        .into_iter()
        .chain(contains)
        .chain(calls)
        .filter(|l| kept.contains(l.source.as_str()) && kept.contains(l.target.as_str()))
        .collect();
    if links.len() > options.max_links {
        links.truncate(options.max_links);
        graph.truncated = true;
    }
    graph.links = links;
    graph
}

type LinkFn<'a> = dyn Fn(&str, &str, &'static str, &'static str, f32, &str, usize) -> Link + 'a;

/// Links each call site to the definition it names: same file first, then the files it imports,
/// then a definition that is unique in the repository. Ambiguous names are left unlinked.
fn call_links(
    records: &[FileRecord],
    resolved: &[Vec<String>],
    symbol_ids: &[Vec<String>],
    link: &LinkFn,
) -> Vec<Link> {
    let index_of: HashMap<&str, usize> = records
        .iter()
        .enumerate()
        .map(|(i, r)| (r.path.as_str(), i))
        .collect();
    let mut by_name: HashMap<&str, Vec<(usize, usize)>> = HashMap::new();
    for (f, record) in records.iter().enumerate() {
        for (s, symbol) in record.facts.symbols.iter().enumerate() {
            by_name
                .entry(symbol.name.as_str())
                .or_default()
                .push((f, s));
        }
    }
    let mut out = Vec::new();
    for (f, record) in records.iter().enumerate() {
        let imported: HashSet<usize> = resolved[f]
            .iter()
            .filter_map(|p| index_of.get(p.as_str()).copied())
            .collect();
        let mut seen = HashSet::new();
        for reference in &record.facts.references {
            let Some(defs) = by_name.get(reference.name.as_str()) else {
                continue;
            };
            let pick = |filter: &dyn Fn(usize) -> bool| -> Option<(usize, usize)> {
                let mut hits = defs.iter().filter(|(df, _)| filter(*df));
                let first = hits.next().copied();
                if hits.next().is_some() {
                    None
                } else {
                    first
                }
            };
            let (target, score) = if defs.iter().any(|(df, _)| *df == f) {
                match pick(&|df| df == f) {
                    Some(t) => (t, 0.95),
                    None => continue,
                }
            } else if let Some(t) = pick(&|df| imported.contains(&df)) {
                (t, 0.9)
            } else if defs.len() == 1 && reference.name.len() > 2 {
                (defs[0], 0.6)
            } else {
                continue;
            };
            // The caller is the innermost definition spanning the call, or the file itself.
            let caller = record
                .facts
                .symbols
                .iter()
                .enumerate()
                .filter(|(_, s)| s.line <= reference.line && reference.line <= s.end_line)
                .min_by_key(|(_, s)| s.end_line - s.line)
                .map(|(s, _)| symbol_ids[f][s].as_str())
                .unwrap_or(record.path.as_str());
            let target_id = symbol_ids[target.0][target.1].as_str();
            if caller != target_id && seen.insert((caller, target_id)) {
                out.push(link(
                    caller,
                    target_id,
                    "calls",
                    "INFERRED",
                    score,
                    &record.path,
                    reference.line,
                ));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::community_name;

    #[test]
    fn communities_use_two_directory_levels() {
        assert_eq!(community_name("main.rs"), ".");
        assert_eq!(community_name("src/main.rs"), "src");
        assert_eq!(community_name("src/api/routes/x.ts"), "src/api");
    }
}
