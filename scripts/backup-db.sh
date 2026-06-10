#!/usr/bin/env bash
# Phase 5.12 — Weekly logical Postgres backup to Cloudflare R2 (or S3).
#
# Usage:
#   DATABASE_URL="postgresql://..." R2_BUCKET="zagafy-backups" \
#   R2_ENDPOINT="https://<account>.r2.cloudflarestorage.com" \
#   AWS_ACCESS_KEY_ID="..." AWS_SECRET_ACCESS_KEY="..." \
#   ./scripts/backup-db.sh
#
# Requires: pg_dump, gzip, aws CLI (works with R2 via --endpoint-url).
# Scheduled via .github/workflows/backup.yml (weekly cron).

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${R2_BUCKET:?R2_BUCKET is required}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required (e.g. https://<account>.r2.cloudflarestorage.com)}"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H%M%SZ")
FILENAME="zagafy-backup-${TIMESTAMP}.sql.gz"
TMPFILE="/tmp/${FILENAME}"

echo "[backup] Starting logical export at ${TIMESTAMP}"

# 1. pg_dump → gzip
pg_dump "${DATABASE_URL}" --no-owner --no-privileges --clean --if-exists \
  | gzip > "${TMPFILE}"

SIZE=$(du -h "${TMPFILE}" | cut -f1)
echo "[backup] Dump complete: ${FILENAME} (${SIZE})"

# 2. Upload to R2/S3
aws s3 cp "${TMPFILE}" "s3://${R2_BUCKET}/weekly/${FILENAME}" \
  --endpoint-url "${R2_ENDPOINT}"

echo "[backup] Uploaded to s3://${R2_BUCKET}/weekly/${FILENAME}"

# 3. Prune backups older than 90 days (keep ~13 weekly backups)
CUTOFF=$(date -u -d "90 days ago" +"%Y-%m-%dT" 2>/dev/null || date -u -v-90d +"%Y-%m-%dT" 2>/dev/null || echo "")
if [ -n "${CUTOFF}" ]; then
  echo "[backup] Pruning backups older than ${CUTOFF}"
  aws s3 ls "s3://${R2_BUCKET}/weekly/" --endpoint-url "${R2_ENDPOINT}" \
    | awk '{print $4}' \
    | while read -r key; do
        if [[ "${key}" < "zagafy-backup-${CUTOFF}" ]]; then
          aws s3 rm "s3://${R2_BUCKET}/weekly/${key}" --endpoint-url "${R2_ENDPOINT}"
          echo "[backup] Deleted old backup: ${key}"
        fi
      done
fi

# 4. Cleanup
rm -f "${TMPFILE}"
echo "[backup] Done."
