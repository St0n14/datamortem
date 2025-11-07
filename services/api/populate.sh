#!/usr/bin/env bash
set -euo pipefail

API="http://127.0.0.1:8000/api"

# -------- CONFIG DE TEST --------
CASE_ID="INC-2025-TEST-lateral"
CASE_NOTE="Suspected lateral movement via medusa.bat"
EVIDENCE_UID="WKST-FA-22_DISK"
EVIDENCE_PATH="/mnt/disk_images/WKST-FA-22.dd"

SQLITE_DB="./dev.db"

echo "[*] sanity check tools (jq/sqlite3)"
command -v jq >/dev/null 2>&1 || { echo "[-] need jq"; exit 1; }
command -v sqlite3 >/dev/null 2>&1 || { echo "[-] need sqlite3"; exit 1; }

echo
echo "[*] Step 1: ensure analysis_modules has parse_mft"

sqlite3 "${SQLITE_DB}" <<'EOF'
INSERT INTO analysis_modules (name, description, tool, enabled)
SELECT 'Parse MFT',
       'Parse $MFT from evidence and generate CSV timeline',
       'parse_mft',
       1
WHERE NOT EXISTS (
    SELECT 1 FROM analysis_modules WHERE tool='parse_mft'
);
EOF

echo "[+] analysis_modules ok"
echo

echo "[*] Step 2: create DFIR case ${CASE_ID}"

CREATE_CASE_BODY=$(jq -n --arg cid "$CASE_ID" --arg note "$CASE_NOTE" '{
  case_id: $cid,
  note: $note
}')

CASE_RESP=$(curl -s -X POST "${API}/cases" \
  -H "Content-Type: application/json" \
  -d "${CREATE_CASE_BODY}")

echo "[+] Case response:"
echo "${CASE_RESP}" | jq .
echo

echo "[*] Step 3: create evidence ${EVIDENCE_UID} linked to case ${CASE_ID}"

CREATE_EVIDENCE_BODY=$(jq -n \
  --arg uid "$EVIDENCE_UID" \
  --arg cid "$CASE_ID" \
  --arg path "$EVIDENCE_PATH" \
  '{
    evidence_uid: $uid,
    case_id: $cid,
    local_path: $path
  }')

# adapte si chez toi c'est /api/evidences
EVIDENCE_RESP=$(curl -s -X POST "${API}/evidences" \
  -H "Content-Type: application/json" \
  -d "${CREATE_EVIDENCE_BODY}")

echo "[+] Evidence response:"
echo "${EVIDENCE_RESP}" | jq .
echo

echo "[*] Step 4: ingest events into ${CASE_ID}"

NOW_1=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NOW_2=$(date -u -d "1 minute ago" +"%Y-%m-%dT%H:%M:%SZ")
NOW_3=$(date -u -d "5 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")

INGEST_EVENTS_BODY=$(jq -n \
  --arg cid "$CASE_ID" \
  --arg ts1 "$NOW_1" \
  --arg ts2 "$NOW_2" \
  --arg ts3 "$NOW_3" \
  --arg ev "$EVIDENCE_UID" \
  '[
    {
      "ts": $ts3,
      "source": "PREFETCH",
      "message": "medusa.bat executed from C:\\Users\\victim\\Downloads",
      "host": "WKST-FA-22",
      "user": "victim",
      "tags": ["execution", "initial_access"],
      "score": 90,
      "case_id": $cid,
      "evidence_uid": $ev
    },
    {
      "ts": $ts2,
      "source": "PROCESS_CREATE",
      "message": "psexec.exe spawned cmd.exe /c whoami",
      "host": "WKST-FA-22",
      "user": "victim",
      "tags": ["lateral_movement", "psexec"],
      "score": 75,
      "case_id": $cid,
      "evidence_uid": $ev
    },
    {
      "ts": $ts1,
      "source": "SECURITY_LOGON",
      "message": "Account logon: user=ADMIN-IMPERSONATED from 10.10.10.8",
      "host": "WKST-FA-22",
      "user": "ADMIN-IMPERSONATED",
      "tags": ["credential_use"],
      "score": 88,
      "case_id": $cid,
      "evidence_uid": $ev
    }
  ]')

curl -s -X POST "${API}/events/ingest" \
  -H "Content-Type: application/json" \
  -d "${INGEST_EVENTS_BODY}" \
  | jq .

echo "[+] Events ingested."
echo

echo "[*] Step 5: fetch events for ${CASE_ID}"
curl -s "${API}/events?case_id=${CASE_ID}" | jq .
echo

echo "[*] Step 6: fetch pipeline modules for evidence ${EVIDENCE_UID}"
curl -s "${API}/pipeline?evidence_uid=${EVIDENCE_UID}" | jq .
echo

MODULE_ID=1

RUN_REQ=$(jq -n \
  --argjson mid $MODULE_ID \
  --arg uid "$EVIDENCE_UID" \
  '{module_id: $mid, evidence_uid: $uid}')

echo "[*] Step 7: trigger module_id=${MODULE_ID} on evidence=${EVIDENCE_UID}"
RUN_RESP=$(curl -s -X POST "${API}/pipeline/run" \
  -H "Content-Type: application/json" \
  -d "${RUN_REQ}")
echo "${RUN_RESP}" | jq .
echo

echo "[*] Step 8: fetch pipeline runs"
curl -s "${API}/pipeline/runs?evidence_uid=${EVIDENCE_UID}" | jq .
echo

echo "[✓] bootstrap finished."
echo "    - Case ID: ${CASE_ID}"
echo "    - Evidence UID: ${EVIDENCE_UID}"
echo "    - Check Timeline tab + Pipeline tab in UI."

