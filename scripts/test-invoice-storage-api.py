#!/usr/bin/env python3
"""Acceptance gate against real, disposable local Supabase services, never hosted.

Requires Linux CI with Docker, Node 24, Supabase CLI 2.119.0 and requirements in
 tests/storage/requirements.txt. No application .env, hosted project, credential
 store, migration directory or database URL is read. See tests/storage/README.md.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import threading
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import tomllib
from urllib.error import HTTPError
from urllib.parse import quote, unquote, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'tests/storage'
OUT = ROOT / 'test-results/invoice-storage-api'
CLI_VERSION = '2.119.0'
STORAGE_VERSION = 'v1.79.28'
DRIVER_VERSION = '3.2.10'
BUCKET = 'invoices-private'
MAX_BYTES = 6291456
HTTP_TIMEOUT = 15
RESULT = {'gate': 'real-local-supabase-storage', 'passed': False, 'checks': [], 'cleanup_passed': False}
SECRET_VALUES: list[str] = []


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def redact(value):
    text = str(value)
    for secret in sorted(SECRET_VALUES, key=len, reverse=True):
        if secret:
            text = text.replace(secret, '[redacted]')
    text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted-jwt]', text)
    text = re.sub(r'(?i)(postgres(?:ql)?://[^:/\s]+:)[^@\s]+@', r'\1[redacted]@', text)
    return text[:4000]


def run(command, *, env=None, cwd=None, timeout=30, input=None):
    try:
        completed = subprocess.run(command, env=env, cwd=cwd, input=input, text=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise RuntimeError(f'{Path(command[0]).name} exceeded its {timeout}s deadline') from None
    if completed.returncode:
        raise RuntimeError(f'{Path(command[0]).name} failed ({completed.returncode}): {redact(completed.stderr)}')
    return completed.stdout


def origin_from_status(value):
    parsed = urlsplit(value)
    require(parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost')
            and parsed.port and parsed.path in ('', '/') and not parsed.query
            and not parsed.fragment and not parsed.username and not parsed.password,
            'Only an explicit IPv4 loopback HTTP API origin is accepted')
    return f'http://127.0.0.1:{parsed.port}'


def database_from_status(value):
    parsed = urlsplit(value)
    require(parsed.scheme in ('postgresql', 'postgres') and parsed.hostname in ('127.0.0.1', 'localhost')
            and parsed.port and parsed.path == '/postgres' and parsed.username == 'postgres'
            and parsed.password and not parsed.query and not parsed.fragment,
            'Only an explicit loopback postgres maintenance connection is accepted')
    password = unquote(parsed.password)
    SECRET_VALUES.append(password)
    return dict(host='127.0.0.1', hostaddr='127.0.0.1', port=parsed.port, dbname='postgres',
                user='postgres', password=password, connect_timeout=5, sslmode='disable',
                options='-c statement_timeout=15000 -c lock_timeout=8000 -c idle_in_transaction_session_timeout=15000 -c timezone=UTC',
                application_name='bamco-real-storage-acceptance')


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise RuntimeError('Redirect refused by isolated Storage acceptance harness')


def multipart_parts(data, mime='application/pdf', metadata=None):
    boundary = 'bamco-fixture-' + uuid4().hex
    prefix = f'--{boundary}\r\nContent-Disposition: form-data; name="cacheControl"\r\n\r\n0\r\n'
    if metadata is not None:
        prefix += f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{json.dumps(metadata)}\r\n'
    # Exactly the browser client's empty-name file field, after metadata.
    prefix += f'--{boundary}\r\nContent-Disposition: form-data; name=""; filename="fixture.pdf"\r\nContent-Type: {mime}\r\n\r\n'
    return prefix.encode(), data, f'\r\n--{boundary}--\r\n'.encode(), f'multipart/form-data; boundary={boundary}'


class API:
    def __init__(self, origin, anon, service):
        self.origin = origin_from_status(origin)
        self.anon = anon
        self.service = service
        self.opener = build_opener(ProxyHandler({}), NoRedirects())

    def request(self, method, path, *, token=None, body=None, headers=None, label='HTTP request'):
        require(path.startswith('/') and not path.startswith('//') and not any(c in path for c in ('\r', '\n', '#')),
                'Unsafe request path')
        request_headers = {'apikey': self.anon, 'Authorization': 'Bearer ' + (token or self.anon), 'Cache-Control': 'no-store'}
        request_headers.update(headers or {})
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
            request_headers['Content-Type'] = 'application/json'
        try:
            with self.opener.open(Request(self.origin + path, data=body, method=method, headers=request_headers), timeout=HTTP_TIMEOUT) as response:
                return response.status, response.read(), dict(response.headers)
        except HTTPError as error:
            return error.code, error.read(), dict(error.headers)
        except (OSError, TimeoutError) as error:
            raise RuntimeError(f'{label}: transport failed ({type(error).__name__})') from None

    @staticmethod
    def decoded(response):
        try:
            return json.loads(response[1])
        except (ValueError, TypeError):
            return None

    def ok(self, response, label):
        require(200 <= response[0] < 300, f'{label}: HTTP {response[0]} {redact(self.decoded(response))}')
        return self.decoded(response)

    def denied(self, response, label):
        require(response[0] in (400, 401, 403, 404, 409, 413, 415, 422),
                f'{label}: expected a deliberate 4xx denial, received HTTP {response[0]} {redact(self.decoded(response))}')
        return response

    def rpc(self, name, body, token, *, deny=False):
        response = self.request('POST', '/rest/v1/rpc/' + name, token=token, body=body, label=name)
        return self.denied(response, name) if deny else self.ok(response, name)

    def upload(self, row, data, token, *, mime='application/pdf', metadata='matching', upsert=False, deny=False, path=None):
        md = {'sha256': row['sha256']} if metadata == 'matching' else metadata
        parts = multipart_parts(data, mime, md)
        response = self.request('POST', object_path(path or row['storage_path']), token=token,
                                body=b''.join(parts[:3]), headers={'Content-Type': parts[3], 'x-upsert': str(upsert).lower()}, label='upload')
        return self.denied(response, 'upload denial') if deny else self.ok(response, 'upload')

    def download(self, row, token=None, *, deny=False, public=False):
        path = object_path(row['storage_path'], public=public)
        response = self.request('GET', path, token=token, label='download')
        if deny:
            return self.denied(response, 'private download denial')
        self.ok(response, 'private download')
        return response[1]


def object_path(path, *, public=False):
    return '/storage/v1/object/' + ('public/' if public else '') + BUCKET + '/' + '/'.join(quote(p, safe='') for p in path.split('/'))


def mark(name, **details):
    RESULT['checks'].append({'name': name, 'passed': True, **details})
    print('PASS ' + name, flush=True)


def make_user(api, db, name, *, view_only=False):
    email = f'{name}-{uuid4().hex}@example.invalid'
    password = secrets.token_urlsafe(30)
    SECRET_VALUES.append(password)
    created = api.ok(api.request('POST', '/auth/v1/admin/users', token=api.service,
                                body={'email': email, 'password': password, 'email_confirm': True}), 'create fixture user')
    uid = created['id']
    session = api.ok(api.request('POST', '/auth/v1/token?grant_type=password', body={'email': email, 'password': password}), 'fixture sign-in')
    token = session['access_token']
    SECRET_VALUES.extend([token, session.get('refresh_token', '')])
    require(session['user']['id'] == uid, 'Auth returned a different fixture user')
    permissions = {'view': True, 'create': not view_only, 'edit': not view_only, 'delete': not view_only}
    db.execute('INSERT INTO public.profiles(id) VALUES(%s)', (uid,))
    db.execute('INSERT INTO private.fixture_actor_permissions(id,permissions) VALUES(%s,%s::jsonb)', (uid, json.dumps(permissions)))
    return uid, token


def new_invoice(api, token, name):
    return api.rpc('save_invoice', {'p_request_id': str(uuid4()), 'p_invoice_id': None,
                                  'p_payload': {'invoice_number': name + '-' + uuid4().hex, 'title': 'Synthetic Storage acceptance',
                                                'account_party': 'Fixture only', 'company_name': 'Fixture only', 'currency': 'IRR',
                                                'total_amount': '100.00', 'due_date': None, 'description': None}}, token)


def new_payment(api, token, invoice):
    return api.rpc('save_invoice_payment', {'p_request_id': str(uuid4()), 'p_payment_id': None,
                                          'p_payload': {'invoice_id': invoice['id'], 'sequence_no': 1, 'amount': '100.00',
                                                        'planned_date': None, 'paid_date': '2026-10-03', 'status': 'paid',
                                                        'tracking_no': 'fixture', 'notes': None}}, token)


def reservation_args(invoice, data, *, kind='proforma', payment=None, request_id=None, mime='application/pdf', sha256=None, size=None):
    return {'p_request_id': request_id or str(uuid4()), 'p_invoice_id': invoice['id'],
            'p_payment_id': payment['id'] if payment else None, 'p_file_type': kind,
            'p_file_name': 'fixture.pdf', 'p_content_type': mime,
            'p_size_bytes': len(data) if size is None else size, 'p_sha256': sha256 or hashlib.sha256(data).hexdigest()}


def reserve(api, token, invoice, data, **kwargs):
    args = reservation_args(invoice, data, **kwargs)
    row = api.rpc('reserve_invoice_file', args, token)
    require(row['upload_state'] == 'pending', 'New reservation must be pending')
    return row, args


def finalize(api, token, row):
    ready = api.rpc('finalize_invoice_file', {'p_file_id': row['id']}, token)
    require(ready['upload_state'] == 'ready' and ready['id'] == row['id'], 'Finalization returned wrong state/identity')
    return ready


def object_row(db, row):
    return db.execute('SELECT metadata,user_metadata,owner_id FROM storage.objects WHERE bucket_id=%s AND name=%s',
                      (BUCKET, row['storage_path'])).fetchone()


def edge_parts(row, data, mime='application/pdf', filename='fixture.pdf'):
    boundary = 'bamco-edge-' + uuid4().hex
    prefix = f'--{boundary}\r\nContent-Disposition: form-data; name="file_id"\r\n\r\n{row["id"]}\r\n'
    prefix += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'
    return prefix.encode(), data, f'\r\n--{boundary}--\r\n'.encode(), f'multipart/form-data; boundary={boundary}'


def edge_upload(api, row, data, token, *, mime='application/pdf', filename='fixture.pdf', deny=False):
    parts = edge_parts(row, data, mime, filename)
    response = api.request('POST', '/functions/v1/invoice-file-upload', token=token, body=b''.join(parts[:3]),
                           headers={'Content-Type': parts[3]}, label='invoice upload Edge')
    if deny:
        return api.denied(response, 'invoice upload Edge denial')
    result = api.ok(response, 'invoice upload Edge')
    ready = result.get('file', {})
    require(ready.get('upload_state') == 'ready' and ready.get('id') == row['id'], 'Edge did not return the same ready attachment')
    return ready


def interrupt_edge_upload(api, row, data, token):
    parts = edge_parts(row, data)
    host = urlsplit(api.origin)
    connection = http.client.HTTPConnection('127.0.0.1', host.port, timeout=HTTP_TIMEOUT)
    try:
        connection.putrequest('POST', '/functions/v1/invoice-file-upload')
        for name, value in {'apikey': api.anon, 'Authorization': 'Bearer ' + token, 'Content-Type': parts[3],
                            'Content-Length': str(sum(len(p) for p in parts[:3]))}.items():
            connection.putheader(name, value)
        connection.endheaders()
        connection.send(parts[0] + data[:min(4096, len(data) - 1)])
        # Deliberately close with an incomplete body and no terminating boundary.
        # The Edge buffers and validates the whole file before any Storage write.
    finally:
        connection.close()


def execute_cases(api, db):
    owner, token = make_user(api, db, 'owner')
    outsider, other_token = make_user(api, db, 'outsider')
    viewer, view_token = make_user(api, db, 'viewer', view_only=True)
    first = new_invoice(api, token, 'A')
    second = new_invoice(api, other_token, 'B')
    db.execute('UPDATE public.invoices SET follow_up_owner_id=%s WHERE id=%s', (viewer, first['id']))
    payment = new_payment(api, token, first)
    other_payment = new_payment(api, other_token, second)
    data = b'%PDF-1.7\n% Synthetic invoice attachment, no personal data.\n%%EOF\n'
    mark('real Auth users, access JWTs and PostgREST invoice/payment RPCs')

    row, args = reserve(api, token, first, data)
    api.rpc('finalize_invoice_file', {'p_file_id': row['id']}, token, deny=True)
    require(object_row(db, row) is None, 'Reservation created unexpected Storage object')
    for caller in (token, view_token, other_token, api.anon):
        for upsert in (False, True):
            api.upload(row, data, caller, upsert=upsert, deny=True)
    for caller in (view_token, other_token, api.anon):
        edge_upload(api, row, data, caller, deny=True)
    api.rpc('get_invoice_file_upload', {'p_file_id': row['id']}, view_token, deny=True)
    api.rpc('finalize_invoice_file', {'p_file_id': row['id']}, view_token, deny=True)
    api.rpc('reserve_invoice_file', reservation_args(second, data), token, deny=True)
    api.rpc('reserve_invoice_file', reservation_args(first, data, kind='receipt', payment=other_payment), token, deny=True)
    for bad_path in [row['storage_path'].replace(first['id'] + '/', second['id'] + '/', 1),
                     row['storage_path'].replace('/invoice/', '/' + payment['id'] + '/', 1),
                     row['storage_path'].replace(args['p_request_id'], str(uuid4()))]:
        api.upload(row, data, token, path=bad_path, upsert=True, deny=True)
    require(object_row(db, row) is None, 'Unauthorized upload created an object')
    mark('direct client INSERT/UPSERT denied, including malicious pending-path upsert')
    mark('wrong invoice, payment, request path and uploader rejected')

    ready = edge_upload(api, row, data, token)
    observed = object_row(db, row)
    require(observed and int(observed[0]['size']) == len(data) and observed[0]['mimetype'] == 'application/pdf'
            and observed[1]['sha256'] == row['sha256'],
            'Real Storage automatic metadata/user_metadata does not match reservation')
    mark('real local Edge upload, multipart Storage transport and automatic metadata', metadata_keys=sorted(observed[0]),
         user_metadata_keys=sorted(observed[1]))
    require(api.download(ready, token) == data and api.download(ready, view_token) == data, 'Private download bytes changed')
    api.download(ready, other_token, deny=True)
    api.download(ready, deny=True)
    api.download(ready, public=True, deny=True)
    require(finalize(api, token, row)['id'] == row['id'], 'Finalize retry duplicated identity')
    mark('finalize, exact private download and anonymous/public/outsider denial')

    for upsert in (False, True):
        api.upload(ready, data.replace(b'Synthetic', b'AlteredXX'), token, upsert=upsert, deny=True)
        require(api.download(ready, token) == data, 'Ready object was overwritten')
    edge_upload(api, ready, data.replace(b'Synthetic', b'AlteredXX'), token, deny=True)
    edge_upload(api, ready, data, token)
    # Storage remove can report [] with HTTP 200 when RLS denies every row.
    deleted = api.request('DELETE', '/storage/v1/object/' + BUCKET, token=token, body={'prefixes': [row['storage_path']]})
    require(deleted[0] in (200, 400, 401, 403), 'Unexpected direct-delete response')
    require(api.download(ready, token) == data, 'Client removed or changed a ready object')
    mark('ready object rejects overwrite/deletion and exact Edge retry is idempotent')

    receipt, _ = reserve(api, token, first, data, kind='receipt', payment=payment)
    edge_upload(api, receipt, data, token)
    linked = db.execute('SELECT receipt_path FROM public.invoice_payments WHERE id=%s', (payment['id'],)).fetchone()[0]
    require(linked == receipt['storage_path'], 'Receipt was not linked to the correct payment')
    final, _ = reserve(api, token, first, data, kind='final')
    require(edge_upload(api, final, data, token)['final_is_current'] is True, 'Settled final attachment is not current')
    mark('payment receipt and settled final invoice use real Storage objects')

    for label, uploaded, mime, name in [
        ('wrong size', data + b'extra', 'application/pdf', 'fixture.pdf'),
        ('wrong declared MIME', data, 'image/png', 'fixture.pdf'),
        ('wrong actual byte hash', data.replace(b'Synthetic', b'AlteredXX'), 'application/pdf', 'fixture.pdf'),
        ('wrong original filename', data, 'application/pdf', 'other.pdf'),
    ]:
        bad, _ = reserve(api, token, first, data)
        edge_upload(api, bad, uploaded, token, mime=mime, filename=name, deny=True)
        require(object_row(db, bad) is None, label + ' reached Storage despite Edge validation')
        api.rpc('finalize_invoice_file', {'p_file_id': bad['id']}, token, deny=True)
        mark(label + ' rejected before Storage write')

    # Privileged local fault injection tests finalization independently of the
    # Edge. These are real Storage API writes, never fabricated storage.objects.
    for label, uploaded, mime, metadata in [
        ('size metadata', data + b'extra', 'application/pdf', 'matching'),
        ('MIME metadata', data, 'image/png', 'matching'),
        ('hash metadata', data, 'application/pdf', {'sha256': '0' * 64}),
        ('missing hash metadata', data, 'application/pdf', None),
    ]:
        bad, _ = reserve(api, token, first, data)
        api.upload(bad, uploaded, api.service, mime=mime, metadata=metadata)
        api.rpc('finalize_invoice_file', {'p_file_id': bad['id']}, token, deny=True)
        state = db.execute('SELECT upload_state FROM public.invoice_files WHERE id=%s', (bad['id'],)).fetchone()[0]
        require(state == 'pending', label + ' incorrectly became ready')
        mark('finalizer independently rejects wrong ' + label)
    capped, _ = reserve(api, token, first, data, size=MAX_BYTES)
    edge_upload(api, capped, b'x' * (MAX_BYTES + 1), token, deny=True)
    api.upload(capped, b'x' * (MAX_BYTES + 1), api.service, deny=True)
    api.rpc('reserve_invoice_file', reservation_args(first, data, size=MAX_BYTES + 1), token, deny=True)
    mark('6 MiB Edge, bucket and reservation limits reject oversized data')

    # Model interruption between the server Storage commit and caller finalize
    # using the exact same privileged non-upsert HTTP operation as the Edge.
    retry, retry_args = reserve(api, token, first, data)
    api.upload(retry, data, api.service)
    api.download(retry, view_token, deny=True)
    discovered = api.rpc('reserve_invoice_file', retry_args, token)
    require(discovered['id'] == retry['id'] and discovered.get('uploaded_object_matches') is True,
            'Resume must discover matching committed object without overwrite')
    edge_upload(api, discovered, data, token)
    require(api.download(discovered, token) == data, 'Committed-object recovery changed bytes')
    mark('pending committed object is private and resumes through Edge byte verification')
    corrupted, _ = reserve(api, token, first, data)
    api.upload(corrupted, data.replace(b'Synthetic', b'AlteredXX'), api.service)
    edge_upload(api, corrupted, data, token, deny=True)
    require(api.download(corrupted, api.service) != data, 'Conflict incorrectly overwrote the existing object')
    require(db.execute('SELECT upload_state FROM public.invoice_files WHERE id=%s', (corrupted['id'],)).fetchone()[0] == 'pending',
            'Edge trusted forged hash metadata without checking bytes')
    mark('existing bytes are rehashed instead of trusting client hash metadata')

    interrupted_data = data + b'\n' * (64 * 1024)
    interrupted, interrupted_args = reserve(api, token, first, interrupted_data)
    interrupt_edge_upload(api, interrupted, interrupted_data, token)
    same = api.rpc('reserve_invoice_file', interrupted_args, token)
    require(same['id'] == interrupted['id'], 'Interrupted upload lost reservation identity')
    edge_upload(api, same, interrupted_data, token)
    require(api.download(same, token) == interrupted_data, 'Interrupted-body retry bytes differ')
    mark('incomplete HTTP request body retries through Edge without duplicate attachment')

    concurrent_data = data + b'C' * (64 * 1024)
    concurrent, _ = reserve(api, token, first, concurrent_data)
    barrier = threading.Barrier(2)
    def upload_concurrently():
        separate = API(api.origin, api.anon, api.service)
        barrier.wait(timeout=5)
        return edge_upload(separate, concurrent, concurrent_data, token)
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(upload_concurrently) for _ in range(2)]
        rows = [job.result(timeout=45) for job in jobs]
    require(all(r['id'] == concurrent['id'] for r in rows), 'Concurrent uploads created different attachment identities')
    require(api.download(concurrent, token) == concurrent_data, 'Concurrent uploads corrupted bytes')
    require(db.execute('SELECT count(*) FROM storage.objects WHERE bucket_id=%s AND name=%s', (BUCKET, concurrent['storage_path'])).fetchone()[0] == 1,
            'Concurrent uploads left duplicate object metadata')
    mark('two independent concurrent Edge requests converge on one immutable object')

    api.ok(api.request('DELETE', '/rest/v1/invoice_files?id=eq.' + row['id'], token=token,
                       headers={'Prefer': 'return=representation'}), 'delete attachment metadata')
    queued = db.execute('SELECT storage_path,last_checked_at FROM private.invoice_storage_cleanup WHERE file_id=%s', (row['id'],)).fetchone()
    require(queued and queued[0] == row['storage_path'] and queued[1] is None, 'Deletion did not queue unacknowledged cleanup')
    require(object_row(db, row) is not None, 'Metadata deletion bypassed Storage API cleanup')
    db.execute("UPDATE private.invoice_storage_cleanup SET requested_at=now()-interval '6 minutes' WHERE file_id=%s", (row['id'],))
    api.rpc('invoice_file_cleanup_batch', {'p_limit': 20}, token, deny=True)
    payload = json.dumps({'url': api.origin, 'serviceKey': api.service})
    cleanup = json.loads(run(['node', str(FIXTURES / 'run-cleanup-worker.mjs')], input=payload, timeout=65))
    require(cleanup['status'] == 200 and cleanup['body']['completed'] == 1 and cleanup['body']['failed'] == 0,
            'Production cleanup worker did not complete real API deletion')
    require(any(r['method'] == 'DELETE' and r['path'] == '/storage/v1/object/' + BUCKET for r in cleanup['requests']),
            'Cleanup did not call the real Storage remove endpoint')
    require(object_row(db, row) is None, 'Storage remove left the current object metadata')
    api.download(row, api.service, deny=True)
    require(db.execute('SELECT last_checked_at IS NOT NULL FROM private.invoice_storage_cleanup WHERE file_id=%s', (row['id'],)).fetchone()[0],
            'Cleanup did not acknowledge after confirmed deletion')
    db.execute("UPDATE private.invoice_storage_cleanup SET last_checked_at=now()-interval '2 hours',last_attempted_at=now()-interval '2 minutes' WHERE file_id=%s", (row['id'],))
    again = json.loads(run(['node', str(FIXTURES / 'run-cleanup-worker.mjs')], input=payload, timeout=65))
    require(again['status'] == 200 and again['body']['completed'] == 1, 'Already-absent Storage cleanup was not idempotent')
    mark('real cleanup worker removes bytes before ack and reconciles absent objects')


def available_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def cli_environment(home):
    # Exclude all hosted credentials/config overrides and ordinary proxy envs.
    env = {key: value for key, value in os.environ.items()
           if not key.upper().startswith(('SUPABASE_', 'PG', 'BAMCO_TEST_', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'))}
    env.update(HOME=str(home), XDG_CONFIG_HOME=str(home / '.config'), SUPABASE_EXPERIMENTAL_STACK='0',
               NO_PROXY='127.0.0.1,localhost', DO_NOT_TRACK='1')
    return env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cli', default='supabase', help='Installed official Supabase CLI executable, exact version required')
    parser.add_argument('--cleanup-only', action='store_true', help='CI always-step fallback; only a runner-owned marked project can be stopped')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    marker = OUT / 'owned-project.json'
    if args.cleanup_only:
        if marker.exists():
            stored = json.loads(marker.read_text())
            work = Path(stored['workdir'])
            require(work.name.startswith('bamco-invoice-storage-') and work.parent == Path(tempfile.gettempdir()), 'Unrecognized cleanup directory')
            require((work / '.bamco-disposable-storage').read_text() == stored['project_id'], 'Cleanup ownership marker mismatch')
            run([args.cli, '--workdir', str(work), 'stop', '--no-backup'], env=cli_environment(work / 'home'), timeout=120)
            shutil.rmtree(work)
            marker.unlink()
        return
    require(os.environ.get('BAMCO_TEST_STORAGE_DISPOSABLE') == '1', 'Set BAMCO_TEST_STORAGE_DISPOSABLE=1 only in an isolated disposable CI job')
    require(os.environ.get('CI') == 'true', 'This harness is restricted to isolated CI')
    require(not marker.exists(), 'Prior owned project needs --cleanup-only before a new run')
    require(shutil.which(args.cli), 'Install the pinned official Supabase CLI first')
    require(shutil.which('docker') and shutil.which('node'), 'Docker and Node are required; no simulated pass is allowed')
    import psycopg
    require(psycopg.__version__ == DRIVER_VERSION, 'Install the exact psycopg version in tests/storage/requirements.txt')
    work = Path(tempfile.mkdtemp(prefix='bamco-invoice-storage-'))
    project = 'bamco-invoice-' + uuid4().hex[:16]
    (work / 'home').mkdir()
    (work / 'supabase').mkdir()
    (work / '.bamco-disposable-storage').write_text(project)
    env = cli_environment(work / 'home')
    cli = [args.cli, '--workdir', str(work)]
    db = None
    edge_process = None
    edge_log = None
    started = False
    try:
        version = run(cli + ['--version'], env=env).strip()
        require(version == CLI_VERSION, f'Expected Supabase CLI {CLI_VERSION}, received {version}')
        for command, expected in [('start', '--exclude'), ('status', '--output'), ('stop', '--no-backup')]:
            require(expected in run(cli + [command, '--help'], env=env), 'Pinned CLI help no longer provides required flags')
        run(['docker', 'info', '--format', '{{.ServerVersion}}'], timeout=15)
        config = (FIXTURES / 'config.toml').read_text().replace('bamco-invoice-storage-fixture', project)
        ports = {54321: available_port(), 54322: available_port(), 54320: available_port()}
        require(len(set(ports.values())) == len(ports), 'Ephemeral port selection collided; retry the job')
        for old, new in ports.items():
            config = config.replace(f'= {old}\n', f'= {new}\n')
        tomllib.loads(config)
        (work / 'supabase/config.toml').write_text(config)
        shutil.copytree(ROOT / 'supabase/functions/invoice-file-upload', work / 'supabase/functions/invoice-file-upload')
        marker.write_text(json.dumps({'workdir': str(work), 'project_id': project}))
        os.chmod(marker, 0o600)
        started = True
        print('Starting fresh real Supabase Auth, Storage, REST and PostgreSQL services', flush=True)
        # Deliberately never use --ignore-health-check, --linked, remote project
        # operations, application migrations or a hosted endpoint.
        run(cli + ['start', '--exclude', 'realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'],
            env=env, timeout=600)
        status = json.loads(run(cli + ['status', '-o', 'json'], env=env))
        require(all(key in status for key in ('API_URL', 'DB_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY')), 'Pinned CLI status contract changed')
        SECRET_VALUES.extend(str(v) for k, v in status.items() if any(part in k for part in ('KEY', 'SECRET', 'PASSWORD')))
        origin = origin_from_status(status['API_URL'])
        require(urlsplit(origin).port == ports[54321], 'CLI reported a different API port')
        settings = database_from_status(status['DB_URL'])
        require(settings['port'] == ports[54322], 'CLI reported a different database port')
        services = json.loads(run(cli + ['services', '-o', 'json'], env=env))
        require(any(v['name'] == 'supabase/storage-api' and v['local'] == STORAGE_VERSION for v in services), 'Unexpected Storage API version')
        RESULT['versions'] = {'cli': version, 'services': services, 'psycopg': psycopg.__version__}
        RESULT['source_sha256'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in [
            'supabase/schema-proposals/invoice-attachments.sql', 'assets/js/financial-obligations.js',
            'supabase/functions/invoice-file-cleanup/worker.mjs', 'tests/storage/fixture.sql']}
        db = psycopg.connect(**settings, autocommit=True)
        require(db.execute('SHOW server_version_num').fetchone()[0].startswith('17'), 'Real PostgreSQL 17 is required')
        require(db.execute("SELECT to_regclass('public.invoices') IS NULL AND to_regclass('auth.users') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL").fetchone()[0],
                'Refusing a populated or non-Supabase database')
        require(db.execute('SELECT (SELECT count(*) FROM auth.users)=0 AND (SELECT count(*) FROM storage.buckets)=0').fetchone()[0], 'Refusing nonempty Auth/Storage services')
        db.execute((FIXTURES / 'fixture.sql').read_text())
        db.execute((ROOT / 'supabase/schema-proposals/invoice-attachments.sql').read_text())
        db.execute("NOTIFY pgrst, 'reload schema'")
        api = API(origin, status['ANON_KEY'], status['SERVICE_ROLE_KEY'])
        # Only schema-cache readiness is polled; no behavioral assertion is retried.
        until = time.monotonic() + 30
        while True:
            response = api.request('GET', '/rest/v1/invoice_files?select=id&limit=1', token=api.service)
            if response[0] == 200:
                break
            require(time.monotonic() < until, 'PostgREST schema cache did not refresh within 30s')
            time.sleep(0.25)
        bucket = db.execute('SELECT public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id=%s', (BUCKET,)).fetchone()
        require(bucket and bucket[0] is False and bucket[1] == MAX_BYTES and set(bucket[2]) == {'application/pdf','image/jpeg','image/png','image/webp'}, 'Wrong private bucket configuration')
        mark('real service bootstrap and private 6 MiB bucket')
        require('--no-verify-jwt' in run(cli + ['functions', 'serve', '--help'], env=env), 'Pinned CLI function serve flags changed')
        edge_log = open(work / 'edge-runtime.log', 'w+')
        edge_process = subprocess.Popen(cli + ['functions', 'serve', 'invoice-file-upload', '--no-verify-jwt'],
                                        env=env, stdout=edge_log, stderr=subprocess.STDOUT, start_new_session=True)
        until = time.monotonic() + 90
        while True:
            require(edge_process.poll() is None, 'Local upload Edge exited before readiness')
            response = api.request('OPTIONS', '/functions/v1/invoice-file-upload', token=api.anon, label='local Edge readiness')
            if response[0] == 200:
                break
            require(time.monotonic() < until, 'Local upload Edge did not become ready within90seconds')
            time.sleep(0.5)
        mark('real local invoice upload Edge is serving with handler-owned caller authentication')
        execute_cases(api, db)
        RESULT['passed'] = True
    except BaseException as error:
        RESULT['error'] = redact(error)
        raise
    finally:
        if edge_process is not None:
            if edge_process.poll() is None:
                os.killpg(edge_process.pid, signal.SIGTERM)
                try: edge_process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    os.killpg(edge_process.pid, signal.SIGKILL)
                    edge_process.wait(timeout=5)
            if edge_log is not None:
                if not RESULT['passed']:
                    edge_log.seek(0)
                    RESULT['edge_runtime_diagnostic'] = redact(edge_log.read()[-3000:])
                edge_log.close()
        if db is not None:
            db.close()
        if started:
            try:
                # Project-scoped only. Never use --all or remove shared Docker resources.
                run(cli + ['stop', '--no-backup'], env=env, timeout=120)
                RESULT['cleanup_passed'] = True
                shutil.rmtree(work)
                marker.unlink(missing_ok=True)
            except BaseException as error:
                RESULT['passed'] = False
                RESULT['cleanup_error'] = redact(error)
                print('FAIL isolated project cleanup; run the documented --cleanup-only fallback', file=sys.stderr)
        else:
            shutil.rmtree(work)
        (OUT / 'acceptance.json').write_text(json.dumps(RESULT, indent=2) + '\n')
    require(RESULT['passed'] and RESULT['cleanup_passed'], 'Real Storage gate or cleanup did not pass')
    print('PASS real Storage API acceptance gate (including cleanup)', flush=True)


if __name__ == '__main__':
    try:
        main()
    except BaseException as error:
        print('FAIL real Storage API acceptance: ' + redact(error), file=sys.stderr)
        sys.exit(1)
