#!/usr/bin/env bash
set -euo pipefail
umask 077

# Build an immutable code checkout for an independent Old candidate and point
# it at one shared runtime-media root. This script never edits the source tree,
# production release, systemd, Nginx, or PostgreSQL.
#
# Usage:
#   ops/prepare-independent-release.sh SOURCE_REPO TARGET_RELEASE SHARED_ASSETS
#
# TARGET_RELEASE must not exist. SOURCE_REPO must be a clean Git checkout at the
# commit to promote. SHARED_ASSETS must be an existing non-symlink directory.

if [[ "$#" -ne 3 ]]; then
  echo "usage: $0 SOURCE_REPO TARGET_RELEASE SHARED_ASSETS" >&2
  exit 2
fi
resolve_existing_dir() {
  local value="$1"
  if [[ ! -d "$value" ]]; then
    return 1
  fi
  (cd "$value" && pwd -P)
}
source_input="$1"
target_release="$2"
shared_input="$3"
source_repo="$(resolve_existing_dir "$source_input")" || {
  echo "Source repository does not exist: $source_input" >&2
  exit 4
}
if [[ -L "$shared_input" || ! -d "$shared_input" ]]; then
  echo "Shared assets must be an existing non-symlink directory: $shared_input" >&2
  exit 4
fi
shared_assets="$(resolve_existing_dir "$shared_input")" || {
  echo "Shared assets do not exist: $shared_input" >&2
  exit 4
}

if [[ -e "$target_release" || -L "$target_release" ]]; then
  echo "Target release already exists: $target_release" >&2
  exit 3
fi
if [[ -L "$shared_assets" || ! -d "$shared_assets" ]]; then
  echo "Shared assets must be an existing non-symlink directory: $shared_assets" >&2
  exit 4
fi
if [[ ! -d "$source_repo/.git" ]]; then
  echo "Source is not a Git checkout: $source_repo" >&2
  exit 4
fi
if [[ -n "$(git -C "$source_repo" status --porcelain --untracked-files=normal)" ]]; then
  echo "Refusing to snapshot a dirty source checkout. Commit reviewed files first." >&2
  git -C "$source_repo" status --short >&2
  exit 5
fi
release_commit="$(git -C "$source_repo" rev-parse --verify 'HEAD^{commit}')"
if [[ ! "$release_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not resolve source commit." >&2
  exit 5
fi

target_parent="$(dirname "$target_release")"
mkdir -p "$target_parent"
staging="$(mktemp -d "$target_parent/.candidate-release.XXXXXXXX")"
cleanup() { rm -rf -- "$staging"; }
trap cleanup EXIT

git -C "$source_repo" archive --format=tar "$release_commit" | tar -xf - -C "$staging"
printf '%s\n' "$release_commit" >"$staging/RELEASE_COMMIT"
printf '%s\n' "$shared_assets" >"$staging/RUNTIME_MEDIA_ROOT"
mv "$staging" "$target_release"
trap - EXIT
chmod 0555 "$target_release"

# Resolve again after rename so a path substitution cannot be reported as OK.
if [[ "$(cat "$target_release/RELEASE_COMMIT")" != "$release_commit" ]]; then
  echo "Release marker verification failed." >&2
  exit 6
fi
if [[ "$(cat "$target_release/RUNTIME_MEDIA_ROOT")" != "$shared_assets" ]]; then
  echo "Runtime asset marker verification failed." >&2
  exit 6
fi
if [[ -n "$(find "$target_release" -type l -print -quit)" ]]; then
  echo "Candidate release contains a symbolic link; refusing an ambiguous release." >&2
  exit 6
fi
echo "INDEPENDENT_RELEASE_READY=1"
echo "release=$target_release"
echo "commit=$release_commit"
echo "runtime_assets=$shared_assets"
