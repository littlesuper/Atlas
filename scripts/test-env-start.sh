#!/usr/bin/env sh
set -eu

SERVER_PORT="${PORT:-3000}"
CLIENT_PORT="${CLIENT_PORT:-5173}"
CLIENT_ORIGIN="${CLIENT_ORIGIN:-http://localhost:5174}"
DB_FILE="${ATLAS_TEST_DB_FILE:-docker-test.db}"

export NODE_ENV="${NODE_ENV:-development}"
export PORT="$SERVER_PORT"
export DATABASE_URL="file:./${DB_FILE}"
export JWT_SECRET="${JWT_SECRET:-atlas-test-jwt-secret}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-atlas-test-refresh-secret}"
export CORS_ORIGINS="${CORS_ORIGINS:-${CLIENT_ORIGIN},http://localhost:3001}"

rm -f \
  "server/prisma/${DB_FILE}" \
  "server/prisma/${DB_FILE}-journal" \
  "server/prisma/${DB_FILE}-shm" \
  "server/prisma/${DB_FILE}-wal"

cd server
npx prisma generate
npx prisma db push --schema prisma/schema.prisma
npx tsx prisma/seed.ts
cd ..

exec npx concurrently -n server,client -c blue,green \
  "npm run start --workspace=server" \
  "VITE_API_PROXY_TARGET=http://localhost:${SERVER_PORT} npm run dev --workspace=client -- --host 0.0.0.0 --port ${CLIENT_PORT}"
