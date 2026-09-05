# BAMCO TASK MANAGEMENT - Local Outlook Bridge
# Runs on Windows and talks only to an already-open Outlook desktop session.
from __future__ import annotations

import json
import re
import sys
import traceback
import base64
import tempfile
import os
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HOST = '127.0.0.1'
PORT = 8765
ALLOWED_ORIGINS = {
    'https://nazanin-ghaemizadeh.github.io',
    'http://127.0.0.1',
    'http://localhost',
    'null',
}


def get_outlook():
    try:
        import pythoncom
        import win32com.client
    except Exception as exc:
        raise RuntimeError('pywin32 نصب نیست. فایل Setup_Outlook_Bridge.bat را اجرا کنید.') from exc
    pythoncom.CoInitialize()
    try:
        return win32com.client.GetActiveObject('Outlook.Application')
    except Exception as exc:
        raise RuntimeError('Outlook باز نیست. ابتدا Outlook دسکتاپ را باز کنید.') from exc


def smtp_of_address_entry(entry):
    try:
        if str(entry.Type).upper() == 'EX':
            ex = entry.GetExchangeUser()
            if ex and ex.PrimarySmtpAddress:
                return ex.PrimarySmtpAddress
        return entry.Address
    except Exception:
        return ''


def sender_smtp(item):
    try:
        if str(getattr(item, 'SenderEmailType', '')).upper() == 'EX':
            sender = item.Sender
            if sender:
                ex = sender.GetExchangeUser()
                if ex and ex.PrimarySmtpAddress:
                    return ex.PrimarySmtpAddress
        return getattr(item, 'SenderEmailAddress', '') or ''
    except Exception:
        return ''


def normalize_addr(value):
    return str(value or '').strip().lower()


def recipient_addresses(item):
    out = []
    try:
        for i in range(1, item.Recipients.Count + 1):
            r = item.Recipients.Item(i)
            addr = smtp_of_address_entry(r.AddressEntry) or getattr(r, 'Address', '')
            if addr:
                out.append(normalize_addr(addr))
    except Exception:
        pass
    return out


def find_sent_message(outlook, recipient, subject_hint='', days=45):
    ns = outlook.GetNamespace('MAPI')
    sent = ns.GetDefaultFolder(5)
    items = sent.Items
    items.Sort('[SentOn]', True)
    cutoff = datetime.now() - timedelta(days=max(1, int(days or 45)))
    recipient = normalize_addr(recipient)
    hint = str(subject_hint or '').strip().lower()
    checked = 0
    for item in items:
        checked += 1
        if checked > 2500:
            break
        try:
            sent_on = item.SentOn
            dt = datetime(sent_on.year, sent_on.month, sent_on.day, sent_on.hour, sent_on.minute, sent_on.second)
            if dt < cutoff:
                break
            if recipient and recipient not in recipient_addresses(item):
                continue
            subj = str(getattr(item, 'Subject', '') or '')
            if hint and hint not in subj.lower():
                continue
            return item
        except Exception:
            continue
    return None


def html_wrap(body):
    body = str(body or '')
    if '<html' in body.lower():
        return body
    return '<html><body dir="rtl" style="font-family:\'B Nazanin\';font-size:14pt;text-align:right">' + body + '</body></html>'


def add_inline_sticker(mail, data_url):
    if not data_url:
        return
    try:
        raw = str(data_url)
        if ',' in raw:
            raw = raw.split(',', 1)[1]
        data = base64.b64decode(raw)
        fd, temp_path = tempfile.mkstemp(suffix='.png', prefix='bamco_sticker_')
        os.close(fd)
        with open(temp_path, 'wb') as fh:
            fh.write(data)
        att = mail.Attachments.Add(temp_path)
        try:
            att.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F', 'bamco_sticker')
        finally:
            try:
                os.remove(temp_path)
            except OSError:
                pass
    except Exception:
        pass


