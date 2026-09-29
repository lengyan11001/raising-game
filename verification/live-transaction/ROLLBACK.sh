#!/bin/sh
set -eu
target=${1:?usage: ROLLBACK.sh TARGET_COPY}
baseline="${target}.baseline"
if [ ! -f "$baseline" ]; then
  echo "missing baseline: $baseline" >&2
  exit 2
fi
cp "$baseline" "$target"
