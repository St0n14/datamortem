// Test script for Rust sandbox
// Verifies environment variables and basic functionality

use std::env;
use std::fs::File;
use std::io::Write;
use std::path::Path;

fn main() {
    println!("=== Rust Sandbox Test ===");
    println!("Rust version: {}", env!("CARGO_PKG_RUST_VERSION", "unknown"));
    println!();

    // Test environment variables
    println!("=== Environment Variables ===");
    let case_id = env::var("CASE_ID").unwrap_or_else(|_| "NOT_SET".to_string());
    let evidence_uid = env::var("EVIDENCE_UID").unwrap_or_else(|_| "NOT_SET".to_string());
    let evidence_path = env::var("EVIDENCE_PATH").unwrap_or_else(|_| "NOT_SET".to_string());
    let output_dir = env::var("OUTPUT_DIR").unwrap_or_else(|_| "NOT_SET".to_string());

    println!("CASE_ID: {}", case_id);
    println!("EVIDENCE_UID: {}", evidence_uid);
    println!("EVIDENCE_PATH: {}", evidence_path);
    println!("OUTPUT_DIR: {}", output_dir);
    println!();

    // Test output directory write
    if output_dir != "NOT_SET" {
        let output_path = Path::new(&output_dir).join("test_output_rust.txt");
        match File::create(&output_path) {
            Ok(mut file) => {
                let content = format!(
                    "Test output from Rust sandbox\nCase ID: {}\nEvidence UID: {}\n",
                    case_id, evidence_uid
                );
                match file.write_all(content.as_bytes()) {
                    Ok(_) => println!("✓ Output file written: {:?}", output_path),
                    Err(e) => println!("✗ Output write failed: {}", e),
                }
            }
            Err(e) => println!("✗ Output file creation failed: {}", e),
        }
    } else {
        println!("⚠ OUTPUT_DIR not set, skipping file write test");
    }

    println!();
    println!("=== Test Complete ===");
    println!("Exit code: 0");
}
