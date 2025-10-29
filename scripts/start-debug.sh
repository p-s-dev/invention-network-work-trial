#!/usr/bin/env bash
set -euo pipefail

# Simple debug launcher for NestJS in watch mode.
# Usage: ./scripts/start-debug.sh [-p PORT]

PORT="9229"
while getopts ":p:" opt; do
  case ${opt} in
    p)
      PORT="$OPTARG"
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      exit 1
      ;;
  esac
done

echo "Starting NestJS in debug mode on port ${PORT} (inspect-brk)"
echo "Attach your debugger to ws://127.0.0.1:${PORT}"

# Prefer existing script if present; otherwise invoke nest directly
if pnpm run -s start:debug >/dev/null 2>&1; then
  NODE_OPTIONS="--inspect-brk=0.0.0.0:${PORT}" pnpm run start:debug
else
  NODE_OPTIONS="--inspect-brk=0.0.0.0:${PORT}" pnpm exec nest start --watch
fi

