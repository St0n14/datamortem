#!/usr/bin/env python
"""
Quick script to verify how many events exist for a given case via the REST API.

Usage:
    ADMIN_USER=admin ADMIN_PASS=admin123 python scripts/check_events.py --case-id demo_case
"""
import argparse
import os

import requests


def parse_args():
    parser = argparse.ArgumentParser(description="Check number of stored events for a case.")
    parser.add_argument("--base-url", default=os.environ.get("DM_API_BASE_URL", "http://localhost:8080"),
                        help="API base URL (default: http://localhost:8080)")
    parser.add_argument("--admin-user", default=os.environ.get("DM_ADMIN_USER", "admin"),
                        help="Admin username")
    parser.add_argument("--admin-pass", default=os.environ.get("DM_ADMIN_PASS", "admin123"),
                        help="Admin password")
    parser.add_argument("--case-id", required=True, help="Case identifier to inspect")
    return parser.parse_args()


def login(base_url: str, username: str, password: str) -> str:
    resp = requests.post(
        f"{base_url}/api/auth/login",
        json={"username": username, "password": password},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def main():
    args = parse_args()
    token = login(args.base_url, args.admin_user, args.admin_pass)
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{args.base_url}/api/events", params={"case_id": args.case_id}, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    print(f"[✓] Case '{args.case_id}' contient {len(data)} événements.")
    if len(data):
        print(f"  • Exemple: {data[0]['source']} @ {data[0]['ts']} score={data[0].get('score')}")


if __name__ == "__main__":
    main()
