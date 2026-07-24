#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> git pull"
git pull

echo "==> docker compose build"
docker compose build

echo "==> docker compose up -d"
docker compose up -d

echo "==> aplicando migrações do banco de auth"
docker compose exec app node scripts/migrate-auth.mjs

if [[ "${1:-}" == "--seed-admin" ]]; then
  echo "==> seed do usuário admin (lê ADMIN_USERNAME/ADMIN_PASSWORD do .env)"
  docker compose exec app node scripts/seed-admin.mjs
fi

echo "==> deploy concluído"
