#!/usr/bin/env python3
"""
Helper script to trigger indexation for split MFT files.
"""
import sys
import time
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent / "services/api"))

from app.tasks.index_results import index_results_task

def index_split_files(output_dir: str, task_run_id: int, parser_name: str):
    """Index all mft_part_*.jsonl files in the directory."""

    output_path = Path(output_dir)
    files = sorted(output_path.glob("mft_part_*.jsonl"))

    print(f"Found {len(files)} split files to index")

    for i, file_path in enumerate(files, 1):
        file_size_mb = file_path.stat().st_size / (1024 * 1024)
        print(f"[{i}/{len(files)}] Indexing {file_path.name} ({file_size_mb:.1f}MB)...")

        try:
            result = index_results_task.delay(
                task_run_id=task_run_id,
                file_path=str(file_path),
                parser_name=parser_name
            )
            print(f"  Task ID: {result.id}")
            # Small delay to avoid overwhelming the system
            time.sleep(1)
        except Exception as e:
            print(f"  Error: {e}")

    print(f"\nAll {len(files)} indexation tasks triggered!")
    print("Check Celery logs for progress: docker logs requiem-celery -f")

if __name__ == "__main__":
    # Example usage
    output_dir = "/lake/HOHOGOUTFLAMME/goubite/scripts/met_parser_1"
    task_run_id = 1  # Replace with your actual task_run_id
    parser_name = "custom_script.mft_parser"

    index_split_files(output_dir, task_run_id, parser_name)
