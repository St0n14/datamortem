#!/usr/bin/env python
"""
Script de test complet pour valider le flux d'ingestion.
Vérifie que les événements sont bien indexés dans PostgreSQL ET OpenSearch.

Usage:
    python scripts/test_ingestion_complete.py --case-id test_ingestion_001 --events 100
"""
import argparse
import os
import random
import string
import time
from datetime import datetime, timedelta
import secrets
from typing import Optional

import requests


def parse_args():
    parser = argparse.ArgumentParser(description="Test complet du flux d'ingestion")
    parser.add_argument("--base-url", default=os.environ.get("DM_API_BASE_URL", "http://localhost:8080"),
                        help="API base URL (default: http://localhost:8080)")
    parser.add_argument("--os-url", default=os.environ.get("DM_OPENSEARCH_URL", "http://localhost:9200"),
                        help="OpenSearch URL (default: http://localhost:9200)")
    parser.add_argument("--admin-user", default=os.environ.get("DM_ADMIN_USER", "admin"),
                        help="Admin username")
    parser.add_argument("--admin-pass", default=os.environ.get("DM_ADMIN_PASS", "admin123"),
                        help="Admin password")
    parser.add_argument("--case-id", default="test_ingestion_001",
                        help="Case identifier (will be created if doesn't exist)")
    parser.add_argument("--evidence-uid", default="test_evidence_001",
                        help="Evidence UID")
    parser.add_argument("--events", type=int, default=50,
                        help="Number of events to ingest")
    parser.add_argument("--cleanup", action="store_true",
                        help="Delete test case after test")
    parser.add_argument("--rbac-check", action="store_true",
                        help="Ensure unauthorized users cannot query other cases")
    return parser.parse_args()


def login(base_url: str, username: str, password: str) -> str:
    """Login and return access token."""
    resp = requests.post(
        f"{base_url}/api/auth/login",
        json={"username": username, "password": password},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def ensure_case(base_url: str, token: str, case_id: str):
    """Create case if doesn't exist."""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.post(
        f"{base_url}/api/cases",
        json={"case_id": case_id, "note": "Test ingestion case"},
        headers=headers,
        timeout=10,
    )
    if resp.status_code == 409:
        print(f"[✓] Case '{case_id}' already exists")
        return
    resp.raise_for_status()
    print(f"[+] Case '{case_id}' created")


def ensure_evidence(base_url: str, token: str, evidence_uid: str, case_id: str):
    """Create evidence if doesn't exist."""
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "evidence_uid": evidence_uid,
        "case_id": case_id,
        "local_path": f"/lake/{case_id}/evidences/{evidence_uid}/test.e01",
    }
    resp = requests.post(
        f"{base_url}/api/evidences",
        json=payload,
        headers=headers,
        timeout=10,
    )
    if resp.status_code == 409:
        print(f"[✓] Evidence '{evidence_uid}' already exists")
        return
    resp.raise_for_status()
    print(f"[+] Evidence '{evidence_uid}' created")


def random_event(case_id: str, evidence_uid: str) -> dict:
    """Generate a random event."""
    now = datetime.utcnow() - timedelta(minutes=random.randint(0, 60))
    source = random.choice(["PROCESS_CREATE", "NETWORK_CONNECTION", "FILE_WRITE", "REGISTRY_SET"])
    host = random.choice(["WKST-01", "WKST-02", "SRV-AD01"])
    username = random.choice(["alice", "bob", "charlie", "SYSTEM"])
    tags = random.sample(
        ["execution", "initial_access", "lateral_movement", "collection", "exfiltration"],
        k=random.randint(1, 2),
    )
    return {
        "ts": now.isoformat() + "Z",
        "source": source,
        "message": f"{source} event test {random.randint(1000, 9999)}",
        "host": host,
        "user": username,
        "tags": tags,
        "score": random.randint(1, 100),
        "case_id": case_id,
        "evidence_uid": evidence_uid,
        "raw": {"test": True, "rand": ''.join(random.choices(string.ascii_lowercase, k=6))},
    }


