#!/bin/sh
set -eu
target=${1:?target copy required}
base=$(dirname "$target")/original.js
cp "$base" "$target"
