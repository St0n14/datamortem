#!/usr/bin/env python3
"""
Test script for Python sandbox.
Verifies environment variables, file access, and output writing.
"""
import os
import sys
from datetime import datetime

def main():
    print("=== Python Sandbox Test ===")
    print(f"Python version: {sys.version}")
    print(f"Timestamp: {datetime.utcnow().isoformat()}")
    print()

    # Test environment variables
    print("=== Environment Variables ===")
    case_id = os.getenv("CASE_ID", "NOT_SET")
    evidence_uid = os.getenv("EVIDENCE_UID", "NOT_SET")
    evidence_path = os.getenv("EVIDENCE_PATH", "NOT_SET")
    output_dir = os.getenv("OUTPUT_DIR", "NOT_SET")

    print(f"CASE_ID: {case_id}")
    print(f"EVIDENCE_UID: {evidence_uid}")
    print(f"EVIDENCE_PATH: {evidence_path}")
    print(f"OUTPUT_DIR: {output_dir}")
    print()

    # Test pandas import (pre-installed library)
    try:
        import pandas as pd
        print(f"✓ pandas {pd.__version__} imported successfully")
    except ImportError as e:
        print(f"✗ pandas import failed: {e}")

    # Test dissect import (forensic library)
    try:
        import dissect
        print(f"✓ dissect imported successfully")
    except ImportError as e:
        print(f"✗ dissect import failed: {e}")

    # Test output directory write
    if output_dir and output_dir != "NOT_SET":
        try:
            output_file = os.path.join(output_dir, "test_output.txt")
            with open(output_file, "w") as f:
                f.write(f"Test output from Python sandbox\n")
                f.write(f"Case ID: {case_id}\n")
                f.write(f"Evidence UID: {evidence_uid}\n")
                f.write(f"Timestamp: {datetime.utcnow().isoformat()}\n")
            print(f"✓ Output file written: {output_file}")
        except Exception as e:
            print(f"✗ Output write failed: {e}")
    else:
        print("⚠ OUTPUT_DIR not set, skipping file write test")

    print()
    print("=== Test Complete ===")
    print("Exit code: 0")
    return 0

if __name__ == "__main__":
    sys.exit(main())
