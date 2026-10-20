use codegraph_engine::{scan, server};
use std::path::PathBuf;
use std::process::ExitCode;

const USAGE: &str =
    "usage: codegraph-engine [serve [--port N] | scan <path> [--pretty] | languages]";

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str).unwrap_or("serve") {
        "serve" => {
            let flag = args
                .iter()
                .position(|a| a == "--port")
                .and_then(|i| args.get(i + 1))
                .cloned();
            let port = flag
                .or_else(|| std::env::var("PORT").ok())
                .and_then(|p| p.parse().ok())
                .unwrap_or(8000);
            match server::serve(port).await {
                Ok(()) => ExitCode::SUCCESS,
                Err(e) => {
                    eprintln!("codegraph-engine: {e}");
                    ExitCode::FAILURE
                }
            }
        }
        "scan" => {
            let Some(path) = args.get(1).map(PathBuf::from).filter(|p| p.is_dir()) else {
                eprintln!("{USAGE}");
                return ExitCode::from(2);
            };
            let analysis = tokio::task::spawn_blocking(move || {
                scan::scan(&path, &scan::ScanOptions::default())
            })
            .await
            .unwrap();
            let out = if args.iter().any(|a| a == "--pretty") {
                serde_json::to_string_pretty(&analysis)
            } else {
                serde_json::to_string(&analysis)
            };
            println!("{}", out.unwrap());
            ExitCode::SUCCESS
        }
        "languages" => {
            for spec in codegraph_engine::lang::PARSED {
                println!("{}", spec.name);
            }
            ExitCode::SUCCESS
        }
        _ => {
            eprintln!("{USAGE}");
            ExitCode::from(2)
        }
    }
}