def ingest_events(base_url: str, token: str, case_id: str, evidence_uid: str, count: int) -> dict:
    """Ingest events via /api/events/ingest."""
    headers = {"Authorization": f"Bearer {token}"}
    events = [random_event(case_id, evidence_uid) for _ in range(count)]

    print(f"\n[→] Ingesting {count} events...")
    resp = requests.post(
        f"{base_url}/api/events/ingest",
        json=events,
        headers=headers,
        timeout=30,
    )
    resp.raise_for_status()
    result = resp.json()
    print(f"[✓] API Response: {result}")
    return result


def check_postgresql(base_url: str, token: str, case_id: str) -> int:
    """Check events in PostgreSQL via API."""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(
        f"{base_url}/api/events",
        params={"case_id": case_id},
        headers=headers,
        timeout=30
    )
    resp.raise_for_status()
    events = resp.json()
    count = len(events)
    print(f"[✓] PostgreSQL: {count} events found")
    return count


def delete_opensearch_index(os_url: str, case_id: str):
    """Delete OpenSearch index for a case."""
    index_name = f"requiem-case-{case_id}"
    try:
        resp = requests.delete(f"{os_url}/{index_name}", timeout=5)
        if resp.status_code == 200:
            print(f"[i] Deleted OpenSearch index '{index_name}'")
    except Exception as e:
        print(f"[i] Could not delete OpenSearch index '{index_name}': {e}")


def check_opensearch(os_url: str, case_id: str) -> int:
    """Check events in OpenSearch."""
    index_name = f"requiem-case-{case_id}"

    # Refresh index first
    try:
        requests.post(f"{os_url}/{index_name}/_refresh", timeout=5)
    except:
        pass

    # Query all documents
    resp = requests.get(
        f"{os_url}/{index_name}/_count",
        timeout=10
    )

    if resp.status_code == 404:
        print(f"[✗] OpenSearch: Index '{index_name}' not found")
        return 0

    resp.raise_for_status()
    count = resp.json()["count"]
    print(f"[✓] OpenSearch: {count} events found in index '{index_name}'")
    return count


def delete_case(base_url: str, token: str, case_id: str):
    """Delete test case."""
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.delete(
        f"{base_url}/api/cases/{case_id}",
        headers=headers,
        timeout=10
    )
    if resp.status_code in (200, 204):
        print(f"[✓] Case '{case_id}' deleted")
    elif resp.status_code == 404:
        print(f"[i] Case '{case_id}' not found")
    else:
        print(f"[✗] Failed to delete case: {resp.status_code}")


def register_user(base_url: str, username: str, email: str, password: str, full_name: Optional[str] = None):
    """Register a new user (idempotent)."""
    payload = {
        "email": email,
        "username": username,
        "password": password,
        "full_name": full_name or "RBAC Test User",
    }
    resp = requests.post(
        f"{base_url}/api/auth/register",
        json=payload,
        timeout=10,
    )
    if resp.status_code == 400 and "already" in resp.text.lower():
        print(f"[i] User '{username}' already exists, reusing.")
        return
    resp.raise_for_status()
    print(f"[+] User '{username}' registered.")


def assert_opensearch_forbidden(base_url: str, token: str, case_id: str):
    """Verify OpenSearch endpoints deny access to foreign cases."""
    headers = {"Authorization": f"Bearer {token}"}
    timeline_payload = {
        "case_id": case_id,
        "interval": "1h",
        "query": "*",
        "filters": None,
        "field_filters": [],
        "time_range": None,
    }
    resp = requests.post(
        f"{base_url}/api/search/timeline",
        json=timeline_payload,
        headers=headers,
        timeout=10,
    )
    if resp.status_code != 403:
        raise AssertionError(
            f"Timeline RBAC broken: expected 403, got {resp.status_code}: {resp.text}"
        )
    print("[✓] Timeline RBAC enforced (403).")

    search_payload = {
        "case_id": case_id,
        "query": "*",
        "from": 0,
        "size": 5,
        "sort_by": "@timestamp",
        "sort_order": "desc",
        "filters": None,
        "field_filters": [],
        "time_range": None,
    }
    resp = requests.post(
        f"{base_url}/api/search/query",
        json=search_payload,
        headers=headers,
        timeout=10,
    )
    if resp.status_code != 403:
        raise AssertionError(
            f"Search RBAC broken: expected 403, got {resp.status_code}: {resp.text}"
        )
    print("[✓] Search RBAC enforced (403).")