def make_mail(payload, automatic=False):
    outlook = get_outlook()
    mail = outlook.CreateItem(0)
    mail.To = str(payload.get('to') or '')
    cc = payload.get('cc') or []
    if isinstance(cc, list):
        cc = ';'.join(str(x) for x in cc if x)
    mail.CC = str(cc or '')
    mail.Subject = str(payload.get('subject') or '')
    mail.HTMLBody = html_wrap(payload.get('html') or '')
    add_inline_sticker(mail, payload.get('inline_image'))
    try:
        mail.Recipients.ResolveAll()
    except Exception:
        pass
    if automatic:
        mail.Send()
        return {'status': 'sent', 'subject': mail.Subject}
    mail.Display(False)
    return {'status': 'preview', 'subject': mail.Subject}


def reply_to_previous(payload, automatic=False):
    outlook = get_outlook()
    original = find_sent_message(
        outlook,
        payload.get('recipient') or '',
        payload.get('subject_hint') or '',
        payload.get('days') or 45,
    )
    if original is None:
        raise RuntimeError('ایمیل قبلی برای این شخص در Sent Items پیدا نشد.')
    reply = original.ReplyAll()
    new_html = html_wrap(payload.get('html') or '')
    old_html = str(getattr(reply, 'HTMLBody', '') or '')
    m = re.search(r'<body[^>]*>(.*)</body>', new_html, flags=re.I | re.S)
    prefix = m.group(1) if m else new_html
    reply.HTMLBody = prefix + '<br><br>' + old_html
    if automatic:
        reply.Send()
        return {'status': 'sent'}
    reply.Display(False)
    return {'status': 'preview'}


def scan_replies(payload):
    outlook = get_outlook()
    ns = outlook.GetNamespace('MAPI')
    inbox = ns.GetDefaultFolder(6)
    items = inbox.Items
    items.Sort('[ReceivedTime]', True)
    emails = {normalize_addr(x) for x in (payload.get('emails') or []) if x}
    days = int(payload.get('days') or 60)
    cutoff = datetime.now() - timedelta(days=max(1, days))
    result = {e: None for e in emails}
    checked = 0
    for item in items:
        checked += 1
        if checked > 5000 or all(result.values()):
            break
        try:
            rt = item.ReceivedTime
            dt = datetime(rt.year, rt.month, rt.day, rt.hour, rt.minute, rt.second)
            if dt < cutoff:
                break
            addr = normalize_addr(sender_smtp(item))
            if addr in result and result[addr] is None:
                result[addr] = {
                    'received_at': dt.isoformat(),
                    'subject': str(getattr(item, 'Subject', '') or ''),
                }
        except Exception:
            continue
    return {'replies': result}


class Handler(BaseHTTPRequestHandler):
    server_version = 'BAMCOOutlookBridge/1.0'

    def log_message(self, fmt, *args):
        sys.stdout.write('[BAMCO Bridge] ' + fmt % args + '\n')

    def _origin(self):
        return self.headers.get('Origin', '') or 'null'

    def _cors(self):
        origin = self._origin()
        if origin in ALLOWED_ORIGINS or origin.startswith('https://nazanin-ghaemizadeh.github.io'):
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '600')

    def _json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if urlparse(self.path).path != '/health':
            return self._json(404, {'ok': False, 'error': 'not found'})
        try:
            outlook = get_outlook()
            ns = outlook.GetNamespace('MAPI')
            offline = bool(getattr(ns, 'Offline', False))
            self._json(200, {'ok': True, 'outlook_open': True, 'offline': offline})
        except Exception as exc:
            self._json(503, {'ok': False, 'outlook_open': False, 'error': str(exc)})

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            n = int(self.headers.get('Content-Length', '0') or '0')
            payload = json.loads(self.rfile.read(n).decode('utf-8') or '{}')
            if path == '/mail/preview':
                result = make_mail(payload, automatic=False)
            elif path == '/mail/send':
                result = make_mail(payload, automatic=True)
            elif path == '/followup/preview':
                result = reply_to_previous(payload, automatic=False)
            elif path == '/followup/send':
                result = reply_to_previous(payload, automatic=True)
            elif path == '/replies/scan':
                result = scan_replies(payload)
            else:
                return self._json(404, {'ok': False, 'error': 'not found'})
            self._json(200, {'ok': True, **result})
        except Exception as exc:
            traceback.print_exc()
            self._json(500, {'ok': False, 'error': str(exc)})


if __name__ == '__main__':
    print('BAMCO Outlook Bridge')
    print(f'Listening on http://{HOST}:{PORT}')
    print('Outlook desktop must already be open.')
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
