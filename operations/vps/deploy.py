#!/usr/bin/env python3
"""Dedicated publisher. Install a reviewed copy outside the Git checkout."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import tarfile
import tempfile
import time
import urllib.request

ROOT = Path('/srv/sorefrigeracao-site')
REPOSITORY = 'https://github.com/carlosmaximianoneto-debug/soregrigeracao.git'
PROJECT = 'sorefrigeracao-site-prod'
CONTAINER = 'sorefrigeracao-site-web'
BUILDER = 'sorefrigeracao-site-builder'
BUILDER_CONTAINER = 'buildx_buildkit_' + BUILDER + '0'
POLICY = Path('/etc/sorefrigeracao-site/deploy-policy.json')
HEALTH = 'http://127.0.0.1:3190/healthz'
STATE_KEYS = {'version', 'current', 'previous', 'failed', 'pending'}


class DeployError(RuntimeError):
    pass


def normalize_sha(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{40}', value):
        raise ValueError('Expected a lowercase full commit SHA')
    return value


def release_path(root, sha):
    path = root / 'releases' / normalize_sha(sha)
    if path.resolve() != path.absolute():
        raise ValueError('Release paths may not traverse symlinks')
    return path


def empty_state():
    return dict(version=1, current=None, previous=None, failed=None, pending=None)


def validate_state(state):
    if not isinstance(state, dict) or set(state) != STATE_KEYS or state['version'] != 1:
        raise ValueError('Invalid publisher state')
    for key in STATE_KEYS - {'version'}:
        if state[key] is not None:
            normalize_sha(state[key])
    return state


def load_state(path):
    if path.is_symlink():
        raise ValueError('State file cannot be a symlink')
    return validate_state(json.loads(path.read_text())) if path.exists() else empty_state()


def save_state(path, state):
    validate_state(state)
    if path.is_symlink():
        raise ValueError('State file cannot be a symlink')
    fd, temporary = tempfile.mkstemp(prefix='.state-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(state, stream, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        if os.name != 'nt':
            fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try: os.fsync(fd)
            finally: os.close(fd)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_builder_limits(config):
    expected = dict(Memory=768 * 1024 * 1024, MemorySwap=768 * 1024 * 1024,
                    CpuPeriod=100000, CpuQuota=50000)
    if (not isinstance(config, dict) or any(config.get(k) != v for k, v in expected.items())
            or config.get('RestartPolicy', {}).get('Name') != 'unless-stopped'):
        raise ValueError('Dedicated build container limits do not match the approved budget')


def validate_builder_driver(output):
    # Buildx inspect does not support --format on the deployed CLI. Parse only
    # its top-level Driver field, never a substring in diagnostics/node details.
    drivers = re.findall(r'^Driver:[ \t]*([^\r\n]*)', output, flags=re.MULTILINE)
    if len(drivers) != 1 or drivers[0].strip() != 'docker-container':
        raise ValueError('Dedicated builder must use the docker-container driver')


def validate_policy(policy):
    if not isinstance(policy, dict) or set(policy) != {'Dockerfile', 'compose.yaml'}:
        raise ValueError('Policy must pin exactly Dockerfile and compose.yaml')
    for digest in policy.values():
        if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError('Invalid policy digest')
    return policy


def verify_policy(release, policy):
    for name, digest in validate_policy(policy).items():
        file = release / name
        if file.is_symlink() or not file.is_file() or sha256(file) != digest:
            raise ValueError('Deployment definition changed; manual review required')


def extract_archive(archive, destination):
    """Never use extractall on a root-owned release; accept regular files only."""
    members = archive.getmembers()
    if len(members) > 15000 or sum(m.size for m in members) > 256 * 1024 * 1024:
        raise ValueError('Repository export exceeds the release budget')
    seen = set()
    for member in members:
        name = member.name.rstrip('/')
        path = PurePosixPath(name)
        if (not name or '\\' in name or ':' in name or path.is_absolute()
                or '..' in path.parts or '.' in path.parts
                or '.runtime.env' in path.parts or '.git' in path.parts
                or name in seen or not (member.isdir() or member.isfile())):
            raise ValueError('Unsafe archive entry')
        seen.add(name)
    destination.mkdir(mode=0o755, parents=True, exist_ok=True)
    for member in members:
        target = destination.joinpath(*PurePosixPath(member.name).parts)
        if target.resolve() != target.absolute():
            raise ValueError('Archive destination traverses a symlink')
        if member.isdir():
            target.mkdir(mode=0o755, parents=True, exist_ok=True)
            continue
        target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        with archive.extractfile(member) as source, target.open('xb') as output:
            shutil.copyfileobj(source, output)
        target.chmod(0o644)


class Publisher:
    def __init__(self, operations, state_path):
        self.ops, self.path = operations, state_path

    def recover(self, state):
        candidate = state['pending']
        if not candidate:
            return state
        try:
            if state['current']:
                self.ops.activate(state['current'])
                if not self.ops.healthy(state['current']):
                    raise DeployError('rollback_health_failed')
                self.ops.mark_current(state['current'])
            else:
                self.ops.stop_candidate(candidate)
        except Exception:
            # Keep the journal pending: the next run must recover before deploying.
            raise DeployError('rollback_failed_pending_retained') from None
        state.update(failed=candidate, pending=None)
        save_state(self.path, state)
        return state

    def sync(self, candidate, retry=False):
        normalize_sha(candidate)
        state = self.recover(load_state(self.path))
        if candidate == state['current']:
            return 'unchanged'
        if candidate == state['failed'] and not retry:
            return 'failed_sha_held'
        if state['current'] and not self.ops.healthy(state['current']):
            raise DeployError('existing_release_unhealthy_no_activation')
        try:
            self.ops.prepare(candidate)
        except Exception:
            state['failed'] = candidate
            save_state(self.path, state)
            raise DeployError('prepare_failed_running_release_preserved') from None
        # Journal first, so SIGKILL/reboot between activation and commit is recoverable.
        state['pending'] = candidate
        save_state(self.path, state)
        try:
            self.ops.activate(candidate)
            if not self.ops.healthy(candidate):
                raise DeployError('candidate_health_failed')
            self.ops.mark_current(candidate)
        except Exception:
            self.recover(state)
            raise DeployError('activation_failed_rolled_back') from None
        state.update(previous=state['current'], current=candidate, pending=None, failed=None)
        save_state(self.path, state)
        return 'published'

    def rollback(self):
        state = self.recover(load_state(self.path))
        if not state['current'] or not state['previous']:
            raise DeployError('no_previous_release')
        old, target = state['current'], state['previous']
        # The journal identifies the currently running candidate as rejected.
        state.update(current=target, previous=None, pending=old)
        save_state(self.path, state)
        self.recover(state)
        return 'rolled_back'


def root_owned(path, secret=False):
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Deployment paths must be root-owned and not writable by others')
    if secret and (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600):
        raise ValueError('Runtime env must be a regular root-owned 0600 file')


class HostOperations:
    def __init__(self):
        self.root = ROOT
        self.repo = ROOT / 'repository.git'
        self.runtime = ROOT / 'shared/runtime.env'
        for path in [ROOT, ROOT / 'shared', POLICY.parent, POLICY]: root_owned(path)
        root_owned(self.runtime, secret=True)
        self.policy = validate_policy(json.loads(POLICY.read_text()))
        self.env = {key: value for key, value in os.environ.items()
                    if key in ['PATH', 'LANG', 'LC_ALL', 'TZ']}
        self.env.update(HOME=str(ROOT / 'shared'), GIT_TERMINAL_PROMPT='0',
                        DOCKER_CONFIG=str(ROOT / 'shared/docker-config'))

    def run(self, args, timeout=180, env=None):
        try:
            result = subprocess.run(args, env=env or self.env, capture_output=True,
                                    text=True, timeout=timeout, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise DeployError('external_command_unavailable_or_timed_out') from None
        if result.returncode:
            # Do not forward build, Compose or environment-containing diagnostics.
            raise DeployError('external_command_failed')
        return result.stdout.strip()

    def git(self, *args):
        return self.run(['git', '-c', 'core.hooksPath=/dev/null', '-c', 'protocol.file.allow=never',
                         '-c', 'protocol.ext.allow=never', '--git-dir=' + str(self.repo), *args])

    def fetch_main(self):
        if not self.repo.exists():
            self.run(['git', 'init', '--bare', str(self.repo)])
            self.git('remote', 'add', 'origin', REPOSITORY)
        root_owned(self.repo)
        if self.repo.resolve() != self.repo or self.git('remote', 'get-url', 'origin') != REPOSITORY:
            raise DeployError('repository_origin_mismatch')
        self.git('fetch', '--depth=1', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main')
        candidate = normalize_sha(self.git('rev-parse', '--verify', 'refs/remotes/origin/main^{commit}'))
        if self.git('cat-file', '-t', candidate) != 'commit':
            raise DeployError('not_a_commit')
        return candidate

    def prepare(self, sha):
        release = release_path(ROOT, sha)
        self.verify_builder()
        if shutil.disk_usage(ROOT).free < 2 * 1024 ** 3:
            raise DeployError('less_than_2gib_free')
        (ROOT / 'releases').mkdir(mode=0o755, exist_ok=True)
        root_owned(ROOT / 'releases')
        if not release.exists():
            staging = Path(tempfile.mkdtemp(prefix='.export-', dir=ROOT / 'releases'))
            archive_path = staging / 'source.tar'
            source = staging / 'source'
            try:
                self.git('archive', '--format=tar', '--output=' + str(archive_path), sha)
                if archive_path.stat().st_size > 270 * 1024 ** 2:
                    raise ValueError('Repository archive too large')
                with tarfile.open(archive_path, 'r:') as archive:
                    extract_archive(archive, source)
                verify_policy(source, self.policy)
                source.rename(release)
            finally:
                # Only the newly created, checked staging directory may be removed.
                if staging.parent == ROOT / 'releases' and not staging.is_symlink():
                    shutil.rmtree(staging)
        root_owned(release)
        verify_policy(release, self.policy)
        runtime_link = release / '.runtime.env'
        if runtime_link.is_symlink():
            if runtime_link.resolve() != self.runtime:
                raise DeployError('runtime_symlink_mismatch')
            runtime_link.unlink()
        elif runtime_link.exists():
            raise DeployError('runtime_env_must_be_external')
        # No runtime env is present in the build context, even if dockerignore regresses.
        self.run(['docker', 'buildx', 'build', '--builder', BUILDER, '--load',
                  '--file', str(release / 'Dockerfile'), '--tag',
                  'sorefrigeracao-site:' + sha, str(release)], timeout=600)
        runtime_link.symlink_to(self.runtime)

    def verify_builder(self):
        output = self.run(['docker', 'buildx', 'inspect', BUILDER])
        validate_builder_driver(output)
        config = self.run(['docker', 'inspect', '--format', '{{json .HostConfig}}', BUILDER_CONTAINER])
        validate_builder_limits(json.loads(config))

    def compose(self, sha, *args):
        release = release_path(ROOT, sha)
        root_owned(release)
        verify_policy(release, self.policy)
        link = release / '.runtime.env'
        if not link.is_symlink() or link.resolve() != self.runtime:
            raise DeployError('missing_external_runtime_env')
        env = {**self.env, 'REFRI_SITE_IMAGE': 'sorefrigeracao-site:' + sha, 'REFRI_SITE_REVISION': sha}
        return self.run(['docker', 'compose', '--project-name', PROJECT, '--project-directory',
                         str(release), '--file', str(release / 'compose.yaml'), *args], env=env)

    def activate(self, sha):
        self.compose(sha, 'up', '-d', '--no-build', '--pull', 'never', '--no-deps', 'web')

    def stop_candidate(self, sha):
        self.compose(sha, 'stop', 'web')

    def healthy(self, sha):
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs): return None
        client = urllib.request.build_opener(NoRedirect)
        for attempt in range(20):
            try:
                image = self.run(['docker', 'inspect', '--format', '{{.Config.Image}}', CONTAINER])
                if image != 'sorefrigeracao-site:' + sha:
                    raise ValueError('wrong image')
                with client.open(HEALTH, timeout=3) as response:
                    data = json.loads(response.read(4097))
                    if response.status == 200 and data.get('ok') is True and data.get('revision') == sha:
                        return True
            except Exception:
                pass
            if attempt < 19: time.sleep(2)
        return False

    def mark_current(self, sha):
        target = release_path(ROOT, sha)
        temporary = ROOT / '.current-next'
        if temporary.exists() or temporary.is_symlink(): temporary.unlink()
        temporary.symlink_to(target, target_is_directory=True)
        os.replace(temporary, ROOT / 'current')


@contextlib.contextmanager
def deployment_lock():
    import fcntl
    path = ROOT / 'shared/deploy.lock'
    fd = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
            return
        yield True
    finally: os.close(fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check-only', action='store_true', help='fetch/verify definitions; do not build or activate')
    parser.add_argument('--retry-failed', action='store_true', help='manually retry the held failed main SHA')
    mode.add_argument('--rollback', action='store_true', help='restore only the last known healthy release')
    mode.add_argument('--print-policy', action='store_true', help='print reviewed checkout definition hashes without mutation')
    args = parser.parse_args()
    if args.retry_failed and (args.check_only or args.rollback or args.print_policy):
        parser.error('--retry-failed applies only to a normal publication')
    if args.print_policy:
        checkout = Path(__file__).resolve().parents[2]
        print(json.dumps({name: sha256(checkout / name) for name in ['Dockerfile', 'compose.yaml']}, indent=2))
        return
    if os.name != 'posix' or os.geteuid() != 0:
        parser.error('Run the installed publisher as root on Linux')
    try:
        ops = HostOperations()
        with deployment_lock() as acquired:
            if not acquired:
                print(json.dumps({'status': 'already_running'}))
                return
            publisher = Publisher(ops, ROOT / 'shared/deploy-state.json')
            if args.rollback:
                status = publisher.rollback()
            else:
                # Check-only never activates/reverts a container, including crash recovery.
                state = load_state(publisher.path)
                if args.check_only and state['pending']:
                    raise DeployError('pending_recovery_requires_normal_run')
                if not args.check_only:
                    # Recover before fetch, even if GitHub is unavailable.
                    publisher.recover(state)
                candidate = ops.fetch_main()
                if args.check_only:
                    ops.verify_builder()
                    for name, digest in ops.policy.items():
                        # Preserve exact bytes, including the final newline, for the pinned digest.
                        blob = subprocess.run(['git', '--git-dir=' + str(ops.repo), 'show', candidate + ':' + name],
                                              env=ops.env, capture_output=True, check=True, timeout=30).stdout
                        if hashlib.sha256(blob).hexdigest() != digest:
                            raise ValueError('Deployment definition changed; manual review required')
                    status = 'checked'
                else:
                    status = publisher.sync(candidate, retry=args.retry_failed)
            print(json.dumps({'status': status, 'state': load_state(publisher.path)}))
    except (DeployError, ValueError, OSError, subprocess.SubprocessError) as error:
        print(json.dumps({'status': 'error', 'reason': str(error) if isinstance(error, DeployError) else type(error).__name__}))
        raise SystemExit(1)


if __name__ == '__main__':
    main()
