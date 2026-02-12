#!/usr/bin/env bash
set -e

# Start backend and frontend dev servers concurrently.
# Kill both when either exits.

trap 'kill 0' EXIT

cd "$(dirname "$0")/.."

echo "Starting backend..."
npx tsx watch server/index.ts &

echo "Starting frontend..."
cd frontend && npx vite &

wait
