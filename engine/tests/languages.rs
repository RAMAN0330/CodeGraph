//! Per-language extraction: definitions, call sites and imports from real-world shaped snippets.

mod common;
use codegraph_engine::lang::{self, PARSED};
use codegraph_engine::parse::ImportKind;
use common::{calls, defs, facts, imports};
use std::path::Path;

#[test]
fn every_grammar_and_query_compiles() {
    for spec in PARSED {
        assert!(
            spec.queries().is_some(),
            "{} queries failed to compile",
            spec.name
        );
    }
}

#[test]
fn detects_languages_by_extension_and_file_name() {
    let name = |p: &str| lang::detect(Path::new(p)).map(|s| s.name);
    assert_eq!(name("src/main.rs"), Some("Rust"));
    assert_eq!(name("a/B.PY"), Some("Python"));
    assert_eq!(name("x.mjs"), Some("JavaScript"));
    assert_eq!(name("x.cts"), Some("TypeScript"));
    assert_eq!(name("x.tsx"), Some("TSX"));
    assert_eq!(name("x.h"), Some("C++"));
    assert_eq!(name("x.kts"), Some("Kotlin"));
    assert_eq!(name("x.gemspec"), Some("Ruby"));
    assert_eq!(name("x.zsh"), Some("Shell"));
    assert_eq!(name("Dockerfile"), Some("Dockerfile"));
    assert_eq!(name("Dockerfile.prod"), Some("Dockerfile"));
    assert_eq!(name("CMakeLists.txt"), Some("CMake"));
    assert_eq!(name("schema.sql"), Some("SQL"));
    assert_eq!(name("main.tf"), Some("Terraform"));
    assert_eq!(name("App.vue"), Some("Vue"));
    assert_eq!(name("image.png"), None);
    assert_eq!(name("LICENSE"), None);
    assert_eq!(name(".gitignore"), None);
}

#[test]
fn unparsed_languages_yield_no_facts() {
    let f = facts("schema.sql", "CREATE TABLE t (id int);");
    assert!(!f.parsed);
    assert!(f.symbols.is_empty());
}

#[test]
fn rust() {
    let src = "use crate::x::{A, B};\nuse std::io;\nmod foo;\nmod bar { fn inner() {} }\npub struct S;\nimpl S { pub fn m(&self) { helper(); } }\nfn helper() {}\ntrait T {}\nenum E {}\nmacro_rules! mm { () => {} }\n";
    assert_eq!(
        defs("a.rs", src),
        [
            "foo:module",
            "bar:module",
            "inner:function",
            "S:class",
            "m:function",
            "helper:function",
            "T:interface",
            "E:class",
            "mm:macro"
        ]
    );
    assert_eq!(calls("a.rs", src), ["helper"]);
    let f = facts("a.rs", src);
    assert_eq!(imports("a.rs", src), ["crate::x", "std::io", "foo"]);
    assert_eq!(
        f.imports[2].kind,
        ImportKind::RustMod,
        "`mod foo;` names a file; inline `mod bar {{}}` does not"
    );
}

#[test]
fn python() {
    let src = "import os\nimport a.b as ab\nfrom . import util\nfrom .models import User as U\nfrom pkg.sub import *\nclass A(Base):\n    def m(self):\n        helper()\n\ndef helper():\n    pass\n";
    assert_eq!(
        defs("a.py", src),
        ["A:class", "m:function", "helper:function"]
    );
    assert_eq!(calls("a.py", src), ["helper"]);
    let candidates: Vec<Vec<String>> = facts("a.py", src)
        .imports
        .into_iter()
        .map(|i| i.candidates)
        .collect();
    assert_eq!(
        candidates,
        [
            vec!["os"],
            vec!["a.b"],
            vec![".util", "."],
            vec![".models.User", ".models"],
            vec!["pkg.sub"]
        ]
    );
}

