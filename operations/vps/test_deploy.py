import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest


FILE = Path(__file__).with_name('deploy.py')
A = 'a' * 40
B = 'b' * 40
C = 'c' * 40


class FakeOps:
    def __init__(self, fail=None):
        self.events = []
        self.fail = fail
    def prepare(self, sha):
        self.events.append(('prepare', sha))
        if self.fail == 'prepare': raise RuntimeError('private build output')
    def activate(self, sha): self.events.append(('activate', sha))
    def healthy(self, sha):
        self.events.append(('healthy', sha))
        return sha != self.fail
    def mark_current(self, sha): self.events.append(('current', sha))
    def stop_candidate(self, sha): self.events.append(('stop', sha))


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(FILE.is_file(), 'The safe VPS publisher is not implemented yet')
        spec = importlib.util.spec_from_file_location('deploy', FILE)
        self.d = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.d)
        # The Windows app sandbox virtualizes the global TEMP directory; use the workspace.
        self.tmp = tempfile.TemporaryDirectory(prefix='.test-deploy-', dir=FILE.parent)
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.state = self.root / 'state.json'

    def seed(self, **extra):
        state = {'version': 1, 'current': A, 'previous': None, 'failed': None, 'pending': None}
        state.update(extra)
        self.d.save_state(self.state, state)

    def test_sha_and_paths_reject_revision_syntax_and_escape(self):
        self.assertEqual(self.d.release_path(self.root, A), self.root / 'releases' / A)
        for bad in ['main', '../' + A, A.upper(), A + ';id', A + '\n', '', None]:
            with self.subTest(bad=bad), self.assertRaises(ValueError): self.d.release_path(self.root, bad)

    def test_same_sha_does_not_build_or_recreate_container(self):
        self.seed()
        ops = FakeOps()
        self.assertEqual(self.d.Publisher(ops, self.state).sync(A), 'unchanged')
        self.assertEqual(ops.events, [])

    def test_new_release_is_recorded_only_after_health(self):
        self.seed()
        ops = FakeOps()
        self.assertEqual(self.d.Publisher(ops, self.state).sync(B), 'published')
        self.assertEqual(ops.events, [('healthy', A), ('prepare', B), ('activate', B), ('healthy', B), ('current', B)])
        state = self.d.load_state(self.state)
        self.assertEqual((state['current'], state['previous'], state['pending']), (B, A, None))

    def test_bad_health_restores_previous_before_recording_failure(self):
        self.seed()
        ops = FakeOps(fail=B)
        with self.assertRaises(self.d.DeployError): self.d.Publisher(ops, self.state).sync(B)
        self.assertEqual(ops.events[-3:], [('activate', A), ('healthy', A), ('current', A)])
        state = self.d.load_state(self.state)
        self.assertEqual((state['current'], state['failed'], state['pending']), (A, B, None))
        ops.events.clear()
        self.assertEqual(self.d.Publisher(ops, self.state).sync(B), 'failed_sha_held')
        self.assertEqual(ops.events, [])

    def test_failed_first_release_stops_only_candidate(self):
        ops = FakeOps(fail=B)
        with self.assertRaises(self.d.DeployError): self.d.Publisher(ops, self.state).sync(B)
        self.assertEqual(ops.events[-1], ('stop', B))
        self.assertIsNone(self.d.load_state(self.state)['current'])

    def test_build_failure_never_changes_running_container(self):
        self.seed()
        ops = FakeOps(fail='prepare')
        with self.assertRaises(self.d.DeployError): self.d.Publisher(ops, self.state).sync(B)
        self.assertNotIn(('activate', B), ops.events)
        self.assertEqual(self.d.load_state(self.state)['current'], A)

    def test_interrupted_activation_rolls_back_and_holds_failed_sha(self):
        self.seed(pending=B)
        ops = FakeOps()
        self.assertEqual(self.d.Publisher(ops, self.state).sync(B), 'failed_sha_held')
        self.assertEqual(ops.events, [('activate', A), ('healthy', A), ('current', A)])
        self.assertEqual(self.d.load_state(self.state)['failed'], B)

    def test_rollback_failure_keeps_pending_for_recovery(self):
        self.seed(pending=B)
        with self.assertRaises(self.d.DeployError): self.d.Publisher(FakeOps(fail=A), self.state).sync(C)
        self.assertEqual(self.d.load_state(self.state)['pending'], B)

    def test_manual_rollback_prevents_timer_immediately_republishing_bad_main(self):
        self.seed(current=B, previous=A)
        ops = FakeOps()
        self.assertEqual(self.d.Publisher(ops, self.state).rollback(), 'rolled_back')
        state = self.d.load_state(self.state)
        self.assertEqual((state['current'], state['failed']), (A, B))
        self.assertEqual(self.d.Publisher(ops, self.state).sync(B), 'failed_sha_held')

    def test_malformed_state_fails_closed_instead_of_becoming_first_deploy(self):
        for value in ['{', json.dumps({'version': 1, 'current': '../root'})]:
            self.state.write_text(value)
            with self.assertRaises((ValueError, json.JSONDecodeError)): self.d.load_state(self.state)

    def archive(self, name, kind=tarfile.REGTYPE, linkname=''):
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode='w') as archive:
            member = tarfile.TarInfo(name)
            member.type = kind
            member.linkname = linkname
            member.size = 1 if kind == tarfile.REGTYPE else 0
            archive.addfile(member, io.BytesIO(b'x') if member.size else None)
        buf.seek(0)
        return tarfile.open(fileobj=buf, mode='r:')

    def test_archive_rejects_traversal_symlinks_devices_and_runtime_env(self):
        cases = [('../outside', tarfile.REGTYPE), ('/etc/passwd', tarfile.REGTYPE),
                 ('a\\b', tarfile.REGTYPE), ('link', tarfile.SYMTYPE),
                 ('dev', tarfile.CHRTYPE), ('.runtime.env', tarfile.REGTYPE)]
        for name, kind in cases:
            with self.subTest(name=name), self.archive(name, kind, '/etc') as archive:
                with self.assertRaises(ValueError): self.d.extract_archive(archive, self.root / 'export')

    def test_regular_archive_exports_without_executable_repo_hooks(self):
        with self.archive('src/app.js') as archive:
            self.d.extract_archive(archive, self.root / 'export')
        self.assertEqual((self.root / 'export/src/app.js').read_bytes(), b'x')

    def test_policy_hashes_fail_when_compose_changes(self):
        release = self.root / 'release'
        release.mkdir()
        for name in ['Dockerfile', 'compose.yaml']: (release / name).write_text('approved')
        policy = {name: self.d.sha256(release / name) for name in ['Dockerfile', 'compose.yaml']}
        self.d.verify_policy(release, policy)
        (release / 'compose.yaml').write_text('privileged: true')
        with self.assertRaises(ValueError): self.d.verify_policy(release, policy)

    def test_builder_rejects_unbounded_memory_cpu_and_swap(self):
        limits = dict(Memory=768*1024*1024, MemorySwap=768*1024*1024,
                      CpuPeriod=100000, CpuQuota=50000, RestartPolicy={'Name':'unless-stopped'})
        self.d.validate_builder_limits(limits)
        for key, value in [('Memory',0), ('MemorySwap',-1), ('CpuQuota',-1),
                           ('CpuQuota',200000), ('CpuPeriod',50000),
                           ('RestartPolicy',{'Name':'always'})]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                self.d.validate_builder_limits({**limits,key:value})

    def test_builder_driver_uses_supported_text_output_and_rejects_ambiguity(self):
        self.assertTrue(callable(getattr(self.d, 'validate_builder_driver', None)),
                        'Buildx text driver verification is not implemented')
        output = 'Name:          sorefrigeracao-site-builder\nDriver:        docker-container\n\nNodes:\nName: builder0\n'
        self.d.validate_builder_driver(output)
        for invalid in ['Name: builder\nDriver: docker\n', 'Driver: remote\n',
                        'Nodes:\n', 'Driver: docker-container\nDriver: docker\n',
                        'Error: Driver: docker-container\n', 'Driver: docker-container extra\n']:
            with self.subTest(output=invalid), self.assertRaises(ValueError):
                self.d.validate_builder_driver(invalid)


if __name__ == '__main__':
    unittest.main()
