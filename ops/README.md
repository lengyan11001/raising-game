# Raising Game production ops

This folder contains idempotent server-side helpers for production runtime tuning.

Run `bash ops/apply-production-tuning.sh` on the server from `/opt/raising-game-demo`.
It backs up modified files, validates Nginx, reloads Nginx, and restarts the app service.