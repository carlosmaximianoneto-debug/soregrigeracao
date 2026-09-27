import importlib.util
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "publish_route.py"
SPEC = importlib.util.spec_from_file_location("publish_route", SCRIPT)
route = importlib.util.module_from_spec(SPEC)
import sys
sys.modules[SPEC.name] = route
SPEC.loader.exec_module(route)

OLD = "https://chat.whatsapp.com/BbamrdNpvnq3MfcKAnJEmn"
NEW = "https://chat.whatsapp.com/LyTx6gzzSte1xOwJXQBt9a"
REV = "3c64aa91-ac61-41f1-adfd-d765135380df"


def html(invite=OLD):
    return "<html><a href=\"%s\">A</a><a href=\"%s\">B</a><a href=\"%s\">C</a></html>" % ((invite,) * 3)


def manifest(**changes):
    value = {
        "status": "ready", "revision": REV, "mode": "manual", "group_number": 8,
        "expected_invite_url": OLD, "target_invite_url": NEW,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat().replace("+00:00", "Z"),
    }
    value.update(changes)
    return route.parse_manifest(json.dumps(value))


def publishing():
    value = {
        "status": "publishing", "revision": REV, "mode": "manual", "group_number": 8,
        "expected_invite_url": OLD, "target_invite_url": NEW,
        "lease_expires_at": (datetime.now(timezone.utc) + timedelta(minutes=9)).isoformat().replace("+00:00", "Z"),
    }
    return route.parse_manifest(json.dumps(value))


