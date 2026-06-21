#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/root/drone-doctor-current}"
ENV_FILE="${ENV_FILE:-/root/drone-doctor.env}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_DIR}/docker-compose.tencent.yml}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
BACKUP_MIRROR_DIR="${BACKUP_MIRROR_DIR:-}"
BACKUP_FAILURE_COMMAND="${BACKUP_FAILURE_COMMAND:-}"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

timestamp="$(date +%Y%m%d_%H%M%S)"
backup_file="${BACKUP_DIR}/db_${timestamp}.dump"
temporary_file="$(mktemp "${BACKUP_DIR}/.db_${timestamp}.XXXXXX")"

cleanup() {
  rm -f "${temporary_file}"
}

on_error() {
  exit_code="$1"
  printf 'Backup failed with exit code %s at %s\n' "${exit_code}" "$(date --iso-8601=seconds)" >&2
  if [[ -n "${BACKUP_FAILURE_COMMAND}" ]]; then
    sh -lc "${BACKUP_FAILURE_COMMAND}" || true
  fi
}

trap cleanup EXIT
trap 'on_error $?' ERR

cd "${PROJECT_DIR}"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  sh -lc 'pg_dump --format=custom --compress=9 --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "${temporary_file}"

test -s "${temporary_file}"
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres \
  pg_restore --list < "${temporary_file}" > /dev/null
mv "${temporary_file}" "${backup_file}"
chmod 600 "${backup_file}"
sha256sum "${backup_file}" > "${backup_file}.sha256"
chmod 600 "${backup_file}.sha256"

if [[ -n "${BACKUP_MIRROR_DIR}" ]]; then
  mkdir -p "${BACKUP_MIRROR_DIR}"
  chmod 700 "${BACKUP_MIRROR_DIR}"
  cp -p "${backup_file}" "${backup_file}.sha256" "${BACKUP_MIRROR_DIR}/"
fi

find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'db_*.dump' -mtime "+${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'db_*.dump.sha256' -mtime "+${RETENTION_DAYS}" -delete

printf 'Backup completed and verified: %s\n' "${backup_file}"
