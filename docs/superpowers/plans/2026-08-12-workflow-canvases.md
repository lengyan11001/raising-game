# Workflow Canvases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open Workflow to every user on the old and new2 main sites and let each user create, save, switch, rename, and delete multiple server-backed workflow canvases.

**Architecture:** Store each canvas as an owner-scoped PostgreSQL record with a JSON payload. Expose authenticated CRUD endpoints and keep the existing workflow execution endpoints unchanged. The frontend uses the server as the source of truth, migrates the existing local single-canvas state once, and retains local persistence only as an offline draft fallback.

**Tech Stack:** Node.js HTTP server, PostgreSQL JSONB, vanilla JavaScript, HTML/CSS, Node test runner.

## Global Constraints

- Old site and new2 main site expose Workflow to all users.
- Tool tenants keep Workflow disabled.
- Existing single-canvas local state migrates without data loss.
- Users can only access their own canvases.
- At least one canvas remains after deletion.
- Wheel zoom runs only over empty canvas space, never inside a node.
- Old site remains the shared-code source for new2.

---

### Task 1: Server Canvas Storage and API

**Files:**
- Modify: `db.js`
- Modify: `server.js`
- Test: `test/workflow-canvases.test.js`

**Interfaces:**
- Produces: `GET /api/workflow/canvases`, `POST /api/workflow/canvases`, `PUT /api/workflow/canvases/:id`, `DELETE /api/workflow/canvases/:id`.
- Canvas payload: `{ id, name, workflow, createdAt, updatedAt }`.

- [ ] Write a failing source-contract test for owner-scoped storage, CRUD routes, validation, and delete-last replacement.
- [ ] Run `node --test test/workflow-canvases.test.js` and verify the missing schema/routes fail.
- [ ] Add `app_workflow_canvases` with `id`, `user_id`, `name`, `payload`, timestamps, and an owner index.
- [ ] Add database CRUD helpers and authenticated server handlers with name length and workflow shape validation.
- [ ] Run the focused test and syntax checks.

### Task 2: Frontend Canvas Manager and Migration

**Files:**
- Modify: `platform.config.js`
- Modify: `platform.ui.js`
- Modify: `platform.main.js`
- Modify: `platform.css`
- Test: `test/workflow-canvases.test.js`

**Interfaces:**
- Consumes: canvas CRUD endpoints from Task 1.
- Produces: canvas selector and New, Save, Rename, Delete controls; `loadWorkflowCanvases`, `saveActiveWorkflowCanvas`, `createWorkflowCanvas`, `deleteActiveWorkflowCanvas`.

- [ ] Extend the failing test for the controls, API calls, and local migration marker.
- [ ] Add canvas collection state and load it on Workflow entry/login changes.
- [ ] Migrate existing local workflow into the first server canvas, otherwise create a default canvas.
- [ ] Add compact toolbar controls and confirmations; save workflow state explicitly and keep local draft persistence.
- [ ] Run focused tests and JavaScript syntax checks.

### Task 3: Shared Verification and Deployment

**Files:**
- Test: `test/workflow-access.test.js`
- Sync shared files to `D:\raising-game-667zui`.

- [ ] Run old-site `node --test` and new2 `node --test`.
- [ ] Run `python scripts\sync_old_to_new2.py --check`.
- [ ] Commit and push old source branch and `old-site`, then commit and push new2.
- [ ] Deploy with `python scripts\deploy_site.py --site old` and `python scripts\deploy_site.py --site new2`; never use SCP.
- [ ] Verify both health endpoints and production asset versions.
