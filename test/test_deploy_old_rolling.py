import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "deploy_old_rolling.py"
SPEC = importlib.util.spec_from_file_location("deploy_old_rolling", SCRIPT)
ROLLING = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ROLLING)


class DeployOldRollingTests(unittest.TestCase):
    def test_release_pruning_keeps_loaded_and_newest_immutable_releases(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            releases = []
            for index in range(6):
                commit = f"{index + 1:040x}"
                release = root / commit
                release.mkdir()
                (release / "RELEASE_COMMIT").write_text(commit + "\n", encoding="utf-8")
                os.utime(release, (1000 + index, 1000 + index))
                releases.append(release)
            stale_loaded = releases[0]
            unknown = root / "not-a-release"
            unknown.mkdir()
            removed = ROLLING.prune_old_releases(root, {stale_loaded}, retain=3)

            self.assertEqual([path.name for path in removed], [releases[2].name, releases[1].name])
            self.assertTrue(stale_loaded.is_dir())
            self.assertTrue(unknown.is_dir())
            self.assertEqual(
                sorted(path.name for path in root.iterdir() if path.is_dir()),
                sorted([stale_loaded.name, *[path.name for path in releases[3:]], unknown.name]),
            )

    def test_release_copy_requires_free_disk_headroom(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            usage = type("Usage", (), {"free": ROLLING.DEFAULT_MINIMUM_FREE_BYTES - 1})
            with mock.patch.object(ROLLING.shutil, "disk_usage", return_value=usage):
                with self.assertRaisesRegex(ROLLING.DeployError, "insufficient free disk"):
                    ROLLING.validate_release_disk_capacity(root)
            usage.free = ROLLING.DEFAULT_MINIMUM_FREE_BYTES
            with mock.patch.object(ROLLING.shutil, "disk_usage", return_value=usage):
                ROLLING.validate_release_disk_capacity(root)

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

    def test_default_transaction_includes_live_and_all_public_health_urls(self) -> None:
        self.assertIn(Path("/etc/nginx/sites-enabled/live.123vipeak.com"), ROLLING.DEFAULT_NGINX_FILES)
        self.assertIn("raising_game_app_live", ROLLING.DEFAULT_UPSTREAM_NAMES)
        self.assertIn("https://live.123vipeak.com/api/health", ROLLING.DEFAULT_HEALTH_URLS)

    def test_upstream_coverage_accepts_every_referenced_dual_port_group(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            primary = root / "default"
            chat = root / "chat"
            live = root / "live"
            unused = root / "unused"
            primary.write_text(
                "upstream app { server 127.0.0.1:4174; server 127.0.0.1:4175 backup; }\n"
                "location / { proxy_pass http://app; }\n", encoding="utf-8")
            chat.write_text(
                "upstream chat { server 127.0.0.1:4174; server 127.0.0.1:4175 backup; }\n"
                "location / { proxy_pass http://chat; }\n", encoding="utf-8")
            live.write_text(
                "upstream live { server 127.0.0.1:4174; server 127.0.0.1:4175 backup; }\n"
                "location / { proxy_pass http://live; }\n", encoding="utf-8")
            unused.write_text(
                "upstream unused { server 127.0.0.1:4174; }\n", encoding="utf-8")
            ROLLING.validate_upstream_coverage(
                root,
                [primary, chat, live],
                ["app", "chat", "live"],
                "4174",
                "4175",
            )

    def test_upstream_coverage_rejects_a_referenced_group_missing_from_transaction(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            primary = root / "default"
            live = root / "live"
            primary.write_text(
                "upstream app { server 127.0.0.1:4174; server 127.0.0.1:4175 backup; }\n"
                "location / { proxy_pass http://app; }\n", encoding="utf-8")
            live.write_text(
                "upstream live { server 127.0.0.1:4174; server 127.0.0.1:4175 backup; }\n"
                "location / { proxy_pass http://live; }\n", encoding="utf-8")
            with self.assertRaisesRegex(ROLLING.DeployError, "missing from the deployment transaction: live"):
                ROLLING.validate_upstream_coverage(
                    root,
                    [primary],
                    ["app"],
                    "4174",
                    "4175",
                )

    def test_release_marker_must_not_be_symlinked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "marker-target"
            target.write_text(f"{'a' * 40}\n", encoding="utf-8")
            (root / "RELEASE_COMMIT").symlink_to(target)
            with self.assertRaisesRegex(ROLLING.DeployError, "marker is missing or unsafe"):
                ROLLING.release_marker(root)

    def test_dropin_targets_one_service_suffix(self) -> None:
        self.assertEqual(
            ROLLING.dropin_path("raising-game-demo-b.service"),
            Path("/etc/systemd/system/raising-game-demo-b.service.d/zz-release-root.conf"),
        )
        self.assertEqual(
            ROLLING.dropin_path("raising-game-demo-b"),
            Path("/etc/systemd/system/raising-game-demo-b.service.d/zz-release-root.conf"),
        )

    def test_release_dropin_sorts_after_working_directory_overrides(self) -> None:
        self.assertGreater(
            ROLLING.dropin_path("raising-game-demo.service").name,
            "isolated-google-login.conf",
        )

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
        self.assertEqual(command[command.index("--primary-port") + 1], "4174")
        self.assertEqual(command[command.index("--candidate-port") + 1], "4175")

    def test_transaction_roles_follow_current_active_port(self) -> None:
        args = ROLLING.parse_args([
            "--commit", "a" * 40,
            "--shared-assets", "/opt/shared/assets",
            "--primary-service", "primary.service",
            "--candidate-service", "candidate.service",
            "--primary-port", "4174",
            "--candidate-port", "4175",
        ])
        command = ROLLING.transaction_command(
            args,
            Path("/opt/releases/commit"),
            "4175",
        )
        self.assertEqual(command[command.index("--primary-service") + 1], "candidate.service")
        self.assertEqual(command[command.index("--candidate-service") + 1], "primary.service")
        self.assertEqual(command[command.index("--primary-port") + 1], "4175")
        self.assertEqual(command[command.index("--candidate-port") + 1], "4174")

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

    def test_candidate_only_mode_is_explicit_and_safe_by_default(self) -> None:
        args = ROLLING.parse_args(["--commit", "a" * 40, "--candidate-only"])
        self.assertTrue(args.candidate_only)
        self.assertFalse(args.apply)

    def test_candidate_only_apply_restarts_candidate_and_keeps_primary_identity(self) -> None:
        args = ROLLING.parse_args([
            "--commit", "a" * 40,
            "--candidate-only",
            "--apply",
            "--primary-service", "primary.service",
            "--candidate-service", "candidate.service",
        ])
        rolling = mock.Mock()
        rolling.require_active.side_effect = lambda service, *_args: "222" if service == "candidate.service" else "111"
        rolling.systemctl_show.side_effect = lambda service, *_args: {
            "ActiveState": "active",
            "SubState": "running",
            "MainPID": "222" if service == "candidate.service" else "111",
            "NRestarts": "0",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / "candidate-dropin.conf"
            destination.write_text("previous\n", encoding="utf-8")
            with mock.patch.object(ROLLING, "run") as run_mock:
                pid = ROLLING.activate_inactive_candidate(
                    args,
                    rolling,
                    active_service="primary.service",
                    active_port="4174",
                    candidate_service="candidate.service",
                    candidate_port="4175",
                    release=root / "release",
                    node_path=root / "node_modules",
                    destination=destination,
                    previous_dropin=b"previous\n",
                )
            self.assertEqual(pid, 222)
            run_mock.assert_any_call(["systemctl", "daemon-reload"], timeout=60)
            run_mock.assert_any_call(["systemctl", "restart", "candidate.service"], timeout=120)
            self.assertNotIn("previous", destination.read_text(encoding="utf-8"))
            rolling.wait_loaded_candidate.assert_called_once()
            self.assertEqual(rolling.wait_http_200.call_count, 9)
            public_urls = [call.args[0] for call in rolling.wait_http_200.call_args_list[-3:]]
            self.assertEqual(public_urls, list(ROLLING.DEFAULT_HEALTH_URLS))

    def test_candidate_only_can_update_primary_when_candidate_holds_traffic(self) -> None:
        args = ROLLING.parse_args([
            "--commit", "a" * 40,
            "--candidate-only",
            "--apply",
            "--primary-service", "primary.service",
            "--candidate-service", "candidate.service",
        ])
        rolling = mock.Mock()
        rolling.require_active.side_effect = lambda service, *_args: "222" if service == "candidate.service" else "111"
        rolling.systemctl_show.side_effect = lambda service, *_args: {
            "ActiveState": "active",
            "SubState": "running",
            "MainPID": "222" if service == "candidate.service" else "111",
            "NRestarts": "0",
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / "primary-dropin.conf"
            destination.write_text("previous\n", encoding="utf-8")
            with mock.patch.object(ROLLING, "run") as run_mock:
                pid = ROLLING.activate_inactive_candidate(
                    args,
                    rolling,
                    active_service="candidate.service",
                    active_port="4175",
                    candidate_service="primary.service",
                    candidate_port="4174",
                    release=root / "release",
                    node_path=root / "node_modules",
                    destination=destination,
                    previous_dropin=b"previous\n",
                )
            self.assertEqual(pid, 111)
            run_mock.assert_any_call(["systemctl", "restart", "primary.service"], timeout=120)
            rolling.require_active.assert_any_call("candidate.service", "systemctl")
            rolling.require_active.assert_any_call("primary.service", "systemctl")
            rolling.systemctl_show.assert_any_call(
                "candidate.service",
                "ActiveState,SubState,MainPID,NRestarts",
                "systemctl",
            )

    def test_candidate_only_failure_restores_old_candidate_without_touching_primary(self) -> None:
        args = ROLLING.parse_args([
            "--commit", "a" * 40,
            "--candidate-only",
            "--apply",
            "--primary-service", "primary.service",
            "--candidate-service", "candidate.service",
        ])
        rolling = mock.Mock()
        rolling.require_active.return_value = "111"
        rolling.wait_loaded_candidate.side_effect = ROLLING.DeployError("candidate failed")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            destination = root / "candidate-dropin.conf"
            destination.write_text("previous\n", encoding="utf-8")
            with mock.patch.object(ROLLING, "run") as run_mock:
                with self.assertRaisesRegex(ROLLING.DeployError, "candidate failed"):
                    ROLLING.activate_inactive_candidate(
                        args,
                        rolling,
                        active_service="primary.service",
                        active_port="4174",
                        candidate_service="candidate.service",
                        candidate_port="4175",
                        release=root / "release",
                        node_path=root / "node_modules",
                        destination=destination,
                        previous_dropin=b"previous\n",
                    )
            self.assertEqual(destination.read_text(encoding="utf-8"), "previous\n")
            restart_calls = [call for call in run_mock.call_args_list if call.args[0][:2] == ["systemctl", "restart"]]
            self.assertEqual(restart_calls, [
                mock.call(["systemctl", "restart", "candidate.service"], timeout=120),
                mock.call(["systemctl", "restart", "candidate.service"], timeout=120),
            ])
            self.assertFalse(any("primary.service" in call.args[0] for call in restart_calls))

    def test_canary_percentages_are_fixed_for_production(self) -> None:
        base = [
            "--commit", "a" * 40,
            "--canary-percent", "2",
        ]
        with self.assertRaises(SystemExit):
            ROLLING.parse_args(base)


if __name__ == "__main__":
    unittest.main()
