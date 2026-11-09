#!/usr/bin/env bash
# Roda as migrações num PostgreSQL local (com um "auth" simulado) e os testes.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres npm run db:test
set -euo pipefail
cd "$(dirname "$0")/.."
DB=gameplay_test
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d $DB -f test/stub_auth.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d $DB -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d $DB -f test/test_flows.sql
psql -q -v ON_ERROR_STOP=1 -d $DB -f test/test_notifications.sql
psql -q -v ON_ERROR_STOP=1 -d $DB -f test/test_chat.sql
