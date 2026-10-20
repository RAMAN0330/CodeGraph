//! Language detection and the per-language tree-sitter grammars and queries.

use std::path::Path;
use std::sync::OnceLock;
use tree_sitter::{Language, Query};

/// How an import string maps onto files in the repository.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportStyle {
    /// `./a`, `../b`, bare packages and `@/` aliases (JS/TS).
    Path,
    /// `a.b.c` dotted modules (Python, Java, Kotlin, Scala, Lua).
    Dotted,
    /// `crate::a::b` (Rust).
    Rust,
    /// `github.com/org/repo/pkg` package directories (Go).
    GoPackage,
    /// `"dir/file.h"` relative to the file, then anywhere in the repo (C, C++).
    Include,
    /// `Foo\Bar\Baz` namespaces mapped PSR-4 style (PHP).
    Backslash,
    /// Imports that name namespaces or modules, not files (C#, Swift, Bash).
    None,
}

pub struct Grammar {
    pub language: fn() -> Language,
    /// Captures `@name` with `@definition.<kind>` / `@reference.<kind>`.
    pub tags: &'static [&'static str],
    /// Captures `@import` (and Python's `@module` / `@name` pairs).
    pub imports: &'static str,
    pub import_style: ImportStyle,
    /// Extensions tried when an import omits one, in priority order.
    pub resolve_exts: &'static [&'static str],
}

pub struct LangSpec {
    pub name: &'static str,
    pub grammar: Option<Grammar>,
    queries: OnceLock<Option<Queries>>,
}

impl LangSpec {
    /// The compiled queries, built once per process on first use.
    pub fn queries(&self) -> Option<&Queries> {
        let grammar = self.grammar.as_ref()?;
        self.queries
            .get_or_init(|| Queries::compile(self.name, grammar))
            .as_ref()
    }
}

pub struct Queries {
    pub language: Language,
    pub tags: Query,
    pub imports: Query,
}

impl Queries {
    fn compile(name: &str, grammar: &Grammar) -> Option<Queries> {
        let language = (grammar.language)();
        let tags = Query::new(&language, &grammar.tags.concat());
        let imports = Query::new(&language, grammar.imports);
        match (tags, imports) {
            (Ok(tags), Ok(imports)) => Some(Queries {
                language,
                tags,
                imports,
            }),
            (tags, imports) => {
                // Only reachable if a grammar upgrade breaks a query; the tests compile every one.
                eprintln!(
                    "codegraph-engine: {name} queries failed to compile: {:?} {:?}",
                    tags.err(),
                    imports.err()
                );
                None
            }
        }
    }
}

