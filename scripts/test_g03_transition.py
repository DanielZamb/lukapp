"""Offline G03 checks. Private snapshot records never appear in assertions."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location('g03', Path(__file__).with_name('g03_transition.py'))
g03 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(g03)


class TransitionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.before, cls.after, cls.schema = g03.load_sources(g03.RECEIPTS)
        cls.live_schema = {'active': json.dumps({'tables': list(cls.schema['tables'].values())}), 'pending': None}

    def setUp(self):
        self.directory = Path(tempfile.mkdtemp(prefix='g03-test-', dir=g03.ROOT / 'scratch'))
        self.bundle = self.directory / 'prepared'
        self.sha, self.counts = g03.prepare(g03.RECEIPTS, self.bundle)

    def tearDown(self):
        shutil.rmtree(self.directory)

    def assertRefused(self, action):
        with self.assertRaises(g03.Refusal):
            action()

    def test_real_backup_counts_and_exact_survivors(self):
        self.assertEqual(sum(g03.REMOVALS.values()), 44)
        self.assertEqual(sum(map(len, self.after.values())), 351)
        self.assertEqual(len(self.after['workspaces']), 16)
        self.assertEqual(len(self.after['firstRunCompletions']), 0)
        self.assertEqual(len(self.after['deviceChallenges']), 0)
        for table, rows in self.before.items():
            original = {row['_id']: row for row in rows}
            if table != 'clerkRevocations':
                self.assertTrue(all(row == original[row['_id']] for row in self.after[table]))
        self.assertTrue(g03.rows_equal(self.before['deviceSessionDenials'], self.after['deviceSessionDenials']))
        self.assertTrue(g03.rows_equal(self.before['clerkWebhookDeliveries'], self.after['clerkWebhookDeliveries']))
        receipt = g03.read_json(g03.RECEIPTS / 'deployment-backup.json')
        self.assertEqual(g03.digest(Path(receipt['path']).read_bytes()), g03.BACKUP_SHA)

    def test_reproducible_payloads_system_fields_and_private_modes(self):
        second_sha, _ = g03.prepare(g03.RECEIPTS, self.directory / 'second')
        self.assertEqual(self.sha, second_sha)
        before, after, schema = g03.load_bundle(self.bundle, self.sha)
        self.assertTrue(before == self.before and after == self.after and schema == self.schema)
        self.assertEqual(stat.S_IMODE(self.bundle.stat().st_mode), 0o700)
        for path in self.bundle.rglob('*'):
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o700 if path.is_dir() else 0o600)
        self.assertEqual((self.bundle / 'after/mobileDevices.jsonl').read_bytes(), b'')
        self.assertEqual(len((self.bundle / 'after/clerkRevocations.jsonl').read_text().splitlines()), 2)
        self.assertRefused(lambda: g03.prepare(g03.RECEIPTS, self.bundle))

    def test_default_cli_has_no_provider_contact(self):
        # No CLI/network binary exists on this PATH. Default preparation still succeeds.
        python = os.path.realpath(os.sys.executable)
        result = subprocess.run([python, str(g03.ROOT / 'scripts/g03_transition.py'), '--output', str(self.directory / 'default')],
                                env={**os.environ, 'PATH': ''}, capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)['manifestSha256'], self.sha)

    def test_recursive_and_json_encoded_references(self):
        value = {'request': json.dumps({'result': [{'id': 'removed'}]})}
        self.assertIn('removed', g03.strings(value))
        before = copy.deepcopy(self.before)
        before['clerkWebhookDeliveries'][0]['unexpectedNestedReference'] = {'ids': [before['mobileDevices'][0]['_id']]}
        self.assertRefused(lambda: g03.derive(before, self.after['clerkRevocations']))

    def test_denials_cannot_be_lost_or_reassigned(self):
        for mutation in ['drop', 'session', 'subject']:
            tombstones = copy.deepcopy(self.after['clerkRevocations'])
            if mutation == 'drop':
                tombstones.pop()
            else:
                tombstones[0]['clerkSessionId' if mutation == 'session' else 'clerkUserId'] = 'changed'
            self.assertRefused(lambda: g03.derive(self.before, tombstones))
        before = copy.deepcopy(self.before)
        before['mobileDevices'][0]['state']['kind'] = 'active'
        self.assertRefused(lambda: g03.derive(before, self.after['clerkRevocations']))

    def test_changed_scope_or_extended_values_refused(self):
        before = copy.deepcopy(self.before)
        before['userCategories'][0]['workspaceId'] = 'another'
        self.assertRefused(lambda: g03.derive(before, self.after['clerkRevocations']))
        self.assertRefused(lambda: g03.plain_json({'value': {'$integer': 'AAAA'}}))
        self.assertRefused(lambda: g03.plain_json(float('inf')))

    def test_live_table_content_not_just_counts_is_checked(self):
        for table in ['workspaces', 'journalLines', 'deviceSessionDenials', 'clerkWebhookDeliveries', 'periodControlDecisions']:
            live = copy.deepcopy(self.before)
            live[table][0]['unexpected'] = 'changed'
            self.assertRefused(lambda: g03.check_live(self.before, self.after, self.schema, live, self.live_schema, g03.URL))
        live = {**self.before, 'unexpected': []}
        self.assertRefused(lambda: g03.check_live(self.before, self.after, self.schema, live, self.live_schema, g03.URL))

    def test_schema_url_and_pending_schema_refused(self):
        for schema in [{'active': None}, {**self.live_schema, 'pending': '{}'}, {**self.live_schema, 'inProgress': '{}'}, {'active': {'tables': []}}]:
            self.assertRefused(lambda: g03.check_live(self.before, self.after, self.schema, self.before, schema, g03.URL))
        self.assertRefused(lambda: g03.check_live(self.before, self.after, self.schema, self.before, self.live_schema, 'https://other.convex.cloud'))

    def test_manifest_and_payload_tampering_refused(self):
        self.assertRefused(lambda: g03.load_bundle(self.bundle, '0' * 64))
        with (self.bundle / 'after/workspaces.jsonl').open('ab') as stream:
            stream.write(b'{}\n')
        self.assertRefused(lambda: g03.load_bundle(self.bundle, self.sha))

    def live_target(self):
        live = copy.deepcopy(self.after)
        for i, row in enumerate(live['clerkRevocations']):
            row.update(_id=f'tombstone-{i}', _creationTime=1234 + i)
        return live

    def test_tombstones_remain_when_cleanup_partially_completes(self):
        live = copy.deepcopy(self.before)
        live['mobileDevices'] = []
        self.assertRefused(lambda: g03.check_live(self.before, self.after, self.schema, live, self.live_schema, g03.URL))
        live = self.live_target()
        live['clerkRevocations'].pop()
        self.assertRefused(lambda: g03.check_live(self.before, self.after, self.schema, live, self.live_schema, g03.URL))

    def fake_cli(self, live, seen):
        def call(*args):
            seen.append(args)
            if args[0] == 'function-spec':
                return g03.encode({'url': g03.URL})
            if args[0] == 'run':
                if 'deploymentState:deploymentState' in args[1]:
                    return g03.encode({'state': 'paused'})
                if 'paginatedScheduledJobs:default' in args[1]:
                    return g03.encode({'page': [], 'isDone': True, 'continueCursor': ''})
                return g03.encode(self.live_schema)
            self.assertEqual(args[0], 'export')
            with zipfile.ZipFile(args[2], 'w') as archive:
                for table, rows in live.items():
                    archive.writestr(f'{table}/generated_schema.jsonl', b'"uniform"\n')
                    archive.writestr(f'{table}/documents.jsonl', b''.join(g03.encode(r) for r in rows))
            return b''
        return call

    def command(self, rollback=False):
        return g03.next_command(self.bundle, self.sha, g03.DEPLOYMENT, g03.URL, True, rollback)

    def test_wrong_environment_or_missing_pause_refuses_before_reads(self):
        with patch.object(g03, 'cli', side_effect=AssertionError('Provider contacted')):
            for name, url, paused in [('prod', g03.URL, True), (g03.DEPLOYMENT, 'https://other.convex.cloud', True), (g03.DEPLOYMENT, g03.URL, False)]:
                self.assertRefused(lambda: g03.next_command(self.bundle, self.sha, name, url, paused))

    def test_forward_resume_and_rollback_emit_only_one_supported_command(self):
        for live, rollback, expected in [(self.before, False, 'clerkRevocations'), (self.live_target(), True, 'workspaces')]:
            seen = []
            with patch.object(g03, 'cli', side_effect=self.fake_cli(live, seen)):
                command = self.command(rollback)
            self.assertIn(f'--replace --table {expected} ', command)
            self.assertIn(f'--deployment {g03.DEPLOYMENT}', command)
            self.assertNotIn('--replace-all', command)
            self.assertTrue(all(call[0] in ['function-spec', 'run', 'export'] for call in seen))
        live = copy.deepcopy(self.before)
        live['clerkRevocations'] = self.live_target()['clerkRevocations']
        with patch.object(g03, 'cli', side_effect=self.fake_cli(live, [])):
            self.assertIn('--table accountingPeriods ', self.command())
        with patch.object(g03, 'cli', side_effect=self.fake_cli(self.live_target(), [])):
            self.assertIn('Prepared target reached', self.command())
        with patch.object(g03, 'cli', side_effect=self.fake_cli(self.before, [])):
            self.assertIn('no tombstones have been imported', self.command(True))
        with patch.object(g03, 'cli', side_effect=self.fake_cli(live, [])):
            self.assertIn('both tombstones remain', self.command(True))

    def test_scheduled_work_refuses_command(self):
        fake = self.fake_cli(self.before, [])
        def scheduled(*args):
            return g03.encode({'page': [{}], 'isDone': False}) if any('paginatedScheduledJobs' in str(a) for a in args) else fake(*args)
        with patch.object(g03, 'cli', side_effect=scheduled):
            self.assertRefused(self.command)

    def test_pause_loss_or_background_arrival_during_export_refuses_command(self):
        for arrival in ['unpause', 'job']:
            fake = self.fake_cli(self.before, [])
            exported = False
            def during_export(*args):
                nonlocal exported
                if args[0] == 'export':
                    exported = True
                if exported and arrival == 'unpause' and 'deploymentState:deploymentState' in str(args):
                    return g03.encode({'state': 'running'})
                if exported and arrival == 'job' and 'paginatedScheduledJobs:default' in str(args):
                    return g03.encode({'page': [{}], 'isDone': False})
                return fake(*args)
            with patch.object(g03, 'cli', side_effect=during_export):
                self.assertRefused(self.command)

    def test_changed_state_guard_emits_no_command(self):
        live = copy.deepcopy(self.before)
        live['deviceSessionDenials'][0]['at'] += 1
        with patch.object(g03, 'cli', side_effect=self.fake_cli(live, [])):
            self.assertRefused(self.command)
        with patch.object(g03, 'cli', return_value=g03.encode({'url': 'https://wrong.convex.cloud'})) as cli:
            self.assertRefused(self.command)
            self.assertEqual(cli.call_count, 1)


if __name__ == '__main__':
    (g03.ROOT / 'scratch').mkdir(exist_ok=True)
    unittest.main()
