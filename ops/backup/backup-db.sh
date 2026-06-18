#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/root/drone-doctor}"
ENV_FILE="${ENV_FILE:-${PROJECT_DIR}/.env.tencent}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_DIR}/docker-compose.tencent.yml}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

timestamp="$(date +%Y%m%d_%H%M%S)"
backup_file="${BACKUP_DIR}/db_${timestamp}.dump"
temporary_file="$(mktemp "${BACKUP_DIR}/.db_${timestamp}.XXXXXX")"

cleanup() {
  rm -f "${temporary_file}"
}
trap cleanup EXIT

cd "${PROJECT_DIR}"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  sh -lc 'pg_dump --format=custom --compress=9 --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "${temporary_file}"

test -s "${temporary_file}"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  pg_restore --list < "${temporary_file}" > /dev/null
mv "${temporary_file}" "${backup_file}"
chmod 600 "${backup_file}"

find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'db_*.dump' -mtime "+${RETENTION_DAYS}" -delete

printf 'Backup completed and verified: %s\n' "${backup_file}"