#[test]
fn javascript() {
    let src = "import x from './x';\nexport * from './y';\nconst z = require('./z');\nimport('./lazy');\nclass C { method() { f(); } }\nfunction f() {}\nconst g = () => 1;\nmodule.exports = { f };\n";
    assert_eq!(
        defs("a.js", src),
        ["C:class", "method:method", "f:function", "g:function"]
    );
    assert_eq!(calls("a.js", src), ["f"]);
    assert_eq!(imports("a.js", src), ["./x", "./y", "./z", "./lazy"]);
}

#[test]
fn typescript_and_tsx() {
    let src = "import {A} from '@/lib/a';\nimport type {B} from './b';\ninterface I {}\ntype T = string;\nenum E {A}\nabstract class K {}\nexport function f(): void { g(); }\nclass C { m(): void {} }\n";
    assert_eq!(
        defs("a.ts", src),
        [
            "I:interface",
            "T:type",
            "E:enum",
            "K:class",
            "f:function",
            "C:class",
            "m:method"
        ]
    );
    assert_eq!(calls("a.ts", src), ["g"]);
    assert_eq!(imports("a.ts", src), ["@/lib/a", "./b"]);
    let tsx = "import React from 'react';\nexport function App() { return <div>{render()}</div>; }\nexport const Card = () => <span />;\n";
    assert_eq!(defs("a.tsx", tsx), ["App:function", "Card:function"]);
    assert_eq!(calls("a.tsx", tsx), ["render"]);
}

#[test]
fn go() {
    let src = "package main\nimport (\n\t\"fmt\"\n\tp \"example.com/m/pkg\"\n)\ntype S struct{}\nfunc (s S) M() {}\nfunc main() { fmt.Println(); helper() }\nfunc helper() {}\n";
    assert_eq!(
        defs("a.go", src),
        ["S:type", "M:method", "main:function", "helper:function"]
    );
    assert_eq!(calls("a.go", src), ["Println", "helper"]);
    assert_eq!(imports("a.go", src), ["fmt", "example.com/m/pkg"]);
}

#[test]
fn java() {
    let src = "package a;\nimport java.util.List;\nimport static org.junit.Assert.*;\npublic class A { void m() { helper(); } interface I {} }\n";
    assert_eq!(defs("A.java", src), ["A:class", "I:interface", "m:method"]);
    assert_eq!(calls("A.java", src), ["helper"]);
    assert_eq!(
        imports("A.java", src),
        ["java.util.List", "org.junit.Assert"]
    );
}

#[test]
fn c_and_cpp() {
    let c = "#include \"util.h\"\n#include <stdio.h>\nstruct S { int x; };\nint helper(void) { return 0; }\nint main(void) { s.run(); return helper(); }\n";
    assert_eq!(
        defs("a.c", c),
        ["S:class", "helper:function", "main:function"]
    );
    assert_eq!(calls("a.c", c), ["helper", "run"]);
    assert_eq!(
        imports("a.c", c),
        ["util.h"],
        "system headers are not repo files"
    );
    let cpp = "#include \"lib/x.hpp\"\nnamespace n { class C { void m(); }; }\nvoid C::m() { f(); std::sort(); }\nint f() { return 1; }\n";
    assert!(defs("a.cpp", cpp).contains(&"C:class".to_string()));
    assert!(defs("a.cpp", cpp).contains(&"f:function".to_string()));
    assert_eq!(calls("a.cpp", cpp), ["f", "sort"]);
    assert_eq!(imports("a.cpp", cpp), ["lib/x.hpp"]);
}

#[test]
fn csharp() {
    let src = "using System;\nusing static System.Math;\nnamespace N { public class C { void M() { Helper(); var x = new Widget(); } interface I {} } }\n";
    assert_eq!(
        defs("a.cs", src),
        ["C:class", "I:interface", "M:method", "N:module"]
    );
    assert_eq!(calls("a.cs", src), ["Helper", "Widget"]);
    assert_eq!(imports("a.cs", src), ["System", "System.Math"]);
}