const JS_IMPORTS: &str = r#"
(import_statement source: (string) @import)
(export_statement source: (string) @import)
(call_expression function: (identifier) @_f arguments: (arguments . (string) @import) (#eq? @_f "require"))
(call_expression function: (import) arguments: (arguments . (string) @import))
"#;

const TS_EXTRA_TAGS: &str = r#"
(interface_declaration name: (type_identifier) @name) @definition.interface
(type_alias_declaration name: (type_identifier) @name) @definition.type
(enum_declaration name: (identifier) @name) @definition.enum
(abstract_class_declaration name: (type_identifier) @name) @definition.class
"#;

/// Call sites for grammars whose bundled tags query only lists definitions.
const C_CALLS: &str = r#"
(call_expression function: (identifier) @name) @reference.call
(call_expression function: (field_expression field: (field_identifier) @name)) @reference.call
"#;

const CPP_CALLS: &str = r#"
(call_expression function: (identifier) @name) @reference.call
(call_expression function: (field_expression field: (field_identifier) @name)) @reference.call
(call_expression function: (qualified_identifier name: (identifier) @name)) @reference.call
"#;

const CSHARP_CALLS: &str = r#"
(invocation_expression function: (identifier) @name) @reference.call
(invocation_expression function: (member_access_expression name: (identifier) @name)) @reference.call
(object_creation_expression type: (identifier) @name) @reference.class
"#;

const PHP_CALLS: &str = r#"
(function_call_expression function: (name) @name) @reference.call
(member_call_expression name: (name) @name) @reference.call
(scoped_call_expression name: (name) @name) @reference.call
(object_creation_expression (name) @name) @reference.class
"#;

const SWIFT_CALLS: &str = r#"
(call_expression . (simple_identifier) @name) @reference.call
(call_expression . (navigation_expression suffix: (navigation_suffix suffix: (simple_identifier) @name))) @reference.call
"#;

const KOTLIN_TAGS: &str = r#"
(class_declaration name: (_) @name) @definition.class
(object_declaration name: (_) @name) @definition.class
(function_declaration name: (_) @name) @definition.function
(call_expression . (identifier) @name) @reference.call
"#;

const SCALA_TAGS: &str = r#"
(class_definition name: (_) @name) @definition.class
(object_definition name: (_) @name) @definition.class
(trait_definition name: (_) @name) @definition.interface
(function_definition name: (_) @name) @definition.function
(function_declaration name: (_) @name) @definition.function
(call_expression function: (identifier) @name) @reference.call
"#;

const BASH_TAGS: &str = r#"
(function_definition name: (word) @name) @definition.function
(command name: (command_name (word) @name)) @reference.call
"#;

macro_rules! grammar {
    ($lang:expr, [$($tags:expr),+], $imports:expr, $style:expr, [$($ext:expr),*]) => {
        Some(Grammar {
            language: || $lang.into(),
            tags: &[$($tags),+],
            imports: $imports,
            import_style: $style,
            resolve_exts: &[$($ext),*],
        })
    };
}

macro_rules! plain {
    ($name:expr) => {
        LangSpec {
            name: $name,
            grammar: None,
            queries: OnceLock::new(),
        }
    };
}

static RUST: LangSpec = LangSpec {
    name: "Rust",
    grammar: grammar!(
        tree_sitter_rust::LANGUAGE,
        [tree_sitter_rust::TAGS_QUERY],
        "(use_declaration argument: (_) @import) (mod_item name: (identifier) @mod !body)",
        ImportStyle::Rust,
        ["rs"]
    ),
    queries: OnceLock::new(),
};
static PYTHON: LangSpec = LangSpec {
    name: "Python",
    grammar: grammar!(
        tree_sitter_python::LANGUAGE,
        [tree_sitter_python::TAGS_QUERY],
        r#"(import_statement name: (dotted_name) @import)
           (import_statement name: (aliased_import name: (dotted_name) @import))
           (import_from_statement module_name: (_) @module name: (dotted_name) @name)
           (import_from_statement module_name: (_) @module name: (aliased_import name: (dotted_name) @name))
           (import_from_statement module_name: (_) @import (wildcard_import))"#,
        ImportStyle::Dotted,
        ["py", "pyi"]
    ),
    queries: OnceLock::new(),
};
static JAVASCRIPT: LangSpec = LangSpec {
    name: "JavaScript",
    grammar: grammar!(
        tree_sitter_javascript::LANGUAGE,
        [tree_sitter_javascript::TAGS_QUERY],
        JS_IMPORTS,
        ImportStyle::Path,
        ["js", "jsx", "mjs", "cjs", "ts", "tsx", "json"]
    ),
    queries: OnceLock::new(),
};
static TYPESCRIPT: LangSpec = LangSpec {
    name: "TypeScript",
    grammar: grammar!(
        tree_sitter_typescript::LANGUAGE_TYPESCRIPT,
        [
            tree_sitter_javascript::TAGS_QUERY,
            tree_sitter_typescript::TAGS_QUERY,
            TS_EXTRA_TAGS
        ],
        JS_IMPORTS,
        ImportStyle::Path,
        ["ts", "tsx", "d.ts", "js", "jsx", "mjs", "json"]
    ),
    queries: OnceLock::new(),
};
static TSX: LangSpec = LangSpec {
    name: "TSX",
    grammar: grammar!(
        tree_sitter_typescript::LANGUAGE_TSX,
        [
            tree_sitter_javascript::TAGS_QUERY,
            tree_sitter_typescript::TAGS_QUERY,
            TS_EXTRA_TAGS
        ],
        JS_IMPORTS,
        ImportStyle::Path,
        ["tsx", "ts", "jsx", "js", "json"]
    ),
    queries: OnceLock::new(),
};
static GO: LangSpec = LangSpec {
    name: "Go",
    grammar: grammar!(
        tree_sitter_go::LANGUAGE,
        [tree_sitter_go::TAGS_QUERY],
        "(import_spec path: (interpreted_string_literal) @import)",
        ImportStyle::GoPackage,
        ["go"]
    ),
    queries: OnceLock::new(),
};
static JAVA: LangSpec = LangSpec {
    name: "Java",
    grammar: grammar!(
        tree_sitter_java::LANGUAGE,
        [tree_sitter_java::TAGS_QUERY],
        "(import_declaration) @import",
        ImportStyle::Dotted,
        ["java"]
    ),
    queries: OnceLock::new(),
};
static C: LangSpec = LangSpec {
    name: "C",
    grammar: grammar!(
        tree_sitter_c::LANGUAGE,
        [tree_sitter_c::TAGS_QUERY, C_CALLS],
        "(preproc_include path: (string_literal) @import)",
        ImportStyle::Include,
        ["h", "c"]
    ),
    queries: OnceLock::new(),
};
static CPP: LangSpec = LangSpec {
    name: "C++",
    grammar: grammar!(
        tree_sitter_cpp::LANGUAGE,
        [tree_sitter_cpp::TAGS_QUERY, CPP_CALLS],
        "(preproc_include path: (string_literal) @import)",
        ImportStyle::Include,
        ["h", "hpp", "hh", "hxx", "cpp"]
    ),
    queries: OnceLock::new(),
};
static CSHARP: LangSpec = LangSpec {
    name: "C#",
    grammar: grammar!(
        tree_sitter_c_sharp::LANGUAGE,
        [tree_sitter_c_sharp::TAGS_QUERY, CSHARP_CALLS],
        "(using_directive) @import",
        ImportStyle::None,
        []
    ),
    queries: OnceLock::new(),
};
static RUBY: LangSpec = LangSpec {
    name: "Ruby",
    grammar: grammar!(
        tree_sitter_ruby::LANGUAGE,
        [tree_sitter_ruby::TAGS_QUERY],
        r#"(call method: (identifier) @_m arguments: (argument_list . (string (string_content) @import)) (#eq? @_m "require"))
           (call method: (identifier) @_m arguments: (argument_list . (string (string_content) @relative)) (#eq? @_m "require_relative"))"#,
        ImportStyle::Path,
        ["rb"]
    ),
    queries: OnceLock::new(),
};
static PHP: LangSpec = LangSpec {
    name: "PHP",
    grammar: grammar!(
        tree_sitter_php::LANGUAGE_PHP,
        [tree_sitter_php::TAGS_QUERY, PHP_CALLS],
        r#"(namespace_use_clause) @import
           (include_expression (string (string_content) @relative))
           (include_once_expression (string (string_content) @relative))
           (require_expression (string (string_content) @relative))
           (require_once_expression (string (string_content) @relative))"#,
        ImportStyle::Backslash,
        ["php"]
    ),
    queries: OnceLock::new(),
};
static BASH: LangSpec = LangSpec {
    name: "Shell",
    grammar: grammar!(
        tree_sitter_bash::LANGUAGE,
        [BASH_TAGS],
        r#"(command name: (command_name (word) @_c) argument: (word) @relative (#match? @_c "^(source|\\.)$"))"#,
        ImportStyle::None,
        ["sh", "bash"]
    ),
    queries: OnceLock::new(),
};
static SCALA: LangSpec = LangSpec {
    name: "Scala",
    grammar: grammar!(
        tree_sitter_scala::LANGUAGE,
        [SCALA_TAGS],
        "(import_declaration) @import",
        ImportStyle::Dotted,
        ["scala", "sc"]
    ),
    queries: OnceLock::new(),
};
static KOTLIN: LangSpec = LangSpec {
    name: "Kotlin",
    grammar: grammar!(
        tree_sitter_kotlin_ng::LANGUAGE,
        [KOTLIN_TAGS],
        "(import) @import",
        ImportStyle::Dotted,
        ["kt", "kts"]
    ),
    queries: OnceLock::new(),
};
static SWIFT: LangSpec = LangSpec {
    name: "Swift",
    grammar: grammar!(
        tree_sitter_swift::LANGUAGE,
        [tree_sitter_swift::TAGS_QUERY, SWIFT_CALLS],
        "(import_declaration) @import",
        ImportStyle::None,
        []
    ),
    queries: OnceLock::new(),
};
static LUA: LangSpec = LangSpec {
    name: "Lua",
    grammar: grammar!(
        tree_sitter_lua::LANGUAGE,
        [tree_sitter_lua::TAGS_QUERY],
        r#"(function_call name: (identifier) @_f arguments: (arguments . (string content: (string_content) @import)) (#eq? @_f "require"))"#,
        ImportStyle::Dotted,
        ["lua"]
    ),
    queries: OnceLock::new(),
};

/// Every language with a grammar, for tests and the `languages` CLI listing.
pub static PARSED: [&LangSpec; 17] = [
    &RUST,
    &PYTHON,
    &JAVASCRIPT,
    &TYPESCRIPT,
    &TSX,
    &GO,
    &JAVA,
    &C,
    &CPP,
    &CSHARP,
    &RUBY,
    &PHP,
    &BASH,
    &SCALA,
    &KOTLIN,
    &SWIFT,
    &LUA,
];

/// Languages counted in stats but not parsed into symbols.
static PLAIN: [(&str, LangSpec); 77] = [
    ("m", plain!("Objective-C")),
    ("mm", plain!("Objective-C++")),
    ("dart", plain!("Dart")),
    ("ex", plain!("Elixir")),
    ("exs", plain!("Elixir")),
    ("erl", plain!("Erlang")),
    ("hrl", plain!("Erlang")),
    ("hs", plain!("Haskell")),
    ("ml", plain!("OCaml")),
    ("mli", plain!("OCaml")),
    ("fs", plain!("F#")),
    ("fsx", plain!("F#")),
    ("clj", plain!("Clojure")),
    ("cljs", plain!("Clojure")),
    ("cljc", plain!("Clojure")),
    ("r", plain!("R")),
    ("jl", plain!("Julia")),
    ("pl", plain!("Perl")),
    ("pm", plain!("Perl")),
    ("zig", plain!("Zig")),
    ("nim", plain!("Nim")),
    ("cr", plain!("Crystal")),
    ("v", plain!("V")),
    ("groovy", plain!("Groovy")),
    ("gradle", plain!("Groovy")),
    ("vb", plain!("Visual Basic")),
    ("ps1", plain!("PowerShell")),
    ("psm1", plain!("PowerShell")),
    ("bat", plain!("Batch")),
    ("cmd", plain!("Batch")),
    ("sql", plain!("SQL")),
    ("proto", plain!("Protocol Buffers")),
    ("graphql", plain!("GraphQL")),
    ("gql", plain!("GraphQL")),
    ("tf", plain!("Terraform")),
    ("hcl", plain!("HCL")),
    ("sol", plain!("Solidity")),
    ("vue", plain!("Vue")),
    ("svelte", plain!("Svelte")),
    ("astro", plain!("Astro")),
    ("html", plain!("HTML")),
    ("htm", plain!("HTML")),
    ("css", plain!("CSS")),
    ("scss", plain!("SCSS")),
    ("sass", plain!("Sass")),
    ("less", plain!("Less")),
    ("json", plain!("JSON")),
    ("yaml", plain!("YAML")),
    ("yml", plain!("YAML")),
    ("toml", plain!("TOML")),
    ("xml", plain!("XML")),
    ("md", plain!("Markdown")),
    ("mdx", plain!("MDX")),
    ("rst", plain!("reStructuredText")),
    ("ipynb", plain!("Jupyter Notebook")),
    ("asm", plain!("Assembly")),
    ("s", plain!("Assembly")),
    ("cu", plain!("CUDA")),
    ("f90", plain!("Fortran")),
    ("f", plain!("Fortran")),
    ("cob", plain!("COBOL")),
    ("pas", plain!("Pascal")),
    ("ada", plain!("Ada")),
    ("adb", plain!("Ada")),
    ("elm", plain!("Elm")),
    ("purs", plain!("PureScript")),
    ("rkt", plain!("Racket")),
    ("scm", plain!("Scheme")),
    ("lisp", plain!("Lisp")),
    ("el", plain!("Emacs Lisp")),
    ("vim", plain!("Vim Script")),
    ("cmake", plain!("CMake")),
    ("mk", plain!("Makefile")),
    ("nix", plain!("Nix")),
    ("prisma", plain!("Prisma")),
    ("ini", plain!("INI")),
    ("cfg", plain!("INI")),
];

static PLAIN_NAMES: [(&str, LangSpec); 9] = [
    ("Dockerfile", plain!("Dockerfile")),
    ("Makefile", plain!("Makefile")),
    ("CMakeLists.txt", plain!("CMake")),
    ("Jenkinsfile", plain!("Groovy")),
    ("Gemfile", plain!("Ruby")),
    ("Rakefile", plain!("Ruby")),
    ("BUILD", plain!("Starlark")),
    ("WORKSPACE", plain!("Starlark")),
    ("Vagrantfile", plain!("Ruby")),
];

/// Detects a file's language from its name, or `None` for files that aren't source or config.
pub fn detect(path: &Path) -> Option<&'static LangSpec> {
    let file_name = path.file_name()?.to_str()?;
    if let Some((_, spec)) = PLAIN_NAMES.iter().find(|(name, _)| *name == file_name) {
        return Some(spec);
    }
    if file_name.starts_with("Dockerfile.") {
        return Some(&PLAIN_NAMES[0].1);
    }
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    let parsed: &'static LangSpec = match ext.as_str() {
        "rs" => &RUST,
        "py" | "pyw" | "pyi" => &PYTHON,
        "js" | "jsx" | "mjs" | "cjs" => &JAVASCRIPT,
        "ts" | "mts" | "cts" => &TYPESCRIPT,
        "tsx" => &TSX,
        "go" => &GO,
        "java" => &JAVA,
        "c" => &C,
        // `.h` is shared by C and C++; the C++ grammar parses both.
        "h" | "cc" | "cpp" | "cxx" | "c++" | "hpp" | "hh" | "hxx" | "ino" => &CPP,
        "cs" => &CSHARP,
        "rb" | "rake" | "gemspec" => &RUBY,
        "php" | "phtml" => &PHP,
        "sh" | "bash" | "zsh" => &BASH,
        "scala" | "sc" => &SCALA,
        "kt" | "kts" => &KOTLIN,
        "swift" => &SWIFT,
        "lua" => &LUA,
        _ => return PLAIN.iter().find(|(e, _)| *e == ext).map(|(_, spec)| spec),
    };
    Some(parsed)
}
