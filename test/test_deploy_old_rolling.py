import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "deploy_old_rolling.py"
SPEC = importlib.util.spec_from_file_location("deploy_old_rolling", SCRIPT)
ROLLING = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ROLLING)


class DeployOldRollingTests(unittest.TestCase):
    def test_target_follows_discovered_active_port(self) -> None:
        self.assertEqual(
            ROLLING.target_for_active_port(
                "4174",
                primary_port="4174",
                candidate_port="4175",
                primary_service="primary.service",
                candidate_service="candidate.service",
            ),
            ("4175", "candidate.service"),
        )
        self.assertEqual(
            ROLLING.target_for_active_port(
                "4175",
                primary_port="4174",
                candidate_port="4175",
                primary_service="primary.service",
                candidate_service="candidate.service",
            ),
            ("4174", "primary.service"),
        )

    def test_runtime_media_must_exist_and_match(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shared = root / "shared"
            shared.mkdir()
            env_file = root / "app.env"
            env_file.write_text("RUNTIME_MEDIA_ROOT=\n", encoding="utf-8")
            with self.assertRaisesRegex(ROLLING.DeployError, "RUNTIME_MEDIA_ROOT is required"):
                ROLLING.validate_runtime_media_env(env_file, shared.resolve())
            env_file.write_text(f"RUNTIME_MEDIA_ROOT={root / 'other'}\n", encoding="utf-8")
            (root / "other").mkdir()
            with self.assertRaisesRegex(ROLLING.DeployError, "RUNTIME_MEDIA_ROOT mismatch"):
                ROLLING.validate_runtime_media_env(env_file, shared.resolve())

    def test_release_marker_must_not_be_symlinked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "marker-target"
            target.write_text(f"{'a' * 40}\n", encoding="utf-8")
            (root / "RELEASE_COMMIT").symlink_to(target)
            with self.assertRaisesRegex(ROLLING.DeployError, "marker is missing or unsafe"):
                ROLLING.release_marker(root)

    def test_dropin_always_targets_exact_immutable_release(self) -> None:
        self.assertEqual(
            ROLLING.render_dropin(
                Path("/opt/raising-game-releases/abc"),
                Path("/opt/raising-game-demo/node_modules"),
            ),
            "[Service]\n"
            "WorkingDirectory=/opt/raising-game-releases/abc\n"
            "Environment=NODE_PATH=/opt/raising-game-demo/node_modules\n"
            "Environment=BACKGROUND_SCHEDULERS_ENABLED=0\n"
            "Environment=GENERATION_SUBMIT_QUEUE_ENABLED=0\n"
            "Environment=GENERATION_SUBMIT_WORKER_ENABLED=0\n",
        )

    def test_transaction_passes_fixed_canaries_and_expanded_hooks(self) -> None:
        args = ROLLING.parse_args([
            "--commit", "a" * 40,
            "--shared-assets", "/opt/shared/assets",
            "--migrate-command", "migrate __RELEASE__ __SHARED_ASSETS__",
            "--post-cutover-command", "verify __RELEASE__ __SHARED_ASSETS__",
        ])
        command = ROLLING.transaction_command(
            args,
            Path("/opt/releases/commit"),
            "4174",
        )
        self.assertIn("--canary-percent", command)
        self.assertEqual(command[command.index("--canary-percent") + 1], "1")
        self.assertEqual(command[command.index("--canary-second-percent") + 1], "5")
        self.assertIn("--migrate-command", command)
        self.assertIn(
            "migrate /opt/releases/commit /opt/shared/assets",
            command,
        )
        self.assertIn("--post-cutover-command", command)
        self.assertIn(
            "verify /opt/releases/commit /opt/shared/assets",
            command,
        )

    def test_dependency_manifests_must_match_the_candidate_node_modules(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            release = root / "release"
            dependency_root = root / "dependencies"
            node_modules = dependency_root / "node_modules"
            release.mkdir()
            node_modules.mkdir(parents=True)
            for name in ("package.json", "package-lock.json"):
                content = f'{{"name":"{name}"}}\n'
                (release / name).write_text(content, encoding="utf-8")
                (dependency_root / name).write_text(content, encoding="utf-8")
            ROLLING.validate_node_manifests(release, node_modules)

            (release / "package-lock.json").write_text('{"changed":true}\n', encoding="utf-8")
            with self.assertRaisesRegex(ROLLING.DeployError, "Node dependency manifest mismatch"):
                ROLLING.validate_node_manifests(release, node_modules)

    def test_canary_percentages_are_fixed_for_production(self) -> None:
        base = [
            "--commit", "a" * 40,
            "--canary-percent", "2",
        ]
        with self.assertRaises(SystemExit):
            ROLLING.parse_args(base)


if __name__ == "__main__":
    unittest.main()
