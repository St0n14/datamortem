#!/usr/bin/env python
"""
Seed demo data directly into OpenSearch (case index) to test the frontend timeline/explorer.

Usage:
    python scripts/demo_index_os.py --case-id demo_case --events 3000
"""
import argparse
import json
import os
import random
import string
from datetime import datetime, timedelta

import requests


def parse_args():
    parser = argparse.ArgumentParser(description="Seed OpenSearch index with random events for a case.")
    parser.add_argument("--os-url", default=os.environ.get("DM_OPENSEARCH_URL", "http://localhost:9200"),
                        help="OpenSearch base URL (default: http://localhost:9200)")
    parser.add_argument("--case-id", default="demo_case", help="Case identifier (used for index)")
    parser.add_argument("--case-name", default="Demo Case", help="Case name metadata")
parser.add_argument("--events", type=int, default=2000, help="Number of documents to index")
parser.add_argument("--chunk-size", type=int, default=500, help="Bulk chunk size")
parser.add_argument("--evidence-uid", default="demo_evidence", help="Evidence UID metadata")
parser.add_argument("--max-minutes", type=int, default=24 * 60, help="Spread documents over last N minutes")
    return parser.parse_args()


def ensure_index(base_url: str, case_id: str):
    index_name = f"datamortem-case-{case_id}"
    resp = requests.head(f"{base_url}/{index_name}")
    if resp.status_code == 404:
        print(f"[i] Index {index_name} absent, création…")
        mapping = {
            "settings": {"number_of_shards": 1, "number_of_replicas": 0},
            "mappings": {"dynamic": True},
        }
        create_resp = requests.put(f"{base_url}/{index_name}", json=mapping, timeout=10)
        create_resp.raise_for_status()
        print(f"[+] Index {index_name} créé.")
    else:
        print(f"[i] Index {index_name} déjà présent.")
    return index_name


def random_os_event(case_id: str, case_name: str, evidence_uid: str, max_minutes: int) -> dict:
    now = datetime.utcnow() - timedelta(minutes=random.randint(0, max_minutes))
    source = random.choice(["process", "network", "file"])
    host = random.choice(["WKST-01", "WKST-02", "SRV-AD01"])
    tags = random.sample(["execution", "defense_evasion", "lateral_movement", "collection"], k=2)
    return {
        "@timestamp": now.isoformat() + "Z",
        "case": {"id": case_id, "name": case_name},
        "evidence": {"uid": evidence_uid},
        "source": {"parser": "demo_seed"},
        "event": {"type": source, "action": "generated"},
        "host": {"hostname": host},
        "user": {"name": random.choice(["alice", "bob", "charlie", "SYSTEM"])},
        "message": f"Demo {source} event {random.randint(1000, 9999)}",
        "tags": tags,
        "score": random.randint(1, 100),
        "raw": {"demo": True, "seed": ''.join(random.choices(string.ascii_lowercase, k=6))},
    }


def bulk_index(base_url: str, index_name: str, docs: list[dict]):
    payload_lines = []
    for doc in docs:
        payload_lines.append(json.dumps({"index": {"_index": index_name}}))
        payload_lines.append(json.dumps(doc))
    payload = "\n".join(payload_lines) + "\n"
    resp = requests.post(f"{base_url}/_bulk", data=payload, headers={"Content-Type": "application/x-ndjson"}, timeout=30)
    resp.raise_for_status()
    if resp.json().get("errors"):
        raise RuntimeError(f"Bulk indexing reported errors: {resp.text}")


def main():
    args = parse_args()
    index_name = ensure_index(args.os_url, args.case_id)
    total = args.events
    chunk = args.chunk_size
    sent = 0

    while sent < total:
        batch = []
        for _ in range(min(chunk, total - sent)):
            batch.append(random_os_event(args.case_id, args.case_name, args.evidence_uid, args.max_minutes))
        bulk_index(args.os_url, index_name, batch)
        sent += len(batch)
        print(f"[+] Indexed {sent}/{total} docs in {index_name}")

    requests.post(f"{args.os_url}/{index_name}/_refresh", timeout=10)
    print(f"[✓] OS seed complete. Check the frontend timeline for case '{args.case_id}'.")


if __name__ == "__main__":
    main()