def main():
    args = parse_args()

    print("=" * 60)
    print("TEST COMPLET D'INGESTION")
    print("=" * 60)

    # 1. Login
    print("\n[1] Authentication...")
    token = login(args.base_url, args.admin_user, args.admin_pass)
    print("[✓] Authenticated as admin")

    # 2. Setup
    print("\n[2] Setup case & evidence...")
    # Clean up any existing test data first
    try:
        delete_case(args.base_url, token, args.case_id)
        print(f"[i] Cleaned up existing case '{args.case_id}'")
    except:
        pass  # Case doesn't exist, that's fine
    # Also clean up OpenSearch index
    delete_opensearch_index(args.os_url, args.case_id)
    ensure_case(args.base_url, token, args.case_id)
    ensure_evidence(args.base_url, token, args.evidence_uid, args.case_id)

    # 3. Ingest
    print("\n[3] Ingestion...")
    start_time = time.time()
    result = ingest_events(args.base_url, token, args.case_id, args.evidence_uid, args.events)
    duration = time.time() - start_time
    print(f"[✓] Ingestion completed in {duration:.2f}s")

    # Wait a bit for indexing
    print("\n[4] Waiting 2s for OpenSearch indexing...")
    time.sleep(2)

    # 4. Verify
    print("\n[5] Verification...")
    pg_count = check_postgresql(args.base_url, token, args.case_id)
    os_count = check_opensearch(args.os_url, args.case_id)

    # 5. Results
    print("\n" + "=" * 60)
    print("RÉSULTATS DU TEST")
    print("=" * 60)
    print(f"Events ingérés:         {args.events}")
    print(f"PostgreSQL:             {pg_count} events")
    print(f"OpenSearch:             {os_count} events")

    if result.get("opensearch"):
        os_stats = result["opensearch"]
        if isinstance(os_stats, dict) and not os_stats.get("error"):
            for case_id, stats in os_stats.items():
                print(f"\nOpenSearch stats (case {case_id}):")
                print(f"  - Indexed:   {stats.get('indexed', 0)}")
                print(f"  - Failed:    {stats.get('failed', 0)}")
                if stats.get("errors"):
                    print(f"  - Errors:    {stats['errors']}")

    # Success check
    success = (pg_count == args.events and os_count == args.events)

    if success:
        print("\n✅ TEST RÉUSSI - Tous les événements sont correctement indexés")
    else:
        print("\n❌ TEST ÉCHOUÉ - Incohérence détectée")
        if pg_count != args.events:
            print(f"   PostgreSQL: attendu {args.events}, trouvé {pg_count}")
        if os_count != args.events:
            print(f"   OpenSearch: attendu {args.events}, trouvé {os_count}")

    # 6. RBAC check
    if args.rbac_check:
        print("\n[6] RBAC verification...")
        suffix = secrets.token_hex(4)
        rogue_user = f"rbac_{suffix}"
        rogue_pass = f"Rbac!{suffix}"
        rogue_email = f"{rogue_user}@example.com"
        register_user(args.base_url, rogue_user, rogue_email, rogue_pass)
        rogue_token = login(args.base_url, rogue_user, rogue_pass)
        assert_opensearch_forbidden(args.base_url, rogue_token, args.case_id)

    # Cleanup
    if args.cleanup:
        print(f"\n[cleanup] Removing test case...")
        delete_case(args.base_url, token, args.case_id)

    print("=" * 60)
    return 0 if success else 1


if __name__ == "__main__":
    exit(main())