class RoutePublisherTests(unittest.TestCase):
    def test_oidc_request_uses_exact_audience_and_rejects_foreign_host(self):
        url = route.oidc_request_url("https://pipelines.actions.githubusercontent.com/token?job=123")
        self.assertEqual(parse_qs(urlsplit(url).query)["audience"], ["acbot-route-manifest"])
        with self.assertRaises(route.RouteError):
            route.oidc_request_url("https://evil.example/token?job=123")
        with self.assertRaises(route.RouteError):
            route.oidc_request_url("https://pipelines.actions.githubusercontent.com/token?audience=evil")

    def test_oidc_token_is_sent_only_as_bearer_and_never_logged(self):
        class Response:
            status = 200
            url = "https://pipelines.actions.githubusercontent.com/token?job=123&audience=acbot-route-manifest"

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self, *_):
                return b'{"value":"header.payload.signature"}'

        class Opener:
            def open(self, request, timeout):
                self_ref.assertEqual(timeout, 15)
                self_ref.assertEqual(request.get_header("Authorization"), "Bearer short-lived-test-token")
                return Response()

        self_ref = self
        with patch.object(route, "build_opener", return_value=Opener()):
            self.assertEqual(route.request_oidc_token(
                "https://pipelines.actions.githubusercontent.com/token?job=123",
                "short-lived-test-token"), "header.payload.signature")
        with self.assertRaises(route.RouteError):
            route.read_https(route.MANIFEST_URL, "application/json", 4096)

    def test_runner_credential_larger_than_4k_is_forwarded_without_logging(self):
        import io
        from contextlib import redirect_stdout, redirect_stderr
        opaque = "synthetic-runner-credential-" + "x" * 8192
        class Response:
            status = 200
            url = "https://pipelines.actions.githubusercontent.com/token?job=123&audience=acbot-route-manifest"
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self, *_): return b'{"value":"header.payload.signature"}'
        class Opener:
            def open(self, request, timeout):
                self_ref.assertEqual(request.get_header("Authorization"), "Bearer " + opaque)
                return Response()
        self_ref = self
        stdout, stderr = io.StringIO(), io.StringIO()
        with patch.object(route, "build_opener", return_value=Opener()), \
             redirect_stdout(stdout), redirect_stderr(stderr):
            self.assertEqual(route.request_oidc_token(
                "https://pipelines.actions.githubusercontent.com/token?job=123", opaque),
                "header.payload.signature")
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(stderr.getvalue(), "")

    def test_missing_or_unsafe_runner_credential_never_performs_http(self):
        with patch.object(route, "build_opener") as opener:
            for credential in ("", "token\r\nX-Leak: data", "token with space", "token\x00", "tókén"):
                with self.subTest(case=len(credential)), self.assertRaises(route.RouteError):
                    route.request_oidc_token("https://pipelines.actions.githubusercontent.com/token?job=123", credential)
            opener.assert_not_called()

    def test_idle_and_valid_plan_do_not_change_current_site(self):
        self.assertIsNone(route.parse_manifest('{"status":"idle"}'))
        self.assertEqual(route.plan_route(None, html(), html()).action, "idle")
        self.assertEqual(route.plan_route(manifest(), html(), html()).action, "commit")
        with self.assertRaises(route.RouteError):
            route.plan_route(manifest(), html(NEW), html())

    def test_publishing_manifest_only_waits_or_reconciles(self):
        active = publishing()
        self.assertEqual(route.parse_utc("2026-09-25T23:00:00+00:00"),
                         route.parse_utc("2026-09-25T23:00:00Z"))
        self.assertEqual(route.plan_route(active, html(), html()).action, "claimed_wait")
        self.assertEqual(route.plan_route(active, html(NEW), html()).action, "wait")
        self.assertEqual(route.plan_route(active, html(NEW), html(NEW)).action, "reconcile")
        with self.assertRaises(route.RouteError):
            route.plan_route(active, html(), html(NEW))

    def test_exactly_three_identical_invites_are_required(self):
        for bad in [html().replace("<a", "<span", 1),
                    html().replace(OLD, NEW, 1),
                    html().replace(OLD, OLD + "?tracking=1", 1),
                    html().replace(OLD, "https://evil.test/" + OLD, 1)]:
            with self.subTest(bad=bad), self.assertRaises(route.RouteError):
                route.single_invite(bad)

    def test_refuses_stale_or_unexpected_live_site(self):
        with self.assertRaises(route.RouteError):
            route.plan_route(manifest(), html(), html(NEW))
        with self.assertRaises(route.RouteError):
            route.plan_route(None, html(), html(NEW))

    def test_replacement_changes_only_three_href_values(self):
        original = html() + "<!-- Netlify or product markup stays intact -->"
        self.assertEqual(route.replace_invites(original, OLD, NEW),
                         original.replace(f'href="{OLD}"', f'href="{NEW}"'))
        with self.assertRaises(route.RouteError):
            route.replace_invites(original, NEW, OLD)

    def test_rejects_invalid_manifest_shape_and_urls(self):
        for change in [{"target_invite_url": "https://evil.test/x"},
                       {"target_invite_url": "https://chat.whatsapp.com/short"},
                       {"target_invite_url": NEW + "?source=site"},
                       {"mode": "unknown"}, {"group_number": True},
                       {"revision": "not-uuid"},
                       {"target_invite_url": OLD},
                       {"expires_at": (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat().replace("+00:00", "Z")}]:
            with self.subTest(change=change), self.assertRaises(route.RouteError):
                manifest(**change)
        with self.assertRaises(route.RouteError):
            route.parse_manifest('{"status":"idle","extra":1}')

    def test_claim_and_reconcile_require_exact_revision_and_response(self):
        lease = (datetime.now(timezone.utc) + timedelta(minutes=9)).isoformat().replace("+00:00", "Z")
        published = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        with patch.object(route, "post_action", return_value={
            "status": "claimed", "revision": REV, "lease_expires_at": lease,
        }) as post:
            route.claim_route(REV)
            post.assert_called_once_with("claim", REV)
        with patch.object(route, "post_action", return_value={
            "status": "applied", "revision": REV, "git_commit_sha": "a" * 40,
            "published_at": published,
        }) as post:
            route.reconcile_route(REV, timeout_seconds=0)
            post.assert_called_once_with("reconcile", REV)
        with patch.object(route, "post_action", return_value={
            "status": "claimed", "revision": "wrong", "lease_expires_at": lease,
        }), self.assertRaises(route.RouteError):
            route.claim_route(REV)

    def test_action_posts_revision_with_fresh_oidc_to_only_the_edge_function(self):
        class Response:
            status = 200
            url = route.MANIFEST_URL + "?action=claim"
            headers = {"Content-Type": "application/json", "Cache-Control": "no-store"}

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self, *_):
                return json.dumps({"status": "claimed", "revision": REV,
                                   "lease_expires_at": "2026-09-25T23:00:00Z"}).encode()

        class Opener:
            def open(self, request, timeout):
                self_ref.assertEqual(timeout, 20)
                self_ref.assertEqual(request.full_url, route.MANIFEST_URL + "?action=claim")
                self_ref.assertEqual(request.get_method(), "POST")
                self_ref.assertEqual(request.get_header("Authorization"), "Bearer short-lived.jwt.signature")
                self_ref.assertEqual(json.loads(request.data), {"revision": REV})
                return Response()

        self_ref = self
        with patch.object(route, "request_oidc_token", return_value="short-lived.jwt.signature") as token, \
             patch.object(route, "build_opener", return_value=Opener()), \
             patch.dict("os.environ", {"ACTIONS_ID_TOKEN_REQUEST_URL": "https://pipelines.actions.githubusercontent.com/token",
                                        "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "ephemeral"}):
            self.assertEqual(route.post_action("claim", REV)["status"], "claimed")
            token.assert_called_once()

    def test_publishing_state_never_claims_or_pushes(self):
        with patch.dict("os.environ", {"GITHUB_ACTIONS": "true",
                                       "GITHUB_REPOSITORY": route.REPOSITORY,
                                       "GITHUB_REF": "refs/heads/main"}), \
             patch.object(route, "assert_git_ready"), \
             patch.object(route, "request_oidc_token", return_value="identity"), \
             patch.object(route, "load_manifest", return_value=publishing()), \
             patch.object(route, "read_index", return_value=html()), \
             patch.object(route, "load_live", return_value=html()), \
             patch.object(route, "claim_route") as claim, \
             patch.object(route, "git") as git:
            self.assertEqual(route.main(), 0)
            claim.assert_not_called()
            git.assert_not_called()

    def test_ready_state_claims_before_commit_and_push(self):
        actions = []
        ready = manifest()

        def fake_git(*args):
            actions.append(args[0])
            if args[:2] == ("status", "--porcelain=v1"):
                return "M index.html"
            if args[:3] == ("diff", "--cached", "--name-only"):
                return "index.html"
            return ""

        handle, path = tempfile.mkstemp(prefix="route-test-", suffix=".html", dir=SCRIPT.parent.parent / "tests")
        os.close(handle)
        index = Path(path)
        try:
            index.write_text(html(), encoding="utf-8")
            with patch.dict("os.environ", {"GITHUB_ACTIONS": "true",
                                           "GITHUB_REPOSITORY": route.REPOSITORY,
                                           "GITHUB_REF": "refs/heads/main"}), \
                 patch.object(route, "INDEX", index), \
                 patch.object(route, "assert_git_ready"), \
                 patch.object(route, "request_oidc_token", return_value="identity"), \
                 patch.object(route, "load_manifest", return_value=ready), \
                 patch.object(route, "load_live", return_value=html()), \
                 patch.object(route, "git", side_effect=fake_git), \
                 patch.object(route, "claim_route", side_effect=lambda _: actions.append("claim")), \
                 patch.object(route, "wait_for_live"), \
                 patch.object(route, "reconcile_route") as reconcile:
                self.assertEqual(route.main(), 0)
                self.assertEqual(route.single_invite(index.read_text(encoding="utf-8")), NEW)
                self.assertLess(actions.index("claim"), actions.index("commit"))
                self.assertLess(actions.index("commit"), actions.index("push"))
                reconcile.assert_called_once_with(REV)
        finally:
            index.unlink(missing_ok=True)


    def test_commit_failure_releases_but_push_failure_preserves_uncertain_claim(self):
        for failure in ("commit", "push"):
            with self.subTest(failure=failure):
                ready = manifest()
                def fake_git(*args):
                    if args[0] == failure:
                        raise route.RouteError("simulated safe failure")
                    if args[:2] == ("status", "--porcelain=v1"):
                        return "M index.html"
                    if args[:3] == ("diff", "--cached", "--name-only"):
                        return "index.html"
                    return ""
                handle, path = tempfile.mkstemp(prefix="route-test-", suffix=".html", dir=SCRIPT.parent.parent / "tests")
                os.close(handle)
                index = Path(path)
                try:
                    index.write_text(html(), encoding="utf-8")
                    with patch.dict("os.environ", {"GITHUB_ACTIONS": "true", "GITHUB_REPOSITORY": route.REPOSITORY, "GITHUB_REF": "refs/heads/main"}), \
                         patch.object(route, "INDEX", index), \
                         patch.object(route, "assert_git_ready"), \
                         patch.object(route, "request_oidc_token", return_value="identity"), \
                         patch.object(route, "load_manifest", return_value=ready), \
                         patch.object(route, "load_live", return_value=html()), \
                         patch.object(route, "git", side_effect=fake_git), \
                         patch.object(route, "claim_route"), \
                         patch.object(route, "release_route") as release, \
                         patch.object(route, "reconcile_route") as reconcile:
                        with self.assertRaises(route.RouteError):
                            route.main()
                        if failure == "commit":
                            release.assert_called_once_with(REV)
                        else:
                            release.assert_not_called()
                        reconcile.assert_not_called()
                finally:
                    index.unlink(missing_ok=True)

    def test_git_timeout_is_sanitized(self):
        import subprocess
        with patch.object(route.subprocess, "run", side_effect=subprocess.TimeoutExpired("git private-output",30)):
            with self.assertRaisesRegex(route.RouteError,"Git indisponível em push"):
                route.git("push","origin","HEAD:main")


if __name__ == "__main__":
    unittest.main()
