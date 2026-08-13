# Undress Prompt Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators configure the three Undress generation prompts without exposing them to the tool frontend or public APIs.

**Architecture:** Store normalized values in `app_config.undressPrompts`. Resolve the prompt when a task is created, persist that prompt on the generation record, and pass the same snapshot to asynchronous and recovered jobs. Add one focused admin route that edits only these three values through the existing admin config API.

**Tech Stack:** Node.js, PostgreSQL-backed app config, vanilla JavaScript admin UI, `node:test`.

## Global Constraints

- Old site only.
- Prompts remain server-side and admin-only.
- Existing tasks retain their stored prompt.
- Empty prompts are rejected; each prompt is limited to 6000 characters.
- Deployment uses the existing Git deployment script, never SCP.

---

### Task 1: Prompt Configuration Domain

**Files:**
- Create: `undress-prompts.js`
- Test: `test/undress-prompts.test.js`

**Interfaces:**
- Produces: `DEFAULT_UNDRESS_PROMPTS`, `normalizeUndressPrompts(value)`, `validateUndressPrompts(value)`, and `undressPromptForAction(action, value)`.

- [ ] Write tests for defaults, saved values, action mapping, blank rejection, and length rejection.
- [ ] Run the focused test and verify it fails because the module does not exist.
- [ ] Implement the minimal domain module.
- [ ] Run the focused test and verify it passes.

### Task 2: Server Integration

**Files:**
- Modify: `server.js`
- Test: `test/undress-prompts.test.js`

**Interfaces:**
- Consumes: the Task 1 prompt helpers.
- Produces: normalized `app_config.undressPrompts` and immutable per-task prompt snapshots.

- [ ] Add `undressPrompts` to the default/read/save config paths.
- [ ] Resolve prompts for Undress image, image-to-video, and video-edit task creation.
- [ ] Pass the stored prompt into asynchronous jobs and job recovery.
- [ ] Ensure each runner uses the job prompt with the existing constant only as a legacy fallback.

### Task 3: Admin Route

**Files:**
- Modify: `admin.html`
- Modify: `admin.js`
- Modify: `admin.css`

**Interfaces:**
- Consumes: `GET /api/admin/config` and `PUT /api/admin/config`.
- Produces: `#/undress-config` with three textareas, save, reload, and restore-default controls.

- [ ] Add the navigation route and compact editor UI.
- [ ] Validate non-empty values and the 6000-character limit before save.
- [ ] Save only `undressPrompts` merged into the current config.
- [ ] Keep the route hidden on tenant admin hosts that already hide system configuration.

### Task 4: Verification and Deployment

**Files:**
- Verify all modified files.

- [ ] Run focused tests, the complete test suite, and `node --check` for server/admin scripts.
- [ ] Commit and push the current branch and `old-site`.
- [ ] Deploy with `python scripts/deploy_site.py --site old`.
- [ ] Verify old-site health and the admin configuration response on production.
