#!/bin/sh
set -eu

target=${1:?usage: ROLLBACK.sh TARGET_COPY}
dir=$(CDPATH= cd -- "$(dirname -- "$target")" && pwd)
baseline="$dir/BASELINE_FILE"
test -f "$baseline"
cp "$baseline" "$target"
