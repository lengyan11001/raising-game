#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "ops" / "rolling-deploy-transaction.py"
SPEC = importlib.util.spec_from_file_location("rolling_deploy_transaction", SCRIPT)
assert SPEC and SPEC.loader
ROLLING = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = ROLLING
SPEC.loader.exec_module(ROLLING)
VERIFIER_SCRIPT = ROOT / "ops" / "verify-production-cutover.py"
VERIFIER_SPEC = importlib.util.spec_from_file_location("verify_production_cutover", VERIFIER_SCRIPT)
assert VERIFIER_SPEC and VERIFIER_SPEC.loader
VERIFIER = importlib.util.module_from_spec(VERIFIER_SPEC)
sys.modules[VERIFIER_SPEC.name] = VERIFIER
VERIFIER_SPEC.loader.exec_module(VERIFIER)


def candidate_payload(
    *,
    release: str = "a" * 40,
    pid: int = 1234,
    clean: bool = True,
    schedulers: bool = False,
    submit_queue: bool = False,
    submit_worker: bool = False,
) -> tuple[dict, dict]:
    release_info = {"id": release, "clean": clean, "source": "git"}
    process = {"pid": pid}
    runtime = {
        "backgroundSchedulers": schedulers,
        "generationSubmitQueue": submit_queue,
        "generationSubmitWorker": submit_worker,
    }
    return (
        {"ok": True, "phase": "ready", "release": release_info, "process": process, "runtime": runtime},
        {
            "ok": True,
            "ready": True,
            "phase": "ready",
            "release": release_info,
            "process": process,
            "runtime": runtime,
        },
    )


class LoadedCandidateGateTests(unittest.TestCase):
    def validate(self, livez: dict, readyz: dict, **overrides: object) -> None:
        values = {
            "expected_release": "a" * 40,
            "expected_pid": 1234,
            "require_workers_disabled": True,
            **overrides,
        }
        ROLLING.validate_loaded_candidate(livez, readyz, **values)

    def test_accepts_exact_loaded_release_pid_and_disabled_workers(self) -> None:
        self.validate(*candidate_payload())

    def test_rejects_stale_already_active_process_without_release_identity(self) -> None:
        livez, readyz = candidate_payload()
        livez.pop("release")
        readyz.pop("release")
        with self.assertRaisesRegex(ROLLING.TransactionError, "no loaded release identity"):
            self.validate(livez, readyz)

    def test_rejects_healthy_process_on_wrong_release(self) -> None:
        livez, readyz = candidate_payload(release="b" * 40)
        with self.assertRaisesRegex(ROLLING.TransactionError, "release=.*expected="):
            self.validate(livez, readyz)

    def test_rejects_dirty_checkout(self) -> None:
        livez, readyz = candidate_payload(clean=False)
        with self.assertRaisesRegex(ROLLING.TransactionError, "not a clean Git checkout"):
            self.validate(livez, readyz)

    def test_rejects_pid_mismatch(self) -> None:
        livez, readyz = candidate_payload(pid=9999)
        with self.assertRaisesRegex(ROLLING.TransactionError, "pid=.*expected=1234"):
            self.validate(livez, readyz)

    def test_rejects_candidate_with_any_background_work_enabled(self) -> None:
        for field in ("backgroundSchedulers", "generationSubmitQueue", "generationSubmitWorker"):
            with self.subTest(field=field):
                livez, readyz = candidate_payload()
                readyz["runtime"][field] = True
                with self.assertRaisesRegex(ROLLING.TransactionError, "must be disabled"):
                    self.validate(livez, readyz)

    def test_rejects_not_ready_process_even_when_identity_matches(self) -> None:
        livez, readyz = candidate_payload()
        readyz["ready"] = False
        with self.assertRaisesRegex(ROLLING.TransactionError, "not ready"):
            self.validate(livez, readyz)


class ReleaseCheckoutTests(unittest.TestCase):
    def test_clean_git_checkout_reports_head(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.name", "Release Test"], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.email", "release@example.invalid"], check=True)
            (root / "release.txt").write_text("release\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "release.txt"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", "release"], check=True)
            expected = subprocess.check_output(
                ["git", "-C", str(root), "rev-parse", "HEAD"], text=True
            ).strip()
            self.assertEqual(ROLLING.release_identity(root), expected)

    def test_dirty_git_checkout_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.name", "Release Test"], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.email", "release@example.invalid"], check=True)
            (root / "release.txt").write_text("release\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "release.txt"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-q", "-m", "release"], check=True)
            (root / "release.txt").write_text("dirty\n", encoding="utf-8")
            with self.assertRaisesRegex(ROLLING.TransactionError, "release checkout is dirty"):
                ROLLING.release_identity(root)


class CutoverVerifierTests(unittest.TestCase):
    def test_verifier_requires_loaded_release_pid_and_disabled_workers(self) -> None:
        livez, readyz = candidate_payload()
        responses = iter(((200, livez), (200, readyz)))
        checks: list[object] = []
        with mock.patch.object(VERIFIER, "fetch_json", side_effect=lambda _url: next(responses)):
            VERIFIER.add_loaded_release_check(
                checks,
                base="http://127.0.0.1:4175",
                phase="candidate",
                expected_release="a" * 40,
                expected_pid="1234",
            )
        self.assertEqual(len(checks), 1)
        self.assertTrue(checks[0].ok)

    def test_verifier_rejects_old_healthy_process_without_release_identity(self) -> None:
        livez, readyz = candidate_payload()
        livez.pop("release")
        readyz.pop("release")
        responses = iter(((200, livez), (200, readyz)))
        checks: list[object] = []
        with mock.patch.object(VERIFIER, "fetch_json", side_effect=lambda _url: next(responses)):
            VERIFIER.add_loaded_release_check(
                checks,
                base="http://127.0.0.1:4175",
                phase="candidate",
                expected_release="a" * 40,
                expected_pid="1234",
            )
        self.assertFalse(checks[0].ok)
        self.assertIn("release=missing", checks[0].detail)


if __name__ == "__main__":
    unittest.main()
