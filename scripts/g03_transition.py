#!/usr/bin/env python3
"""Prepare G03 payloads offline; optionally read live state and print one command."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import selectors
import shlex
import signal
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DEPLOYMENT = 'compassionate-opossum-63'
URL = f'https://{DEPLOYMENT}.convex.cloud'
BACKUP_SHA = '7df1ece3a5969bd03422cf03ffb18e0cb9a3c6c6d9c96ce7c2056d2a335ccdeb'
SCHEMA_SHA = '67a9859544a1200c035e92c47631623c2c682a5482e8008ab5cc6e6055b691be'
TOMBSTONES_SHA = 'a8496f056c677b707ea2db1a6c39beb4ea55fad2c28eb185652b10d815bc5b69'
RECEIPTS = Path('/Users/zambamon/Work/finance-tracker-v2/.orchestrator/runs/2026-10-17-frontend')
REMOVALS = {
    'personalWorkspaceOwners': 1, 'openingPositions': 1, 'mobileDevices': 1,
    'workspaceMemberships': 1, 'workspaces': 1, 'userCategories': 11,
    'deviceChallenges': 7, 'accountingPeriods': 1, 'categoryReceipts': 11,
    'firstRunCompletions': 1, 'financialAccountProfiles': 1, 'ledgerAccounts': 4,
    'journalEntries': 1, 'journalLines': 2,
}
ORDER = ['clerkRevocations', *sorted(REMOVALS)]


class Refusal(Exception):
    pass


def require(condition, message):
    if not condition:
        raise Refusal(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode()


def read_json(path):
    return json.loads(Path(path).read_bytes())


def rows_equal(left, right):
    return sorted(encode(row) for row in left) == sorted(encode(row) for row in right)


def strings(value):
    if isinstance(value, dict):
        return set().union(set(), *(strings(v) for v in value.values()))
    if isinstance(value, list):
        return set().union(set(), *(strings(v) for v in value))
    if isinstance(value, str):
        # Old receipts also store JSON inside request strings.
        if value[:1] in ('{', '['):
            try:
                return {value} | strings(json.loads(value))
            except ValueError:
                pass
        return {value}
    return set()


def plain_json(value):
    if isinstance(value, dict):
        require(not any(k.startswith('$') for k in value), 'Extended Convex value needs ZIP typing; refuse JSONL conversion')
        for v in value.values():
            plain_json(v)
    elif isinstance(value, list):
        for v in value:
            plain_json(v)
    elif isinstance(value, float):
        require(math.isfinite(value), 'Nonfinite number cannot be imported as plain JSONL')


def read_export(path):
    tables = {}
    ids = set()
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)), 'Duplicate ZIP member')
        for name in names:
            if not name.endswith('/documents.jsonl'):
                continue
            table = name.split('/')[0]
            require(name == f'{table}/documents.jsonl', 'Unexpected ZIP layout')
            if table == '_tables':
                continue
            require(table.isascii() and table.isalnum() and not table.startswith('_'), 'Unexpected table name')
            typing = f'{table}/generated_schema.jsonl'
            require(typing in names and archive.read(typing).strip() == b'"uniform"',
                    'Export contains missing or nonuniform type metadata; refuse JSONL conversion')
            rows = [json.loads(line) for line in archive.read(name).splitlines() if line.strip()]
            for row in rows:
                require(isinstance(row, dict) and isinstance(row.get('_id'), str)
                        and isinstance(row.get('_creationTime'), (int, float)), 'Missing export system fields')
                require(row['_id'] not in ids, 'Duplicate document ID')
                ids.add(row['_id'])
                plain_json(row)
            tables[table] = rows
    return tables


def derive(before, tombstones):
    require(sum(map(len, before.values())) == 393, 'Unexpected snapshot row count')
    require(len(before['workspaces']) == 17 and len(before['deviceSessionDenials']) == 2
            and before['clerkRevocations'] == [], 'Unexpected workspace or denial scope')
    workspaces = {r['workspaceId'] for r in before['userCategories']}
    require(len(workspaces) == 1 and len(before['userCategories']) == 11, 'Unexpected incompatible workspace scope')
    workspace = next(iter(workspaces))
    require(workspace in {r['_id'] for r in before['workspaces']}, 'Missing workspace seed')
    require(len(before['mobileDevices']) == 1, 'Unexpected device scope')
    device = before['mobileDevices'][0]
    require(device['state']['kind'] == 'revoked', 'Device is not revoked')
    denials = before['deviceSessionDenials']
    require(any(d['sid'] == device['sid'] and d['tokenIdentifier'] == device['tokenIdentifier'] for d in denials), 'Revoked device lacks denial')
    require(len(tombstones) == 2 and len({r['clerkSessionId'] for r in tombstones}) == 2, 'Unexpected tombstone scope')
    require({r['clerkSessionId'] for r in tombstones} == {r['sid'] for r in denials}, 'Denial session coverage changed')
    for denial in denials:
        matching = [t for t in tombstones if t['clerkSessionId'] == denial['sid']]
        require(len(matching) == 1 and denial['tokenIdentifier'].endswith('|' + matching[0]['clerkUserId']), 'Denial subject coverage changed')
    for row in tombstones:
        require(set(row) == {'clerkUserId', 'clerkSessionId', 'requestedAt', 'attempts', 'completedAt'}
                and row['attempts'] == 0 and row['completedAt'] >= row['requestedAt'], 'Unexpected prepared tombstone shape')
    removed = {workspace, device['_id']}
    while True:
        references = {row['_id'] for rows in before.values() for row in rows
                      if strings({k: v for k, v in row.items() if k != '_id'}) & removed}
        if references <= removed:
            break
        removed |= references
    counts = {table: sum(row['_id'] in removed for row in rows) for table, rows in before.items()}
    require({k: v for k, v in counts.items() if v} == REMOVALS, 'Reference closure exceeds reviewed scope')
    after = {table: [row for row in rows if row['_id'] not in removed] for table, rows in before.items()}
    after['clerkRevocations'] = tombstones
    require(len(after['workspaces']) == 16 and rows_equal(after['deviceSessionDenials'], denials), 'Preservation invariant failed')
    require(all(not (strings(row) & removed) for rows in after.values() for row in rows), 'Surviving reference to removed row')
    return after


def load_sources(receipts):
    backup = read_json(receipts / 'deployment-backup.json')
    require(backup['deploymentUrl'] == URL and backup['sha256'] == BACKUP_SHA and backup['bytes'] == 41399, 'Backup receipt changed')
    path = Path(backup['path'])
    require(digest(path.read_bytes()) == BACKUP_SHA, 'Immutable backup hash mismatch')
    schema_bytes = (receipts / 'deployed-schema-before.json').read_bytes()
    require(digest(schema_bytes) == SCHEMA_SHA, 'Pinned schema receipt changed')
    schema = json.loads(schema_bytes)
    require(schema['deploymentUrl'] == URL, 'Wrong schema deployment')
    tombstone_bytes = (path.parent / 'clerkRevocations-prepared.json').read_bytes()
    require(digest(tombstone_bytes) == TOMBSTONES_SHA, 'Private prepared tombstones changed')
    before = read_export(path)
    after = derive(before, json.loads(tombstone_bytes))
    return before, after, schema


def private_path(path):
    path = path.resolve()
    require(path.is_relative_to(ROOT / 'scratch'), 'Private output must stay under this worktree scratch/')
    require(not path.exists(), 'Output already exists; use a new private directory')
    return path


def write_private(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with path.open('xb') as stream:
        os.chmod(path, 0o600)
        stream.write(data)


def prepare(receipts, output):
    before, after, schema = load_sources(receipts)
    output = private_path(output)
    output.mkdir(mode=0o700, parents=True)
    manifest = {'version': 1, 'deployment': DEPLOYMENT, 'url': URL, 'backupSha256': BACKUP_SHA,
                'schemaReceiptSha256': SCHEMA_SHA, 'tombstonesSha256': TOMBSTONES_SHA, 'files': {},
                'counts': {t: {'before': len(before[t]), 'after': len(after[t])} for t in ORDER}}
    for direction, state in [('before', before), ('after', after)]:
        for table in sorted(state):
            name = f'{direction}/{table}.jsonl'
            data = b''.join(encode(row) for row in state[table])
            manifest['files'][name] = digest(data)
            write_private(output / name, data)
    write_private(output / 'schema.json', encode(schema))
    manifest['files']['schema.json'] = digest(encode(schema))
    data = encode(manifest)
    write_private(output / 'manifest.json', data)
    return digest(data), manifest['counts']


def load_bundle(bundle, reviewed_sha):
    data = (bundle / 'manifest.json').read_bytes()
    require(digest(data) == reviewed_sha, 'Manifest differs from reviewed SHA-256')
    manifest = json.loads(data)
    require(manifest['version'] == 1 and manifest['deployment'] == DEPLOYMENT and manifest['url'] == URL
            and manifest['backupSha256'] == BACKUP_SHA and manifest['schemaReceiptSha256'] == SCHEMA_SHA
            and manifest['tombstonesSha256'] == TOMBSTONES_SHA, 'Unexpected manifest binding')
    for name, expected in manifest['files'].items():
        path = (bundle / name).resolve()
        require(path.is_relative_to(bundle.resolve()) and digest(path.read_bytes()) == expected, 'Payload changed')
    states = []
    for direction in ['before', 'after']:
        states.append({Path(name).stem: [json.loads(line) for line in (bundle / name).read_bytes().splitlines()]
                       for name in manifest['files'] if name.startswith(direction + '/')})
    before, after = states
    require(set(before) == set(after), 'Payload table set changed')
    require(after == derive(before, after['clerkRevocations']), 'Payload is not the reviewed closure')
    return before, after, read_json(bundle / 'schema.json')


def declared_schema(live_schema):
    require(set(live_schema) <= {'active', 'pending', 'inProgress'}, 'Unknown schema response fields')
    require(live_schema.get('pending') is None and live_schema.get('inProgress') is None, 'Pending schema transition')
    active = json.loads(live_schema['active']) if isinstance(live_schema.get('active'), str) else live_schema.get('active')
    require(isinstance(active, dict) and set(active) == {'tables', 'schemaValidation'}
            and isinstance(active['tables'], list) and active['schemaValidation'] is True, 'Missing or disabled active schema')
    fields = {'tableName', 'documentType', 'indexes', 'searchIndexes', 'vectorIndexes'}
    staged = {'stagedDocumentType': None, 'stagedDbIndexes': [],
              'stagedSearchIndexes': [], 'stagedVectorIndexes': []}
    tables = {}
    for table in active['tables']:
        require(isinstance(table, dict) and set(table) == fields | set(staged), 'Unknown schema table fields')
        require(all(table[k] == v for k, v in staged.items()), 'Staged schema transition')
        name = table['tableName']
        require(isinstance(name, str) and name not in tables, 'Invalid or duplicate schema table')
        # MCP tables validates these five fields and strips the empty staged metadata.
        tables[name] = {k: table[k] for k in fields}
    return tables


def check_live(before, after, schema, live, live_schema, url):
    require(url == URL, 'Resolved deployment URL differs from named development deployment')
    require(declared_schema(live_schema) == schema['tables'], 'Active schema changed; stop for parent review')
    require(not (set(live) - set(before)), 'Unexpected live table')
    statuses = {}
    for table in before:
        rows = live.get(table, [])
        if rows_equal(rows, before[table]):
            statuses[table] = 'before'
        else:
            comparable = [{k: v for k, v in r.items() if k not in ('_id', '_creationTime')} for r in rows] if table == 'clerkRevocations' else rows
            require(rows_equal(comparable, after[table]), f'Changed live state in {table}; no command emitted')
            statuses[table] = 'after'
    # A partially completed forward or rollback run must retain both tombstones.
    require(not any(statuses[t] == 'after' for t in REMOVALS) or statuses['clerkRevocations'] == 'after', 'Cleanup without preserved tombstones')
    return statuses


def cli(*args):
    result = subprocess.run(['pnpm', 'exec', 'convex', *args, '--deployment', DEPLOYMENT], cwd=ROOT,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180, check=False)
    # Never echo provider logs, records, credentials, or error bodies.
    require(result.returncode == 0, 'Convex read failed; inspect privately and stop')
    return result.stdout


def first_subscription_result(command, timeout=45):
    """Read one administrative CLI subscription result without exposing logs."""
    process = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, start_new_session=True)
    try:
        with selectors.DefaultSelector() as streams:
            streams.register(process.stdout, selectors.EVENT_READ)
            streams.register(process.stderr, selectors.EVENT_READ)
            output = b''
            deadline = time.monotonic() + timeout
            while True:
                remaining = deadline - time.monotonic()
                require(remaining > 0, 'Convex administrative query timed out; stop')
                events = streams.select(remaining)
                for key, _ in events:
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        require(key.fileobj is not process.stdout,
                                'Convex administrative query ended without a result; stop')
                        streams.unregister(key.fileobj)
                    elif key.fileobj is process.stdout:
                        output += chunk
                        require(len(output) <= 4 * 1024 * 1024, 'Administrative response exceeds limit')
                        try:
                            result, _ = json.JSONDecoder().raw_decode(output.decode().lstrip())
                        except ValueError:
                            continue
                        require(isinstance(result, dict), 'Unexpected administrative response shape')
                        return result
                    # Drain and discard stderr, including any provider error bodies.
    finally:
        if process.poll() is None:
            try:
                os.killpg(process.pid, signal.SIGINT)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
        process.stdout.close()
        process.stderr.close()


def admin_query(kind):
    queries = {
        'state': ('_system/frontend/deploymentState:deploymentState', {}),
        'scheduler': ('_system/frontend/paginatedScheduledJobs:default',
                      {'paginationOpts': {'numItems': 1, 'cursor': None}}),
        'schema': ('_system/frontend/getSchemas:default', {}),
    }
    name, args = queries[kind]
    # In Convex 1.46.0 --watch uses the same admin WebSocket query path as
    # MCP tables/runSystemQuery. Ordinary run uses the application HTTP path.
    return first_subscription_result(['pnpm', 'exec', 'convex', 'run', name, json.dumps(args),
                                      '--watch', '--codegen', 'disable', '--deployment', DEPLOYMENT])


def paused_and_idle():
    state = admin_query('state')
    require(state == {'state': 'paused'}, 'Deployment must remain paused in Convex dashboard')
    jobs = admin_query('scheduler')
    require(jobs.get('page') == [] and jobs.get('isDone') is True, 'Scheduled work exists; stop for parent review')


def next_command(bundle, reviewed_sha, deployment, url, quiesced, rollback=False):
    require(deployment == DEPLOYMENT and url == URL, 'Only the exact named development binding is allowed')
    require(quiesced, 'Parent must pause all writers for the entire transition')
    before, after, schema = load_bundle(bundle, reviewed_sha)
    spec = json.loads(cli('function-spec'))
    require(spec.get('url') == URL, 'CLI resolved a different deployment URL')
    paused_and_idle()
    live_schema = admin_query('schema')
    with tempfile.TemporaryDirectory(prefix='live-', dir=bundle) as temporary:
        os.chmod(temporary, 0o700)
        path = Path(temporary) / 'snapshot.zip'
        cli('export', '--path', str(path))
        os.chmod(path, 0o600)
        live = read_export(path)
    statuses = check_live(before, after, schema, live, live_schema, spec['url'])
    paused_and_idle()
    latest_schema = admin_query('schema')
    require(latest_schema == live_schema, 'Schema changed during live inspection')
    order = list(reversed(ORDER[1:])) if rollback else ORDER
    wanted = 'after' if rollback else 'before'
    table = next((t for t in order if statuses[t] == wanted), None)
    if table is None:
        if rollback and statuses['clerkRevocations'] == 'before':
            return 'No cleanup to roll back; no tombstones have been imported.'
        return 'Rollback data restored; both tombstones remain.' if rollback else 'Prepared target reached; parent may proceed to the separate integration gate.'
    direction = 'before' if rollback else 'after'
    # Print one supported single-table command. This tool never imports or deploys.
    return shlex.join(['pnpm', 'exec', 'convex', 'import', '--deployment', DEPLOYMENT,
                       '--replace', '--table', table, str((bundle / direction / f'{table}.jsonl').resolve())])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', nargs='?', choices=['prepare', 'next'], default='prepare')
    parser.add_argument('--receipts', type=Path, default=RECEIPTS)
    parser.add_argument('--output', type=Path, default=ROOT / 'scratch/g03')
    parser.add_argument('--review-sha')
    parser.add_argument('--deployment')
    parser.add_argument('--url')
    parser.add_argument('--writers-paused', action='store_true')
    parser.add_argument('--rollback', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    try:
        if args.mode == 'prepare':
            require(not args.rollback and not args.review_sha and not args.deployment and not args.url, 'Preparation takes no execution binding')
            sha, counts = prepare(args.receipts, args.output)
            print(json.dumps({'manifestSha256': sha, 'counts': counts}, indent=2))
        else:
            require(args.review_sha is not None, 'Reviewed manifest SHA-256 is required')
            print(next_command(args.output, args.review_sha, args.deployment, args.url, args.writers_paused, args.rollback))
    except Refusal as error:
        print(f'REFUSED: {error}. No import was executed.', file=sys.stderr)
        return 1
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile, subprocess.TimeoutExpired):
        # Low-level exceptions can contain private row values or provider bodies.
        print('REFUSED: inputs, binding, payload, schema, or live state failed validation. No import was executed.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
