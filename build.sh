#!/usr/bin/env bash
# Thin wrapper — the real build is build.mjs, so it behaves identically
# on Windows (build.ps1), macOS and Linux.
set -euo pipefail
exec node "$(dirname "$0")/build.mjs" "$@"
