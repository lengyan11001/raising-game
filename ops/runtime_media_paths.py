"""Canonical writable runtime-media paths for Old.

These paths are data owned by PostgreSQL metadata and stored below the
release-local `assets/` tree until `RUNTIME_MEDIA_ROOT` cutover. Release-owned
static assets are intentionally excluded.
"""

RUNTIME_MEDIA_PATHS = (
    "user-uploads",
    "user-characters",
    "generated/videos",
    "generated/posters",
    "generated/images",
    "generated/locked-previews",
    "generated/characters/apiz",
    "generated/panoramas",
    "admin/home",
    "admin/advanced-cases",
    "admin/platform-templates",
    "admin/undress-examples",
    "runtime-tmp/video-tool-uploads",
)
