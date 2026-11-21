#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT_DIR"

command -v node >/dev/null || { echo "error: Node.js is required" >&2; exit 1; }
command -v pnpm >/dev/null || { echo "error: pnpm is required (corepack enable)" >&2; exit 1; }

pnpm install --frozen-lockfile
pnpm test
pnpm build

test -f dist/index.html

if [ "${RUN_ANDROID:-0}" = 1 ]; then
  pnpm android:sync
  (cd android && ./gradlew assembleDebug)
  test -f android/app/build/outputs/apk/debug/app-debug.apk
fi
