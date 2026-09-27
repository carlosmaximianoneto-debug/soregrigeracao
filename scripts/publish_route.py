#!/usr/bin/env python3
"""Publish an approved WhatsApp group invite through one Git commit.

The authenticated manifest is a proposal, never proof that Netlify deployed it.
GitHub supplies short-lived OIDC and repository-scoped GITHUB_TOKEN credentials;
neither is stored on the VPS, in the repository, or in output.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


MANIFEST_URL = "https://xlwiwxaghbkdwbtwagwo.supabase.co/functions/v1/acbot-route-manifest"
SITE_URL = "https://sorefrigeracao.netlify.app/"
REPOSITORY = "carlosmaximianoneto-debug/soregrigeracao"
OIDC_AUDIENCE = "acbot-route-manifest"
INVITE = re.compile(r"https://chat\.whatsapp\.com/[A-Za-z0-9]{10,64}\Z")
UTC_STAMP = re.compile(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+00:00)\Z")
ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"


class RouteError(RuntimeError):
    pass


@dataclass(frozen=True)
class Manifest:
    status: str
    revision: str
    mode: str
    group_number: int
    expected_invite_url: str
    target_invite_url: str
    expires_at: datetime | None
    lease_expires_at: datetime | None


@dataclass(frozen=True)
class Plan:
    action: str
    current_invite_url: str
    target_invite_url: str | None


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise RouteError("Redirecionamento HTTP inesperado")


def read_https(url: str, accept: str, max_bytes: int, bearer: str | None = None) -> tuple[str, object]:
    if url not in (MANIFEST_URL, SITE_URL):
        raise RouteError("Origem HTTP não autorizada")
    headers = {"Accept": accept, "Cache-Control": "no-cache"}
    if url == MANIFEST_URL:
        if not bearer:
            raise RouteError("Identidade do workflow ausente")
        headers["Authorization"] = f"Bearer {bearer}"
    request = Request(url, headers=headers)
    try:
        with build_opener(NoRedirect).open(request, timeout=15) as response:
            if response.status != 200 or response.url != url:
                raise RouteError("Resposta HTTP inesperada")
            payload = response.read(max_bytes + 1)
            if len(payload) > max_bytes:
                raise RouteError("Resposta HTTP grande demais")
            return payload.decode("utf-8"), response.headers
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError) as error:
        raise RouteError("Falha ao ler origem remota") from error


def oidc_request_url(base_url: str) -> str:
    parts = urlsplit(base_url)
    hostname = (parts.hostname or "").lower()
    if parts.scheme != "https" or parts.username or parts.password or parts.fragment or \
       not (hostname == "actions.githubusercontent.com" or
            hostname.endswith(".actions.githubusercontent.com")):
        raise RouteError("Emissor OIDC inesperado")
    query = parse_qsl(parts.query, keep_blank_values=True)
    if any(key == "audience" for key, _ in query):
        raise RouteError("Audiência OIDC duplicada")
    query.append(("audience", OIDC_AUDIENCE))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))


def request_oidc_token(base_url: str, request_token: str) -> str:
    if not request_token or len(request_token) > 4096:
        raise RouteError("Credencial OIDC indisponível")
    url = oidc_request_url(base_url)
    request = Request(url, headers={"Authorization": f"Bearer {request_token}",
                                    "Accept": "application/json"})
    try:
        with build_opener(NoRedirect).open(request, timeout=15) as response:
            if response.status != 200 or response.url != url:
                raise RouteError("Resposta OIDC inesperada")
            raw = response.read(16385)
            if len(raw) > 16384:
                raise RouteError("Resposta OIDC grande demais")
            payload = json.loads(raw.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RouteError("Não foi possível obter identidade OIDC") from error
    token = payload.get("value") if isinstance(payload, dict) else None
    if not isinstance(token, str) or len(token) > 12000 or \
       not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token):
        raise RouteError("Token OIDC inválido")
    return token


def parse_utc(value: object) -> datetime:
    if not isinstance(value, str) or not UTC_STAMP.fullmatch(value):
        raise RouteError("Validade do manifesto inválida")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise RouteError("Validade do manifesto inválida") from error


def valid_invite(value: object) -> str:
    if not isinstance(value, str) or not INVITE.fullmatch(value):
        raise RouteError("Convite do WhatsApp inválido")
    return value


def parse_manifest(raw: str, now: datetime | None = None) -> Manifest | None:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise RouteError("Manifesto JSON inválido") from error
    if not isinstance(payload, dict):
        raise RouteError("Manifesto não é objeto")
    if payload == {"status": "idle"}:
        return None
    common = {
        "status", "revision", "mode", "group_number", "expected_invite_url",
        "target_invite_url",
    }
    status = payload.get("status")
    if status == "ready":
        required = common | {"expires_at"}
    elif status == "publishing":
        required = common | {"lease_expires_at"}
    else:
        raise RouteError("Estado do manifesto desconhecido")
    if set(payload) != required:
        raise RouteError("Contrato do manifesto divergente")
    revision = payload["revision"]
    if not isinstance(revision, str):
        raise RouteError("Revisão inválida")
    try:
        parsed_revision = uuid.UUID(revision)
    except (ValueError, AttributeError) as error:
        raise RouteError("Revisão inválida") from error
    if str(parsed_revision) != revision.lower() or payload["mode"] not in ("manual", "automatic"):
        raise RouteError("Revisão ou modo inválido")
    group_number = payload["group_number"]
    if type(group_number) is not int or not 1 <= group_number <= 99:
        raise RouteError("Número do grupo inválido")
    current = now or datetime.now(timezone.utc)
    expiry = parse_utc(payload["expires_at"]) if status == "ready" else None
    lease = parse_utc(payload["lease_expires_at"]) if status == "publishing" else None
    if expiry is not None and (expiry <= current or expiry > current + timedelta(days=1)):
        raise RouteError("Manifesto vencido ou validade excessiva")
    old_invite = valid_invite(payload["expected_invite_url"])
    new_invite = valid_invite(payload["target_invite_url"])
    if old_invite == new_invite:
        raise RouteError("Novo convite é igual ao atual")
    if lease is not None and lease > current + timedelta(minutes=11):
        raise RouteError("Reserva de publicação longa demais")
    return Manifest(
        status=status, revision=revision.lower(), mode=payload["mode"], group_number=group_number,
        expected_invite_url=old_invite, target_invite_url=new_invite,
        expires_at=expiry, lease_expires_at=lease,
    )


class WhatsAppLinks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        hrefs = [value for key, value in attrs if key.lower() == "href"]
        if len(hrefs) > 1:
            raise RouteError("Âncora com href duplicado")
        if hrefs and hrefs[0] and "chat.whatsapp.com" in hrefs[0].lower():
            self.links.append(hrefs[0])


def single_invite(html: str) -> str:
    parser = WhatsAppLinks()
    parser.feed(html)
    if len(parser.links) != 3:
        raise RouteError("O HTML deve ter exatamente três links de convite")
    links = [valid_invite(link) for link in parser.links]
    if len(set(links)) != 1:
        raise RouteError("Os três convites do HTML são diferentes")
    return links[0]


def plan_route(manifest: Manifest | None, repo_html: str, live_html: str) -> Plan:
    repo_link = single_invite(repo_html)
    live_link = single_invite(live_html)
    if manifest is None:
        if repo_link != live_link:
            raise RouteError("Netlify e Git divergem mesmo sem publicação pendente")
        return Plan("idle", repo_link, None)
    expected, target = manifest.expected_invite_url, manifest.target_invite_url
    if manifest.status == "publishing":
        if repo_link == target and live_link == target:
            return Plan("reconcile", repo_link, target)
        if repo_link == target and live_link == expected:
            return Plan("wait", repo_link, target)
        if repo_link == expected and live_link == expected:
            return Plan("claimed_wait", repo_link, target)
        raise RouteError("Convite em publicação diverge de Git ou Netlify")
    if manifest.status != "ready":
        raise RouteError("Estado de publicação inesperado")
    if repo_link == target and live_link == target:
        raise RouteError("Manifesto pendente mas rota já foi publicada")
    if repo_link == target and live_link == expected:
        raise RouteError("Manifesto pendente mas Git já mudou")
    if repo_link == expected and live_link == expected:
        if target == expected:
            return Plan("published", repo_link, target)
        return Plan("commit", repo_link, target)
    raise RouteError("Convite atual diverge do manifesto, Git ou Netlify")


def replace_invites(html: str, expected: str, target: str) -> str:
    if single_invite(html) != expected:
        raise RouteError("Convite de origem mudou")
    marker = f'href="{expected}"'
    if html.count(marker) != 3:
        raise RouteError("O formato dos três hrefs mudou")
    result = html.replace(marker, f'href="{target}"')
    if single_invite(result) != target:
        raise RouteError("Falha na substituição dos convites")
    return result


def git(*args: str) -> str:
    try:
        result = subprocess.run(["git", *args], cwd=ROOT, text=True,
                                capture_output=True, check=False, timeout=30)
    except (subprocess.TimeoutExpired, OSError) as error:
        raise RouteError(f"Git indisponível em {args[0]}") from error
    if result.returncode != 0:
        raise RouteError(f"Git falhou em {args[0]}")
    return result.stdout.strip()


def read_index() -> str:
    # Preserve CRLF/LF exactly; a route commit must change only three hrefs.
    try:
        return INDEX.read_bytes().decode("utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise RouteError("Não foi possível ler index.html") from error


def assert_git_ready() -> None:
    if git("status", "--porcelain=v1"):
        raise RouteError("Checkout contém mudanças locais")
    git("fetch", "--quiet", "origin", "main")
    if git("rev-parse", "HEAD") != git("rev-parse", "FETCH_HEAD"):
        raise RouteError("Checkout ficou atrás do ramo main; aguarde a próxima execução")


def load_manifest(oidc_token: str) -> Manifest | None:
    raw, headers = read_https(MANIFEST_URL, "application/json", 4096, oidc_token)
    if "application/json" not in headers.get("Content-Type", "").lower():
        raise RouteError("Manifesto sem tipo JSON")
    if "no-store" not in headers.get("Cache-Control", "").lower():
        raise RouteError("Manifesto pode estar em cache")
    return parse_manifest(raw)


def post_action(action: str, revision: str) -> dict:
    """Make a revision-scoped, OIDC-authenticated state transition."""
    if action not in ("claim", "reconcile", "release") or not isinstance(revision, str):
        raise RouteError("Ação de publicação inválida")
    try:
        parsed_revision = uuid.UUID(revision)
    except (ValueError, AttributeError) as error:
        raise RouteError("Revisão da ação inválida") from error
    if str(parsed_revision) != revision.lower():
        raise RouteError("Revisão da ação inválida")
    url = f"{MANIFEST_URL}?action={action}"
    token = request_oidc_token(
        os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", ""),
        os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", ""),
    )
    request = Request(
        url,
        data=json.dumps({"revision": revision}).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "Accept": "application/json", "Cache-Control": "no-cache"},
        method="POST",
    )
    try:
        with build_opener(NoRedirect).open(request, timeout=20) as response:
            if response.status != 200 or response.url != url:
                raise RouteError("Resposta da ação inesperada")
            if "application/json" not in response.headers.get("Content-Type", "").lower() or \
               "no-store" not in response.headers.get("Cache-Control", "").lower():
                raise RouteError("Resposta da ação sem cabeçalhos de segurança")
            raw = response.read(4097)
            if len(raw) > 4096:
                raise RouteError("Resposta da ação grande demais")
            payload = json.loads(raw.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RouteError("Falha na ação remota de publicação") from error
    if not isinstance(payload, dict) or payload.get("revision") != revision:
        raise RouteError("Resposta da ação com revisão divergente")
    return payload


def claim_route(revision: str) -> None:
    payload = post_action("claim", revision)
    if set(payload) != {"status", "revision", "lease_expires_at"} or \
       payload["status"] != "claimed" or payload["revision"] != revision or \
       parse_utc(payload["lease_expires_at"]) <= datetime.now(timezone.utc):
        raise RouteError("Publicação não foi reservada")


def reconcile_route(revision: str, timeout_seconds: int = 60) -> None:
    deadline = time.monotonic() + timeout_seconds
    while True:
        payload = post_action("reconcile", revision)
        if payload.get("revision") != revision:
            raise RouteError("Resposta da conciliação com revisão divergente")
        if payload.get("status") == "applied":
            sha = payload.get("git_commit_sha")
            if set(payload) != {"status", "revision", "git_commit_sha", "published_at"} or \
               not isinstance(sha, str) or not re.fullmatch(r"[a-f0-9]{40}", sha) or \
               parse_utc(payload.get("published_at")) > datetime.now(timezone.utc) + timedelta(minutes=1):
                raise RouteError("Confirmação de publicação inválida")
            return
        if set(payload) != {"status", "revision", "reason"} or \
           payload.get("status") != "publishing" or \
           payload.get("reason") not in ("git_pending", "netlify_pending"):
            raise RouteError("Estado de publicação desconhecido")
        if time.monotonic() >= deadline:
            raise RouteError("Publicação ainda não confirmada no banco")
        time.sleep(10)


def release_route(revision: str) -> None:
    payload = post_action("release", revision)
    if payload.get("revision") != revision or \
       payload.get("status") not in ("pending", "publishing", "expired"):
        raise RouteError("Liberação da reserva não confirmada")


def load_live() -> str:
    raw, headers = read_https(SITE_URL, "text/html", 250_000)
    if "text/html" not in headers.get("Content-Type", "").lower():
        raise RouteError("Netlify não retornou HTML")
    return raw


def wait_for_live(target: str, expected: str, timeout_seconds: int = 180) -> None:
    deadline = time.monotonic() + timeout_seconds
    while True:
        live_link = single_invite(load_live())
        if live_link == target:
            return
        if live_link != expected:
            raise RouteError("Netlify publicou um convite inesperado")
        if time.monotonic() >= deadline:
            raise RouteError("Netlify ainda não publicou o novo convite")
        time.sleep(10)


def main() -> int:
    if os.environ.get("GITHUB_ACTIONS") != "true" or \
       os.environ.get("GITHUB_REPOSITORY") != REPOSITORY or \
       os.environ.get("GITHUB_REF") != "refs/heads/main":
        raise RouteError("Execução fora do workflow de produção")
    assert_git_ready()
    oidc_token = request_oidc_token(
        os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", ""),
        os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", ""),
    )
    manifest = load_manifest(oidc_token)
    repo_html = read_index()
    route = plan_route(manifest, repo_html, load_live())
    if route.action == "idle":
        print(f"route_{route.action}")
        return 0
    if route.action == "claimed_wait":
        print(f"route_publishing:{manifest.revision}")
        return 0
    if route.action == "reconcile":
        reconcile_route(manifest.revision)
        print(f"route_published:{manifest.revision}")
        return 0
    if route.action == "wait":
        wait_for_live(manifest.target_invite_url, manifest.expected_invite_url)
        reconcile_route(manifest.revision)
        print(f"route_published:{manifest.revision}")
        return 0

    # An admin may cancel before claim; require the exact same revision and URLs.
    latest = load_manifest(oidc_token)
    if latest != manifest or datetime.now(timezone.utc) >= manifest.expires_at:
        raise RouteError("Manifesto alterado antes do commit")
    if read_index() != repo_html or \
       single_invite(load_live()) != manifest.expected_invite_url:
        raise RouteError("Git ou Netlify mudou antes do commit")
    updated = replace_invites(repo_html, manifest.expected_invite_url,
                              manifest.target_invite_url)
    temporary = INDEX.with_name("index.html.acbot-tmp")
    temporary.write_bytes(updated.encode("utf-8"))
    os.replace(temporary, INDEX)
    if git("status", "--porcelain=v1") != "M index.html":
        raise RouteError("Arquivos inesperados alterados")
    git("add", "--", "index.html")
    if git("diff", "--cached", "--name-only") != "index.html":
        raise RouteError("Commit alteraria outro arquivo")
    git("diff", "--cached", "--check")
    # The CAS claim prevents a concurrent admin cancellation between checks and push.
    claim_route(manifest.revision)
    try:
        git("config", "--local", "user.name", "github-actions[bot]")
        git("config", "--local", "user.email",
            "41898282+github-actions[bot]@users.noreply.github.com")
        git("commit", "-m", f"route: G{manifest.group_number} ({manifest.revision})")
    except RouteError:
        # No push was attempted; the Edge still verifies both origins before release.
        try:
            release_route(manifest.revision)
        except RouteError:
            print("route_release_uncertain", file=sys.stderr)
        raise
    # If push reports an error, its remote outcome may be uncertain. Keep the
    # publishing claim until the Edge proves that Git still holds the old route.
    git("push", "origin", "HEAD:main")
    wait_for_live(manifest.target_invite_url, manifest.expected_invite_url)
    reconcile_route(manifest.revision)
    print(f"route_published:{manifest.revision}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RouteError as error:
        print(f"route_failed:{error}", file=sys.stderr)
        sys.exit(1)
