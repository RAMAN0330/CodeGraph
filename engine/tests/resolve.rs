//! Import resolution across languages and repository layouts.

use codegraph_engine::lang;
use codegraph_engine::parse::{Import, ImportKind};
use codegraph_engine::resolve::Resolver;
use std::path::Path;

const FILES: &[&str] = &[
    // JS / TS
    "web/src/app.ts",
    "web/src/util.ts",
    "web/src/lib/index.ts",
    "web/src/lib/a.tsx",
    "web/src/types.d.ts",
    "web/src/legacy.js",
    "web/src/data.json",
    "web/src/styles.css",
    // Python
    "py/pkg/__init__.py",
    "py/pkg/core.py",
    "py/pkg/sub/__init__.py",
    "py/pkg/sub/mod.py",
    "py/app.py",
    "py/other/json.py",
    "tests/test_core.py",
    "src/lib2/thing.py",
    // Go
    "go.mod",
    "cmd/main.go",
    "internal/store/store.go",
    "internal/store/cache.go",
    "internal/store/store_test.go",
    // Rust
    "rs/src/lib.rs",
    "rs/src/graph.rs",
    "rs/src/graph/build.rs",
    "rs/src/parse/mod.rs",
    "rs/src/parse/query.rs",
    // Java / Kotlin
    "jv/src/main/java/com/acme/App.java",
    "jv/src/main/java/com/acme/util/Strings.java",
    "kt/src/com/acme/Thing.kt",
    // C / C++
    "c/src/main.c",
    "c/src/util.h",
    "c/include/lib/x.hpp",
    "c/src/deep/a.cpp",
    // Ruby / PHP / Lua / Shell
    "rb/lib/app.rb",
    "rb/lib/app/helper.rb",
    "php/src/Models/User.php",
    "php/src/Http/Controller.php",
    "php/boot.php",
    "lua/a/b.lua",
    "lua/main.lua",
    "sh/run.sh",
    "sh/lib.sh",
];

fn resolver() -> Resolver {
    let go_mods = vec![(
        "go.mod".to_string(),
        "module example.com/shop\n\ngo 1.22\n".to_string(),
    )];
    Resolver::new(FILES.iter().copied(), &go_mods)
}

fn resolve(from: &str, spec: &str) -> Vec<String> {
    resolve_kind(from, &[spec], ImportKind::Module)
}

fn resolve_kind(from: &str, candidates: &[&str], kind: ImportKind) -> Vec<String> {
    let lang = lang::detect(Path::new(from)).unwrap();
    let import = Import {
        candidates: candidates.iter().map(|c| c.to_string()).collect(),
        kind,
    };
    let mut found = resolver().resolve(from, lang, &import);
    found.sort();
    found
}

#[test]
fn javascript_and_typescript_paths() {
    assert_eq!(resolve("web/src/app.ts", "./util"), ["web/src/util.ts"]);
    assert_eq!(
        resolve("web/src/app.ts", "./lib"),
        ["web/src/lib/index.ts"],
        "directory imports use index files"
    );
    assert_eq!(resolve("web/src/lib/a.tsx", "../util"), ["web/src/util.ts"]);
    assert_eq!(
        resolve("web/src/app.ts", "./util.js"),
        ["web/src/util.ts"],
        "ESM-style .js specifiers map to .ts sources"
    );
    assert_eq!(resolve("web/src/app.ts", "./types"), ["web/src/types.d.ts"]);
    assert_eq!(resolve("web/src/app.ts", "./legacy"), ["web/src/legacy.js"]);
    assert_eq!(
        resolve("web/src/app.ts", "./data.json"),
        ["web/src/data.json"]
    );
    assert_eq!(
        resolve("web/src/app.ts", "./styles.css"),
        ["web/src/styles.css"]
    );
    assert_eq!(
        resolve("web/src/lib/a.tsx", "@/util"),
        ["web/src/util.ts"],
        "@/ aliases resolve from the source root"
    );
    assert!(
        resolve("web/src/app.ts", "react").is_empty(),
        "bare packages are external"
    );
    assert!(
        resolve("web/src/app.ts", "@scope/pkg/util").is_empty(),
        "scoped packages are external"
    );
    assert!(
        resolve("web/src/app.ts", "../../../../etc/passwd").is_empty(),
        "paths cannot climb out of the repo"
    );
    assert!(resolve("web/src/app.ts", "./missing").is_empty());
}

