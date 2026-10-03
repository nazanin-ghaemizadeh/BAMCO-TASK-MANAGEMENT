#!/usr/bin/env python3
"""Real PostgreSQL 17, independent-session invoice attachment acceptance tests.

Install only in the test environment:
    python -m pip install 'psycopg[binary]==3.2.10'
Run against a NEW official postgres:17 CI service, using synthetic credentials:
    BAMCO_TEST_POSTGRES_DISPOSABLE=1 \
    BAMCO_TEST_POSTGRES_URL=postgresql://postgres:test@127.0.0.1:5432/postgres \
    python scripts/test-invoice-attachments-concurrency.py

Only loopback URLs, the postgres maintenance database, PostgreSQL 17, and a
cluster without the three fixture roles are accepted. A unique database and
fixture-only roles are created and removed in finally. Never use a production
connection or a Supabase project. No .env, application credentials, HTTP calls,
or live records are read. Auth and Storage metadata are explicit test stubs;
this exercises PostgreSQL transactions/RLS, NOT the Storage API or file bytes.

Every race uses separate backend PIDs, an open first transaction, and an observed
pg_blocking_pids/pg_stat_activity lock-wait before the first transaction commits.
Polling waits merely limit observer load; elapsed time never establishes order.
Lock, statement, barrier, thread, and whole-process timeouts fail the run. No
deadlock, timeout, serialization failure, or skipped test is counted as a pass.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import signal
import sys
import threading
import time
from urllib.parse import unquote, urlsplit
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
ACTOR = "00000000-0000-0000-0000-000000000001"
OUTSIDER = "00000000-0000-0000-0000-000000000002"
PERMISSIONS = {"view": True, "create": True, "edit": True, "delete": True}
FIXTURE_ROLES = ("authenticated", "anon", "service_role")
LOCK_WAIT_SECONDS = 6
THREAD_SECONDS = 20
PINNED_DRIVER = "3.2.10"


def require(condition, message):
    """Do not use Python assert: `python -O` must not disable acceptance checks."""
    if not condition:
        raise AssertionError(message)


def connection_settings():
    if os.environ.get("BAMCO_TEST_POSTGRES_DISPOSABLE") != "1":
        raise RuntimeError("Set BAMCO_TEST_POSTGRES_DISPOSABLE=1 for a fresh disposable CI cluster")
    value = os.environ.get("BAMCO_TEST_POSTGRES_URL", "")
    if not value:
        raise RuntimeError("BAMCO_TEST_POSTGRES_URL is required; there is no application-URL fallback")
    try:
        parsed = urlsplit(value)
        valid = (
            parsed.scheme in ("postgresql", "postgres")
            and parsed.hostname in ("127.0.0.1", "::1", "localhost")
            and parsed.path == "/postgres"
            and not parsed.query
            and not parsed.fragment
            and parsed.username is not None
            and parsed.password is not None
        )
        if not valid:
            raise ValueError("not a disposable loopback maintenance connection")
        return {
            "host": parsed.hostname,
            # Do not let DNS or libpq environment overrides redirect localhost.
            "hostaddr": "::1" if parsed.hostname == "::1" else "127.0.0.1",
            "port": parsed.port or 5432,
            "user": unquote(parsed.username),
            "password": unquote(parsed.password),
            "dbname": "postgres",
            "connect_timeout": 5,
            "sslmode": "disable",
            "application_name": "bamco-invoice-concurrency-test",
            "options": "-c statement_timeout=15000 -c lock_timeout=12000 -c idle_in_transaction_session_timeout=30000 -c timezone=UTC",
        }
    except (ValueError, TypeError) as error:
        # Do not print connection values or credentials in CI output.
        raise RuntimeError("Only a loopback PostgreSQL URL ending /postgres with no query parameters is allowed") from error


def invoice_payload(label, amount="100.00", currency="IRR"):
    return {
        "invoice_number": label,
        "title": f"Synthetic {label}",
        "account_party": "Synthetic supplier",
        "company_name": "Synthetic supplier",
        "currency": currency,
        "total_amount": amount,
        "due_date": None,
        "description": None,
    }


def payment_payload(invoice_id, sequence=1, amount="100.00", status="paid"):
    return {
        "invoice_id": invoice_id,
        "sequence_no": sequence,
        "amount": amount,
        "status": status,
        "planned_date": None,
        "paid_date": None,
        "tracking_no": None,
        "notes": None,
    }


class ConcurrentCall:
    def __init__(self, connection, action):
        self.connection = connection
        self.action = action
        self.started = threading.Event()
        self.done = threading.Event()
        self.result = None
        self.error = None
        self.thread = threading.Thread(target=self.run, daemon=True)

    def run(self):
        try:
            with self.connection.transaction():
                self.started.set()
                self.result = self.action(self.connection)
        except BaseException as error:
            self.error = error
        finally:
            self.done.set()

    def start(self):
        self.thread.start()
        require(self.started.wait(5), "concurrent session did not enter its transaction")

    def finish(self):
        if not self.done.wait(THREAD_SECONDS):
            self.connection.cancel()
            self.done.wait(3)
            raise AssertionError("concurrent statement exceeded its bounded completion deadline")
        self.thread.join(timeout=1)
        require(not self.thread.is_alive(), "concurrent worker failed to exit")


class Harness:
    def __init__(self, settings, driver, sql, jsonb):
        self.settings = settings
        self.psycopg = driver
        self.sql = sql
        self.jsonb = jsonb
        self.admin = None
        self.observer = None
        self.actor = None
        self.database = "bamco_invoice_concurrency_" + uuid4().hex
        self.created_database = False
        self.roles_owned = False
        self.cluster_lock = False
        self.sessions = []
        self.passed = 0
        self.races = 0

    def connect(self, *, actor=True, permissions=None, uid=ACTOR):
        connection = self.psycopg.connect(
            **{**self.settings, "dbname": self.database}, autocommit=True
        )
        self.sessions.append(connection)
        if actor:
            connection.execute(
                "select set_config('test.uid',%s,false), set_config('test.permissions',%s,false), set_config('test.manager','false',false)",
                (uid, json.dumps(PERMISSIONS if permissions is None else permissions)),
            )
            connection.execute("set role authenticated")
            require(connection.execute("select current_user").fetchone()[0] == "authenticated", "test actor must exercise RLS")
        require(connection.execute("show transaction_isolation").fetchone()[0] == "read committed", "races must exercise deployed READ COMMITTED semantics")
        return connection

    def setup(self):
        self.admin = self.psycopg.connect(**self.settings, autocommit=True)
        version, superuser = self.admin.execute(
            "select current_setting('server_version_num')::integer, rolsuper from pg_roles where rolname=current_user"
        ).fetchone()
        require(version // 10000 == 17, f"PostgreSQL 17 is required, got server version number {version}")
        require(superuser, "fresh disposable cluster superuser required for fixture-only roles")
        self.cluster_lock = self.admin.execute(
            "select pg_try_advisory_lock(17298341, 20261003)"
        ).fetchone()[0]
        require(self.cluster_lock, "another fixture harness already owns this disposable cluster")
        existing = self.admin.execute(
            "select rolname from pg_roles where rolname = any(%s)", (list(FIXTURE_ROLES),)
        ).fetchall()
        require(not existing, "fixture roles already exist; refusing to alter a non-fresh cluster")
        self.admin.execute(self.sql.SQL("create database {} template template0").format(self.sql.Identifier(self.database)))
        self.created_database = True
        self.observer = self.connect(actor=False)
        # The fixture's role creation is transactional. Mark ownership only
        # after that transaction commits, so partial setup cannot drop others.
        with self.observer.transaction():
            self.observer.execute((ROOT / "tests/sql/fixtures/invoice-live-contract.sql").read_text(), prepare=False)
            self.observer.execute((ROOT / "supabase/migrations/20260924160000_invoice_payment_consistency.sql").read_text(), prepare=False)
            for uid in (ACTOR, OUTSIDER):
                self.observer.execute("insert into public.profiles(id) values(%s)", (uid,))
        self.roles_owned = True
        proposal = (ROOT / "supabase/schema-proposals/invoice-attachments.sql").read_text()
        self.observer.execute(proposal, prepare=False)
        self.observer.execute(proposal, prepare=False)
        self.observer.execute((ROOT / "supabase/schema-proposals/invoice-attachment-delete.sql").read_text(), prepare=False)
        self.actor = self.connect()
        print(f"SETUP PostgreSQL {version}; isolated synthetic database; proposal reapplied; real independent backends", flush=True)

    def cleanup(self):
        errors = []
        for connection in reversed(self.sessions):
            try:
                connection.close()  # Open/failed transactions roll back on close.
            except Exception as error:
                errors.append(type(error).__name__)
        if self.admin is not None:
            try:
                if self.created_database:
                    self.admin.execute(self.sql.SQL("drop database {} with (force)").format(self.sql.Identifier(self.database)))
                if self.roles_owned:
                    for role in FIXTURE_ROLES:
                        self.admin.execute(self.sql.SQL("drop role {}").format(self.sql.Identifier(role)))
                if self.cluster_lock:
                    self.admin.execute("select pg_advisory_unlock(17298341, 20261003)")
            except Exception as error:
                errors.append(type(error).__name__)
            finally:
                self.admin.close()
        require(not errors, "test database/role cleanup failed: " + ", ".join(errors))
        if self.created_database:
            print("CLEANUP isolated database and fixture roles removed", flush=True)

    def rpc(self, connection, name, *args):
        require(re.fullmatch(r"[a-z_]+", name) is not None, "invalid fixed test RPC name")
        arguments = [self.jsonb(value) if isinstance(value, dict) else value for value in args]
        query = self.sql.SQL("select public.{}({})").format(
            self.sql.Identifier(name), self.sql.SQL(",").join(self.sql.Placeholder() for _ in arguments)
        )
        return connection.execute(query, arguments).fetchone()[0]

    def save_invoice(self, connection, payload, invoice_id=None, request=None):
        return self.rpc(connection, "save_invoice", request or uuid4(), invoice_id, payload)

    def save_payment(self, connection, payload, payment_id=None, request=None):
        return self.rpc(connection, "save_invoice_payment", request or uuid4(), payment_id, payload)

    def reserve(self, connection, invoice_id, payment_id=None, kind="proforma", request=None, sha="a" * 64):
        return self.rpc(connection, "reserve_invoice_file", request or uuid4(), invoice_id, payment_id, kind, "synthetic.pdf", "application/pdf", 32, sha)

    def upload(self, connection, row):
        # Synthetic metadata is seeded as test admin; browser writes are denied.
        self.observer.execute(
            "insert into storage.objects(bucket_id,name,metadata,user_metadata,owner_id) values('invoices-private',%s,%s,%s,%s)",
            (row["storage_path"], self.jsonb({"size": int(row["size_bytes"]), "mimetype": row["content_type"]}), self.jsonb({"sha256": row["sha256"]}), ACTOR),
        )

    def finalize(self, connection, row):
        return self.rpc(connection, "finalize_invoice_file", row["id"])

    def delete_file(self, connection, row):
        return self.rpc(connection, "delete_invoice_file", row["id"], row["invoice_id"], row["payment_id"], row["file_type"], row["client_request_id"])

    def workspace(self):
        return self.rpc(self.actor, "list_invoice_workspace")

    def file(self, file_id):
        return next(row for row in self.workspace()["files"] if row["id"] == file_id)

    def settled(self, label):
        payload = invoice_payload(label)
        invoice = self.save_invoice(self.actor, payload)
        payment = self.save_payment(self.actor, payment_payload(invoice["id"]))
        return invoice, payment, payload

    def pass_test(self, label):
        self.passed += 1
        print(f"PASS {label}", flush=True)

    def check_error(self, error, states, contains):
        require(isinstance(error, self.psycopg.Error), f"expected PostgreSQL rejection, got {error!r}")
        require(error.sqlstate in states, f"expected SQLSTATE {states}, got {error.sqlstate}: {error}")
        if contains:
            require(contains.casefold() in str(error).casefold(), f"expected rejection containing {contains!r}: {error}")

    def reject(self, action, states=("22023",), contains=None):
        try:
            with self.actor.transaction():
                action(self.actor)
        except self.psycopg.Error as error:
            self.check_error(error, states, contains)
            return
        raise AssertionError("expected rejection, but operation committed")

    def wait_blocked(self, pending, blocker, label):
        deadline = time.monotonic() + LOCK_WAIT_SECONDS
        pid = pending.connection.info.backend_pid
        while time.monotonic() < deadline:
            state = self.observer.execute(
                "select pg_blocking_pids(%s), wait_event_type, wait_event from pg_stat_activity where pid=%s",
                (pid, pid),
            ).fetchone()
            if state and blocker in state[0] and state[1] == "Lock":
                return
            if pending.done.is_set():
                raise AssertionError(f"{label}: second session completed before the required lock barrier; error={pending.error!r}")
            pending.done.wait(0.02)
        raise AssertionError(f"{label}: no observed lock wait on first backend within {LOCK_WAIT_SECONDS}s")

    def race(self, label, first, second, *, rejection=None, view_first=False, view_second=False):
        view_only = {**PERMISSIONS, "edit": False}
        one = self.connect(permissions=view_only if view_first else None)
        two = self.connect(permissions=view_only if view_second else None)
        require(len({one.info.backend_pid, two.info.backend_pid, self.observer.info.backend_pid}) == 3, "race requires three independent PostgreSQL sessions")
        pending = ConcurrentCall(two, second)
        try:
            with one.transaction():
                first_result = first(one)
                pending.start()
                self.wait_blocked(pending, one.info.backend_pid, label)
                # Exiting this context releases the exact observed blocker.
            pending.finish()
            if rejection is not None:
                self.check_error(pending.error, rejection[0], rejection[1])
            elif pending.error is not None:
                raise pending.error
            self.races += 1
            print(f"  LOCK BARRIER {label}: distinct sessions, observed wait, commit released waiter", flush=True)
            return first_result, pending.result
        finally:
            if pending.thread.ident is not None and not pending.done.is_set():
                two.cancel()
                require(pending.done.wait(THREAD_SECONDS), f"{label}: cancelled worker did not exit")
            one.close()
            two.close()

    def request_replays(self):
        for kind in ("invoice", "payment", "file"):
            for mismatched in (False, True):
                suffix = f"{kind}-{'conflict' if mismatched else 'replay'}"
                request = uuid4()
                if kind == "invoice":
                    payload = invoice_payload(suffix)
                    other = {**payload, "title": "Different"} if mismatched else payload
                    first = lambda connection: self.save_invoice(connection, payload, request=request)
                    second = lambda connection: self.save_invoice(connection, other, request=request)
                    table = "invoices"
                elif kind == "payment":
                    invoice = self.save_invoice(self.actor, invoice_payload(suffix))
                    payload = payment_payload(invoice["id"], amount="40.00")
                    other = {**payload, "amount": "41.00"} if mismatched else payload
                    first = lambda connection: self.save_payment(connection, payload, request=request)
                    second = lambda connection: self.save_payment(connection, other, request=request)
                    table = "invoice_payments"
                else:
                    invoice = self.save_invoice(self.actor, invoice_payload(suffix))
                    first = lambda connection: self.reserve(connection, invoice["id"], request=request)
                    second = lambda connection: self.reserve(connection, invoice["id"], request=request, sha=("b" if mismatched else "a") * 64)
                    table = "invoice_files"
                original, repeated = self.race(
                    suffix, first, second,
                    rejection=(("22023",), "already used") if mismatched else None,
                )
                if not mismatched:
                    require(original["id"] == repeated["id"], f"{kind} replay created a different row")
                count = self.observer.execute(self.sql.SQL("select count(*) from public.{} where client_request_id=%s").format(self.sql.Identifier(table)), (request,)).fetchone()[0]
                require(count == 1, f"{kind} must have exactly one row for concurrent request UUID")
                require(self.observer.execute("select count(*) from private.invoice_mutation_requests where request_id=%s", (request,)).fetchone()[0] == 1, "request ledger must have one committed entry")
                self.pass_test(f"concurrent {suffix}: one row and one ledger entry")

    def mutate(self, kind, invoice, payment, payload):
        if kind == "total-increase":
            return lambda connection: self.save_invoice(connection, {**payload, "total_amount": "120.00"}, invoice["id"])
        if kind == "unpaid-stage":
            return lambda connection: self.save_payment(connection, payment_payload(invoice["id"], status="planned"), payment["id"])
        return lambda connection: self.save_payment(connection, payment_payload(invoice["id"], sequence=2, amount="1.00", status="planned"))

    def assert_unsettled(self, invoice_id):
        row = self.observer.execute(
            "select private.invoice_is_settled(id), status from public.invoices where id=%s", (invoice_id,)
        ).fetchone()
        require(row[0] is False and row[1] != "settled", "financial mutation must leave invoice ineligible for a current final")

    def final_races(self):
        for operation in ("reserve", "finalize"):
            for kind in ("total-increase", "unpaid-stage", "new-planned-payment"):
                for mutation_first in (True, False):
                    label = f"final-{operation}/{kind}/{'mutation-first' if mutation_first else 'file-first'}"
                    invoice, payment, payload = self.settled(label)
                    reservation = None
                    request = uuid4()
                    if operation == "finalize":
                        reservation = self.reserve(self.actor, invoice["id"], kind="final", request=request)
                        self.upload(self.actor, reservation)
                        file_action = lambda connection: self.finalize(connection, reservation)
                    else:
                        file_action = lambda connection: self.reserve(connection, invoice["id"], kind="final", request=request)
                    mutation = self.mutate(kind, invoice, payment, payload)
                    if mutation_first:
                        self.race(label, mutation, file_action, rejection=(("22023",), "full settlement"), view_second=True)
                        if reservation:
                            require(self.file(reservation["id"])["upload_state"] == "pending", "rejected finalization must leave retryable pending metadata")
                        else:
                            require(self.observer.execute("select count(*) from public.invoice_files where client_request_id=%s", (request,)).fetchone()[0] == 0, "rejected final reservation must not commit metadata")
                    else:
                        ready_or_pending, _ = self.race(label, file_action, mutation, view_first=True)
                        file_row = self.file(ready_or_pending["id"])
                        require(file_row["final_is_current"] is False, "financial change must invalidate final snapshot")
                        require(file_row["upload_state"] == ("ready" if operation == "finalize" else "pending"), "race changed attachment state unexpectedly")
                        if operation == "reserve":
                            self.reject(lambda connection: self.finalize(connection, file_row), contains="full settlement")
                    self.assert_unsettled(invoice["id"])
                    self.pass_test(label)

    def settlement_and_overpayment(self):
        # A waiting reservation must observe the last paid stage committed by
        # the lock holder, rather than the old partially-paid statement snapshot.
        invoice = self.save_invoice(self.actor, invoice_payload("last-stage-reserve"))
        self.save_payment(self.actor, payment_payload(invoice["id"], amount="60.00"))
        _, reserved = self.race(
            "last-paid-stage/reserve",
            lambda connection: self.save_payment(connection, payment_payload(invoice["id"], 2, "40.00")),
            lambda connection: self.reserve(connection, invoice["id"], kind="final"),
            view_second=True,
        )
        self.upload(self.actor, reserved)
        require(self.finalize(self.actor, reserved)["final_is_current"] is True, "newly fully-paid invoice must permit a current final")

        invoice, payment, _ = self.settled("last-stage-finalize")
        reserved = self.reserve(self.actor, invoice["id"], kind="final")
        self.upload(self.actor, reserved)
        self.save_payment(self.actor, payment_payload(invoice["id"], status="planned"), payment["id"])
        _, ready = self.race(
            "last-paid-stage/finalize",
            lambda connection: self.save_payment(connection, payment_payload(invoice["id"]), payment["id"]),
            lambda connection: self.finalize(connection, reserved),
            view_second=True,
        )
        require(ready["final_is_current"] is True, "finalize must assert settlement after acquiring the serialized parent lock")
        snapshot = self.observer.execute("select settlement_snapshot from public.invoice_files where id=%s", (ready["id"],)).fetchone()[0]
        require(snapshot["total_amount"] == "100.00" and snapshot["payments"][0]["status"] == "paid", "final snapshot must contain post-lock committed settlement")
        self.pass_test("final reserve/finalize see last paid stage only after serialized parent lock")

        invoice = self.save_invoice(self.actor, invoice_payload("concurrent-overpayment"))
        self.race(
            "concurrent-overpayment",
            lambda connection: self.save_payment(connection, payment_payload(invoice["id"], 1, "60.00")),
            lambda connection: self.save_payment(connection, payment_payload(invoice["id"], 2, "50.00")),
            rejection=(("P0001",), "مبلغ"),
        )
        amount, count = self.observer.execute("select sum(amount)::text,count(*) from public.invoice_payments where invoice_id=%s", (invoice["id"],)).fetchone()
        require(amount == "60.00" and count == 1, "concurrent overpayment must roll back entire second payment")
        self.pass_test("existing payment validator serializes concurrent paid stages without broadening RLS")

    def exact_money_and_receipts(self):
        huge = 9007199254740993
        for table in ("invoices", "invoice_payments", "invoice_files"):
            self.observer.execute("select setval(pg_get_serial_sequence(%s,'id'),%s,false)", ("public." + table, huge))
        amount = "9007199254740993.01"
        payload = invoice_payload("exact-money-receipt", amount, "USD")
        # The UUID is deliberately shared by both actual backend calls.
        exact_request = uuid4()
        invoice, duplicate = self.race(
            "exact-bigint-money-create",
            lambda connection: self.save_invoice(connection, payload, request=exact_request),
            lambda connection: self.save_invoice(connection, payload, request=exact_request),
        )
        require(invoice["id"] == str(huge) == duplicate["id"], "bigint invoice ID must remain an exact JSON string")
        require(invoice["total_amount"] == amount and invoice["currency"] == "USD", "money/currency changed across concurrent replay")
        payment = self.save_payment(self.actor, payment_payload(invoice["id"], amount=amount))
        require(payment["id"] == str(huge) and payment["invoice_id"] == str(huge), "payment and parent IDs must remain exact strings")
        require(payment["amount"] == amount and payment["percent_of_total"] == "100.000", "payment exact numeric values changed")
        receipt = self.reserve(self.actor, invoice["id"], payment["id"], "receipt")
        self.upload(self.actor, receipt)
        first, second = self.race(
            "same-receipt-finalize",
            lambda connection: self.finalize(connection, receipt),
            lambda connection: self.finalize(connection, receipt),
        )
        require(first["id"] == second["id"] == str(huge), "concurrent finalize must preserve exact attachment ID")
        require(first["invoice_id"] == first["payment_id"] == str(huge), "receipt must preserve its exact invoice/payment pair")
        linked = self.observer.execute("select receipt_path, amount::text from public.invoice_payments where id=%s and invoice_id=%s", (payment["id"], invoice["id"])).fetchone()
        require(linked == (receipt["storage_path"], amount), "receipt atomic link or exact amount changed")
        other = self.save_invoice(self.actor, invoice_payload("wrong-receipt-parent"))
        self.reject(lambda connection: self.reserve(connection, other["id"], payment["id"], "receipt"), states=("23503",))
        self.reject(lambda connection: self.save_payment(connection, payment_payload(other["id"]), payment["id"]), contains="immutable")
        for currency in ("IRR", "IRT", "USD", "EUR"):
            value = self.save_invoice(self.actor, invoice_payload(f"currency-{currency}", "1234.56", currency))
            require(value["currency"] == currency and value["total_amount"] == "1234.56", f"{currency} must not be rescaled or converted")
        self.pass_test("exact >2^53 IDs/money, four currencies, concurrent receipt finalize and immutable parent pair")

    def storage_and_cascade_races(self):
        # This is synthetic Storage metadata SQL, never a Storage API/bytes test.
        for kind in ("proforma", "receipt", "final"):
            invoice, payment, _ = self.settled(f"storage-denial-{kind}")
            row = self.reserve(self.actor, invoice["id"], payment["id"] if kind == "receipt" else None, kind)
            self.reject(lambda connection: connection.execute(
                "insert into storage.objects(bucket_id,name) values('invoices-private',%s)", (row["storage_path"],)), states=("42501",))
            self.upload(self.actor, row)
            for ready in (False, True):
                if ready: self.finalize(self.actor, row)
                changed = self.actor.execute("update storage.objects set metadata=metadata where bucket_id='invoices-private' and name=%s returning name", (row["storage_path"],)).fetchall()
                require(changed == [], "direct browser updates must affect zero pending and ready objects")
            self.pass_test(f"{kind} direct browser Storage writes denied; service-seeded metadata finalizes")

        for parent in ("invoice", "payment"):
            invoice, payment, _ = self.settled(f"cascade-{parent}")
            ready = self.reserve(self.actor, invoice["id"], payment["id"], "receipt")
            self.upload(self.actor, ready)
            self.finalize(self.actor, ready)
            pending = self.reserve(self.actor, invoice["id"], payment["id"], "receipt")
            table, parent_id = ("invoices", invoice["id"]) if parent == "invoice" else ("invoice_payments", payment["id"])
            deleted, _ = self.race(
                f"{parent}-cascade-versus-upload-authorization",
                lambda connection: connection.execute(
                    self.sql.SQL("delete from public.{} where id=%s returning id").format(self.sql.Identifier(table)), (parent_id,)
                ).fetchall(),
                lambda connection: self.rpc(connection, "get_invoice_file_upload", pending["id"]),
                rejection=(("42501",), None),
            )
            require(len(deleted) == 1, "authorized cascade did not remove its parent")
            for row in (ready, pending):
                require(self.observer.execute("select count(*) from public.invoice_files where id=%s", (row["id"],)).fetchone()[0] == 0, "cascade retained child file metadata")
                queued = self.observer.execute("select storage_path from private.invoice_storage_cleanup where file_id=%s", (row["id"],)).fetchone()
                require(queued == (row["storage_path"],), "cascade did not enqueue exact ready/pending cleanup path")
            require(self.observer.execute("select count(*) from storage.objects where name=%s", (ready["storage_path"],)).fetchone()[0] == 1, "cascade must not SQL-delete Storage objects")
            require(self.observer.execute("select count(*) from storage.objects where name=%s", (pending["storage_path"],)).fetchone()[0] == 0, "upload resurrected an object after parent deletion")

            # Simulate an authorized cleanup acknowledgment. Metadata is only a
            # stub; this deliberately makes no claim that real bytes were removed.
            require(self.rpc(self.observer, "ack_invoice_file_cleanup", pending["id"]) is True, "synthetic cleanup acknowledgment failed")
            self.reject(
                lambda connection: self.reserve(connection, invoice["id"], payment["id"], "receipt", request=pending["client_request_id"]),
                contains="retired",
            )
            require(self.observer.execute("select count(*) from private.invoice_mutation_requests where request_id=%s", (pending["client_request_id"],)).fetchone()[0] == 1, "cleanup acknowledgment erased request tombstone")
            self.pass_test(f"{parent} cascade serializes upload authorization, queues ready/pending files, and retains replay tombstone")

    def attachment_delete_races(self):
        for kind in ("proforma", "receipt", "final"):
            for deletion_first in (True, False):
                label = f"selected-file-delete/{kind}/{'delete-first' if deletion_first else 'finalize-first'}"
                invoice, payment, _ = self.settled(label)
                row = self.reserve(self.actor, invoice["id"], payment["id"] if kind == "receipt" else None, kind)
                self.upload(self.actor, row)
                remove = lambda connection: self.delete_file(connection, row)
                finalize = lambda connection: self.finalize(connection, row)
                if deletion_first:
                    removed, _ = self.race(label, remove, finalize, rejection=(("42501",), "access denied"))
                else:
                    _, removed = self.race(label, finalize, remove)
                require(removed["deleted"] is True, "selected delete did not acknowledge its exact row")
                require(self.observer.execute("select count(*) from public.invoice_files where id=%s", (row["id"],)).fetchone()[0] == 0, "selected file row remains")
                require(self.observer.execute("select count(*) from private.invoice_storage_cleanup where file_id=%s", (row["id"],)).fetchone()[0] == 1, "selected deletion must retain one bounded tombstone")
                current = self.observer.execute("select amount::text,receipt_path from public.invoice_payments where id=%s", (payment["id"],)).fetchone()
                require(current[0] == payment["amount"] and current[1] is None, "file deletion changed payment amount or retained stale receipt")
                require(self.delete_file(self.actor, row)["deleted"] is False, "retry must explicitly report already absent")
                self.pass_test(label + ": exact tombstone and payment preservation")
        invoice, _, _ = self.settled("same-selected-file-delete")
        row = self.reserve(self.actor, invoice["id"])
        self.upload(self.actor, row)
        self.finalize(self.actor, row)
        first, repeated = self.race("same-selected-file-delete", lambda c: self.delete_file(c,row), lambda c: self.delete_file(c,row))
        require(first["deleted"] is True and repeated["deleted"] is False, "concurrent delete replay must converge without claiming two deletions")
        self.pass_test("concurrent selected-file deletion converges without duplicate tombstones")

    def access_scope(self):
        invoice, payment, _ = self.settled("view-only-scope")
        view = self.connect(permissions={**PERMISSIONS, "edit": False})
        final = self.reserve(view, invoice["id"], kind="final")
        self.upload(view, final)
        require(self.finalize(view, final)["upload_state"] == "ready", "view-scoped final attachment permissions must survive parent locking")
        try:
            with view.transaction():
                self.save_payment(view, payment_payload(invoice["id"], 2, "1.00", "planned"))
        except self.psycopg.Error as error:
            self.check_error(error, ("42501",), "payment lock access denied")
        else:
            raise AssertionError("existing invoice-edit RLS requirement for payment trigger was broadened")
        # Also exercise the original trigger directly: the new RPC's explicit
        # parent lock must not conceal a broadened underlying UPDATE policy.
        try:
            with view.transaction():
                view.execute("insert into public.invoice_payments(invoice_id,sequence_no,amount,status) values(%s,2,1,'planned')", (invoice["id"],))
        except self.psycopg.Error as error:
            self.check_error(error, ("P0001",), "یافت نشد")
        else:
            raise AssertionError("original invoker payment validator no longer enforces invoice edit RLS")
        outsider = self.connect(uid=OUTSIDER)
        require(self.rpc(outsider, "list_invoice_workspace") == {"invoices": [], "payments": [], "files": []}, "unrelated actor can see invoice rows")
        try:
            with outsider.transaction():
                self.reserve(outsider, invoice["id"], kind="final")
        except self.psycopg.Error as error:
            self.check_error(error, ("42501",), "access denied")
        else:
            raise AssertionError("parent lock helper granted outsider attachment access")
        require(self.observer.execute("select count(*) from public.invoice_payments where invoice_id=%s", (invoice["id"],)).fetchone()[0] == 1, "denied payment operation left a row")
        require(payment["invoice_id"] == invoice["id"], "fixture parent mismatch")
        view.close()
        outsider.close()
        self.pass_test("view-only final files remain allowed; original payment edit requirement and outsider denial remain intact")

    def run(self):
        self.setup()
        self.request_replays()
        self.final_races()
        self.settlement_and_overpayment()
        self.exact_money_and_receipts()
        self.storage_and_cascade_races()
        self.attachment_delete_races()
        self.access_scope()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.parse_args()
    settings = connection_settings()
    try:
        import psycopg
        from psycopg import sql
        from psycopg.types.json import Jsonb
    except ImportError as error:
        raise RuntimeError(f"Install pinned isolated test dependency: python -m pip install 'psycopg[binary]=={PINNED_DRIVER}'") from error
    require(psycopg.__version__ == PINNED_DRIVER, f"Expected psycopg {PINNED_DRIVER}; install the documented pinned test dependency")
    harness = Harness(settings, psycopg, sql, Jsonb)
    started = time.monotonic()
    if hasattr(signal, "SIGALRM"):
        def deadline(_signum, _frame):
            raise TimeoutError("whole concurrency suite exceeded 240-second deadline")
        signal.signal(signal.SIGALRM, deadline)
        signal.alarm(240)
    try:
        harness.run()
    finally:
        if hasattr(signal, "SIGALRM"):
            signal.alarm(0)
        harness.cleanup()
    print(f"Invoice attachment multi-session PostgreSQL contract: PASS ({harness.passed} cases, {harness.races} observed concurrent lock barriers, {time.monotonic() - started:.1f}s)", flush=True)
    print("Storage API/bytes and deployment remain outside this synthetic database test.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Database errors contain only synthetic fixture inputs, never the URL.
        print(f"FAIL {type(error).__name__}: {error}", file=sys.stderr, flush=True)
        raise SystemExit(1)