#[test]
fn ruby() {
    let src = "require 'json'\nrequire_relative 'lib/x'\nmodule M\n  class C\n    def m\n      helper\n    end\n  end\nend\ndef helper; end\n";
    assert_eq!(
        defs("a.rb", src),
        ["M:module", "C:class", "m:method", "helper:method"]
    );
    assert!(calls("a.rb", src).contains(&"helper".to_string()));
    let f = facts("a.rb", src);
    assert_eq!(imports("a.rb", src), ["json", "lib/x"]);
    assert_eq!(f.imports[1].kind, ImportKind::Relative);
}

#[test]
fn php() {
    let src = "<?php\nnamespace App;\nuse App\\Models\\User;\nrequire_once 'lib/x.php';\nclass C { function m() { helper(); $this->save(); } }\nfunction helper() {}\ninterface I {}\n";
    assert_eq!(
        defs("a.php", src),
        [
            "App:module",
            "C:class",
            "m:function",
            "helper:function",
            "I:interface"
        ]
    );
    assert_eq!(calls("a.php", src), ["helper", "save"]);
    assert_eq!(imports("a.php", src), ["App\\Models\\User", "lib/x.php"]);
}

#[test]
fn shell() {
    let src = "source ./lib.sh\n. ./other.sh\nfoo() { echo hi; }\nfoo\n";
    assert_eq!(defs("a.sh", src), ["foo:function"]);
    assert!(calls("a.sh", src).contains(&"foo".to_string()));
    assert_eq!(imports("a.sh", src), ["./lib.sh", "./other.sh"]);
}

#[test]
fn scala_kotlin_swift_lua() {
    let scala =
        "import a.b.C\nimport a.{x, y}\nobject O { def f(): Int = g() }\nclass K\ntrait T\n";
    assert_eq!(
        defs("a.scala", scala),
        ["O:class", "f:function", "K:class", "T:interface"]
    );
    assert_eq!(calls("a.scala", scala), ["g"]);
    assert_eq!(imports("a.scala", scala), ["a.b.C", "a"]);

    let kotlin = "import a.b.C\nclass K { fun m() { helper() } }\nobject O\nfun helper() {}\n";
    assert_eq!(
        defs("a.kt", kotlin),
        ["K:class", "m:function", "O:class", "helper:function"]
    );
    assert_eq!(calls("a.kt", kotlin), ["helper"]);
    assert_eq!(imports("a.kt", kotlin), ["a.b.C"]);

    let swift = "import Foundation\nclass C { func m() { helper(); self.view.layout() } }\nprotocol P {}\nfunc helper() {}\n";
    assert_eq!(
        defs("a.swift", swift),
        ["C:class", "m:function", "P:interface", "helper:function"]
    );
    assert!(calls("a.swift", swift).contains(&"helper".to_string()));

    let lua = "local x = require(\"a.b\")\nfunction f() g() end\nlocal function g() end\n";
    assert_eq!(defs("a.lua", lua), ["f:function", "g:function"]);
    assert_eq!(imports("a.lua", lua), ["a.b"]);
}

#[test]
fn definition_spans_cover_their_bodies() {
    let f = facts(
        "a.py",
        "def outer():\n    x = 1\n    return x\n\ndef other():\n    pass\n",
    );
    assert_eq!((f.symbols[0].line, f.symbols[0].end_line), (1, 3));
    assert_eq!((f.symbols[1].line, f.symbols[1].end_line), (5, 6));
}

#[test]
fn broken_and_odd_sources_never_panic() {
    for spec in PARSED {
        for src in [
            "",
            "\n\n",
            "}{)(",
            "\u{feff}fn ü() {}",
            "class",
            &"(".repeat(10_000),
            "\0\0\0",
        ] {
            let _ = codegraph_engine::parse::extract(spec, "x", src);
        }
    }
}

#[test]
fn partial_syntax_errors_keep_the_rest_of_the_file() {
    let src = "def good():\n    pass\n\ndef broken(:\n\ndef also_good():\n    pass\n";
    let names: Vec<String> = facts("a.py", src)
        .symbols
        .into_iter()
        .map(|s| s.name)
        .collect();
    assert!(names.contains(&"good".to_string()));
    assert!(names.contains(&"also_good".to_string()));
}
