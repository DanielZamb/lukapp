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


class RowComparisonTests(unittest.TestCase):
    def test_exact_numeric_equivalence_in_nested_rows(self):
        left = [{'nested': [0, {'value': 2 ** 60}], 'fraction': 0.125}, {'value': 7}]
        right = [{'value': 7.0}, {'fraction': 0.125, 'nested': [0.0, {'value': float(2 ** 60)}]}]
        self.assertTrue(g03.rows_equal(left, right))
        self.assertTrue(g03.rows_equal(right, left))
        self.assertEqual(g03.encode({'value': 7.0}), b'{"value":7.0}\n')

    def test_negative_zero_stays_distinct_from_integer_and_positive_zero(self):
        self.assertTrue(g03.rows_equal([{'value': -0.0}], [{'value': -0.0}]))
        for value in [0, 0.0]:
            self.assertFalse(g03.rows_equal([{'nested': [-0.0]}], [{'nested': [value]}]))
            self.assertFalse(g03.rows_equal([{'nested': [value]}], [{'nested': [-0.0]}]))

    def test_numeric_drift_is_exact_without_rounding_or_tolerance(self):
        for left, right in [(1, 1.0000000000000002), (0.125, 0.12500000000000003),
                            (2 ** 53 + 1, float(2 ** 53 + 1)), (2 ** 60, 2 ** 60 + 1)]:
            with self.subTest(left=left, right=right):
                self.assertFalse(g03.rows_equal([{'value': left}], [{'value': right}]))
                self.assertFalse(g03.rows_equal([{'value': right}], [{'value': left}]))

    def test_other_json_types_and_encoded_strings_stay_distinct(self):
        for left, right in [(True, 1), (False, 0.0), ('1', 1.0), (None, 0),
                            ('{"value":1}', '{"value":1.0}'), ([1], {'value': 1})]:
            with self.subTest(left=left, right=right):
                self.assertFalse(g03.rows_equal([{'nested': [left]}], [{'nested': [right]}]))
                self.assertFalse(g03.rows_equal([{'nested': [right]}], [{'nested': [left]}]))

    def test_row_duplicates_array_order_and_object_fields_are_preserved(self):
        self.assertTrue(g03.rows_equal([{'value': 1}, {'value': 1}],
                                       [{'value': 1.0}, {'value': 1.0}]))
        for left, right in [
            ([{'value': 1}, {'value': 1}, {'value': 2}],
             [{'value': 1.0}, {'value': 2.0}, {'value': 2.0}]),
            ([{'value': [1, 2]}], [{'value': [2.0, 1.0]}]),
            ([{}], [{'value': None}]),
            ([{'value': 1}], [{'value': 1.0, 'extra': True}]),
        ]:
            self.assertFalse(g03.rows_equal(left, right))

    def test_nonfinite_numbers_still_refuse(self):
        for value in [float('nan'), float('inf'), float('-inf')]:
            with self.assertRaises(ValueError):
                g03.rows_equal([{'value': value}], [{'value': value}])


class AdministrativeReadTests(unittest.TestCase):
    def read(self, source, timeout=2):
        children = []
        popen = subprocess.Popen
        def start(*args, **kwargs):
            child = popen(*args, **kwargs)
            children.append(child)
            return child
        try:
            with patch.object(g03.subprocess, 'Popen', side_effect=start):
                return g03.first_subscription_result(
                    [os.sys.executable, '-u', '-c', source], timeout=timeout)
        finally:
            self.assertEqual(len(children), 1)
            self.assertIsNotNone(children[0].poll())
            self.assertTrue(children[0].stdout.closed and children[0].stderr.closed)

    def test_first_complete_result_and_no_provider_logs(self):
        result = self.read('''
import os, time
os.write(2, b'private provider error body' * 10000)
os.write(1, b'{"state":')
time.sleep(0.02)
os.write(1, b'"paused"}\\n{"state":"running"}\\n')
time.sleep(10)
''')
        self.assertEqual(result, {'state': 'paused'})

    def test_errors_malformed_results_and_timeouts_refuse(self):
        for source in [
            'import sys; print("private provider error", file=sys.stderr); sys.exit(1)',
            'print("{malformed private response")',
            'print("[]")',
            'import time; time.sleep(10)',
        ]:
            with self.subTest(source=source), self.assertRaises(g03.Refusal) as raised:
                self.read(source, timeout=0.25)
            self.assertNotIn('private', str(raised.exception))

    def test_all_system_reads_use_named_administrative_subscription(self):
        for kind, name, args in [
            ('state', '_system/frontend/deploymentState:deploymentState', {}),
            ('schema', '_system/frontend/getSchemas:default', {}),
            ('scheduler', '_system/frontend/paginatedScheduledJobs:default',
             {'paginationOpts': {'numItems': 1, 'cursor': None}}),
        ]:
            with patch.object(g03, 'first_subscription_result', return_value={'observed': kind}) as read:
                self.assertEqual(g03.admin_query(kind), {'observed': kind})
            self.assertEqual(read.call_args.args[0], [
                'pnpm', 'exec', 'convex', 'run', name, json.dumps(args),
                '--watch', '--codegen', 'disable', '--deployment', 'compassionate-opossum-63'])


class TransitionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (g03.ROOT / 'scratch').mkdir(mode=0o700, exist_ok=True)
        cls.before, cls.after, cls.schema = g03.load_sources(g03.RECEIPTS)
        tables = [{**table, 'stagedDocumentType': None, 'stagedDbIndexes': [],
                   'stagedSearchIndexes': [], 'stagedVectorIndexes': []}
                  for table in cls.schema['tables'].values()]
        cls.live_schema = {'active': json.dumps({'tables': tables, 'schemaValidation': True})}

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
        self.assertEqual(self.sha, 'a29f6d01d1c3c7067aa25b76a16ffaaf5f16601fa36ee9fcd009a198b2794f60')
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

    def test_live_schema_metadata_matches_receipt_without_hiding_drift(self):
        self.assertEqual(g03.declared_schema(self.live_schema), self.schema['tables'])
        original = json.loads(self.live_schema['active'])
        changes = [
            lambda s: s.update(schemaValidation=False),
            lambda s: s.update(unknown=True),
            lambda s: s['tables'].append(s['tables'][0]),
            lambda s: s['tables'][0].update(unknown=True),
            lambda s: s['tables'][0].pop('stagedDocumentType'),
        ]
        for key in ['stagedDocumentType', 'stagedDbIndexes', 'stagedSearchIndexes', 'stagedVectorIndexes']:
            changes.append(lambda s, k=key: s['tables'][0].update({k: {'type': 'any'} if k == 'stagedDocumentType' else [{}]}))
        for change in changes:
            active = copy.deepcopy(original)
            change(active)
            self.assertRefused(lambda: g03.declared_schema({'active': json.dumps(active)}))
        for field in ['documentType', 'indexes', 'searchIndexes', 'vectorIndexes']:
            active = copy.deepcopy(original)
            active['tables'][0][field] = {'type': 'any'} if field == 'documentType' else [{}]
            self.assertRefused(lambda: g03.check_live(self.before, self.after, self.schema,
                                                    self.before, {'active': json.dumps(active)}, g03.URL))

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
            self.assertEqual(args[0], 'export')
            with zipfile.ZipFile(args[2], 'w') as archive:
                for table, rows in live.items():
                    archive.writestr(f'{table}/generated_schema.jsonl', b'"uniform"\n')
                    archive.writestr(f'{table}/documents.jsonl', b''.join(g03.encode(r) for r in rows))
            return b''
        return call

    def fake_admin(self, kind):
        return {
            'state': {'state': 'paused'},
            'scheduler': {'page': [], 'isDone': True, 'continueCursor': '',
                          'pageStatus': None, 'splitCursor': None},
            'schema': self.live_schema,
        }[kind]

    def command(self, rollback=False):
        return g03.next_command(self.bundle, self.sha, g03.DEPLOYMENT, g03.URL, True, rollback)

    def test_wrong_environment_or_missing_pause_refuses_before_reads(self):
        with patch.object(g03, 'cli', side_effect=AssertionError('Provider contacted')), \
                patch.object(g03, 'admin_query', side_effect=AssertionError('Provider contacted')):
            for name, url, paused in [('prod', g03.URL, True), (g03.DEPLOYMENT, 'https://other.convex.cloud', True), (g03.DEPLOYMENT, g03.URL, False)]:
                self.assertRefused(lambda: g03.next_command(self.bundle, self.sha, name, url, paused))

    def test_forward_resume_and_rollback_emit_only_one_supported_command(self):
        for live, rollback, expected in [(self.before, False, 'clerkRevocations'), (self.live_target(), True, 'workspaces')]:
            seen = []
            with patch.object(g03, 'cli', side_effect=self.fake_cli(live, seen)), \
                    patch.object(g03, 'admin_query', side_effect=self.fake_admin):
                command = self.command(rollback)
            self.assertIn(f'--replace --table {expected} ', command)
            self.assertIn(f'--deployment {g03.DEPLOYMENT}', command)
            self.assertNotIn('--replace-all', command)
            self.assertTrue(all(call[0] in ['function-spec', 'export'] for call in seen))
        live = copy.deepcopy(self.before)
        live['clerkRevocations'] = self.live_target()['clerkRevocations']
        with patch.object(g03, 'cli', side_effect=self.fake_cli(live, [])), \
                patch.object(g03, 'admin_query', side_effect=self.fake_admin):
            self.assertIn('--table accountingPeriods ', self.command())
        with patch.object(g03, 'cli', side_effect=self.fake_cli(self.live_target(), [])), \
                patch.object(g03, 'admin_query', side_effect=self.fake_admin):
            self.assertIn('Prepared target reached', self.command())
        with patch.object(g03, 'cli', side_effect=self.fake_cli(self.before, [])), \
                patch.object(g03, 'admin_query', side_effect=self.fake_admin):
            self.assertIn('no tombstones have been imported', self.command(True))
        with patch.object(g03, 'cli', side_effect=self.fake_cli(live, [])), \
                patch.object(g03, 'admin_query', side_effect=self.fake_admin):
            self.assertIn('both tombstones remain', self.command(True))

    def test_scheduled_work_refuses_command(self):
        def scheduled(kind):
            return {'page': [{}], 'isDone': False} if kind == 'scheduler' else self.fake_admin(kind)
        with patch.object(g03, 'cli', side_effect=self.fake_cli(self.before, [])), \
                patch.object(g03, 'admin_query', side_effect=scheduled):
            self.assertRefused(self.command)

    def test_imported_numeric_tombstones_resume_but_changed_data_refuses(self):
        live = copy.deepcopy(self.before)
        live['clerkRevocations'] = self.live_target()['clerkRevocations']
        for row in live['clerkRevocations']:
            for field in ['attempts', 'requestedAt', 'completedAt']:
                row[field] = float(row[field])
        with patch.object(g03, 'cli', side_effect=self.fake_cli(live, [])), \
                patch.object(g03, 'admin_query', side_effect=self.fake_admin):
            self.assertIn('--table accountingPeriods ', self.command())
            self.assertIn('both tombstones remain', self.command(True))
        for field, value in [('attempts', 1.0), ('attempts', False),
                             ('requestedAt', live['clerkRevocations'][0]['requestedAt'] + 1),
                             ('completedAt', 'changed')]:
            changed = copy.deepcopy(live)
            changed['clerkRevocations'][0][field] = value
            with patch.object(g03, 'cli', side_effect=self.fake_cli(changed, [])), \
                    patch.object(g03, 'admin_query', side_effect=self.fake_admin):
                self.assertRefused(self.command)

    def test_running_unknown_or_failed_admin_reads_refuse_before_export(self):
        for response in [{'state': 'running'}, {}, {'state': 'paused', 'unexpected': True},
                         g03.Refusal('Administrative read failed')]:
            seen = []
            with patch.object(g03, 'cli', side_effect=self.fake_cli(self.before, seen)), \
                    patch.object(g03, 'admin_query', side_effect=response if isinstance(response, Exception)
                                 else lambda kind: response):
                self.assertRefused(self.command)
            self.assertEqual(seen, [('function-spec',)])

    def test_pause_loss_or_background_arrival_during_export_refuses_command(self):
        for arrival in ['unpause', 'job', 'schema']:
            fake = self.fake_cli(self.before, [])
            exported = False
            def during_export(*args):
                nonlocal exported
                if args[0] == 'export':
                    exported = True
                return fake(*args)
            def administrative(kind):
                if exported:
                    if arrival == 'unpause' and kind == 'state':
                        return {'state': 'running'}
                    if arrival == 'job' and kind == 'scheduler':
                        return {'page': [{}], 'isDone': False}
                    if arrival == 'schema' and kind == 'schema':
                        return {'active': json.dumps({'tables': []})}
                return self.fake_admin(kind)
            with patch.object(g03, 'cli', side_effect=during_export), \
                    patch.object(g03, 'admin_query', side_effect=administrative):
                self.assertRefused(self.command)

    def test_changed_state_guard_emits_no_command(self):
        live = copy.deepcopy(self.before)
        live['deviceSessionDenials'][0]['at'] += 1
        with patch.object(g03, 'cli', side_effect=self.fake_cli(live, [])), \
                patch.object(g03, 'admin_query', side_effect=self.fake_admin):
            self.assertRefused(self.command)
        with patch.object(g03, 'cli', return_value=g03.encode({'url': 'https://wrong.convex.cloud'})) as cli:
            self.assertRefused(self.command)
            self.assertEqual(cli.call_count, 1)


if __name__ == '__main__':
    unittest.main()
