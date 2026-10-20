//! CodeGraph's analysis engine: a parallel, tree-sitter based repository scanner and the HTTP
//! service the Node API proxies analysis jobs to.

pub mod django;
pub mod graph;
pub mod lang;
pub mod parse;
pub mod resolve;
pub mod scan;
pub mod server;