#[test]
fn python_modules() {
    assert_eq!(
        resolve_kind("py/app.py", &["pkg.core"], ImportKind::Module),
        ["py/pkg/core.py"]
    );
    assert_eq!(
        resolve_kind(
            "py/app.py",
            &["pkg.core.Thing", "pkg.core"],
            ImportKind::Module
        ),
        ["py/pkg/core.py"],
        "`from pkg.core import Thing`"
    );
    assert_eq!(
        resolve_kind("py/app.py", &["pkg.sub", "pkg"], ImportKind::Module),
        ["py/pkg/sub/__init__.py"],
        "`from pkg import sub` prefers the submodule"
    );
    assert_eq!(
        resolve_kind("py/app.py", &["pkg"], ImportKind::Module),
        ["py/pkg/__init__.py"]
    );
    assert_eq!(
        resolve_kind("py/pkg/core.py", &[".sub.mod"], ImportKind::Module),
        ["py/pkg/sub/mod.py"]
    );
    assert_eq!(
        resolve_kind("py/pkg/sub/mod.py", &["..core"], ImportKind::Module),
        ["py/pkg/core.py"]
    );
    assert_eq!(
        resolve_kind("py/pkg/sub/mod.py", &["..", ".."], ImportKind::Module),
        ["py/pkg/__init__.py"]
    );
    assert!(
        resolve("py/app.py", "json").is_empty(),
        "a stdlib name must not bind to an unrelated py/other/json.py"
    );
    assert!(resolve("py/app.py", "os").is_empty());
    assert_eq!(
        resolve("tests/test_core.py", "lib2.thing"),
        ["src/lib2/thing.py"],
        "src-layout packages resolve from tests/"
    );
}

#[test]
fn go_packages_via_go_mod() {
    assert_eq!(
        resolve("cmd/main.go", "example.com/shop/internal/store"),
        ["internal/store/cache.go", "internal/store/store.go"]
    );
    assert!(resolve("cmd/main.go", "fmt").is_empty());
    assert!(
        resolve("cmd/main.go", "github.com/other/internal/store").is_empty(),
        "other modules are external"
    );
}

#[test]
fn rust_modules() {
    assert_eq!(
        resolve_kind("rs/src/lib.rs", &["graph"], ImportKind::RustMod),
        ["rs/src/graph.rs"]
    );
    assert_eq!(
        resolve_kind("rs/src/lib.rs", &["parse"], ImportKind::RustMod),
        ["rs/src/parse/mod.rs"]
    );
    assert_eq!(
        resolve_kind("rs/src/graph.rs", &["build"], ImportKind::RustMod),
        ["rs/src/graph/build.rs"]
    );
    assert_eq!(
        resolve("rs/src/lib.rs", "crate::graph::Graph"),
        ["rs/src/graph.rs"]
    );
    assert_eq!(
        resolve("rs/src/parse/query.rs", "crate::graph::build"),
        ["rs/src/graph/build.rs"]
    );
    assert_eq!(
        resolve("rs/src/parse/query.rs", "super::super::graph"),
        ["rs/src/graph.rs"]
    );
    assert_eq!(
        resolve("rs/src/graph.rs", "self::build::run"),
        ["rs/src/graph/build.rs"]
    );
    assert!(resolve("rs/src/lib.rs", "std::collections").is_empty());
}

#[test]
fn jvm_imports() {
    assert_eq!(
        resolve(
            "jv/src/main/java/com/acme/App.java",
            "com.acme.util.Strings"
        ),
        ["jv/src/main/java/com/acme/util/Strings.java"]
    );
    assert_eq!(
        resolve(
            "jv/src/main/java/com/acme/App.java",
            "com.acme.util.Strings.join"
        ),
        ["jv/src/main/java/com/acme/util/Strings.java"],
        "static member imports"
    );
    assert!(resolve("jv/src/main/java/com/acme/App.java", "java.util.List").is_empty());
}

#[test]
fn c_includes() {
    assert_eq!(resolve("c/src/main.c", "util.h"), ["c/src/util.h"]);
    assert_eq!(
        resolve("c/src/deep/a.cpp", "lib/x.hpp"),
        ["c/include/lib/x.hpp"],
        "include dirs are found by suffix"
    );
    assert_eq!(resolve("c/src/deep/a.cpp", "../util.h"), ["c/src/util.h"]);
}

#[test]
fn ruby_php_lua_shell() {
    assert_eq!(
        resolve_kind("rb/lib/app.rb", &["app/helper"], ImportKind::Relative),
        ["rb/lib/app/helper.rb"]
    );
    assert_eq!(
        resolve("rb/lib/app.rb", "app/helper"),
        ["rb/lib/app/helper.rb"],
        "require uses the load path"
    );
    assert_eq!(
        resolve("php/src/Http/Controller.php", "App\\Models\\User"),
        ["php/src/Models/User.php"],
        "PSR-4 namespace roots"
    );
    assert_eq!(
        resolve_kind(
            "php/boot.php",
            &["src/Models/User.php"],
            ImportKind::Relative
        ),
        ["php/src/Models/User.php"]
    );
    assert_eq!(resolve("lua/main.lua", "a.b"), ["lua/a/b.lua"]);
    assert_eq!(
        resolve_kind("sh/run.sh", &["./lib.sh"], ImportKind::Relative),
        ["sh/lib.sh"]
    );
}

#[test]
fn never_resolves_to_the_importing_file() {
    assert!(resolve("web/src/util.ts", "./util").is_empty());
}
