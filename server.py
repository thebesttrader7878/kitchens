#!/usr/bin/env python3
"""Kitchens hall + tiny JSON API. Stdlib only."""
from __future__ import annotations

import json
import os
import posixpath
import re
import secrets
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("DATA_DIR") or os.path.join(ROOT, "data")
PORT = int(os.environ.get("PORT", "8765"))
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PLAN_PRICE = {"stall": 149, "kitchen": 249, "corner": 399}
MONTH_MS = 30 * 24 * 60 * 60 * 1000
LIVE = {"active", "past_due"}
SECRET_FIELDS = ("email", "pin", "manageToken")


def ensure_data():
    os.makedirs(DATA, exist_ok=True)
    defaults = {
        "config.json": {"password": "wilsons"},
        "emails.json": [],
        "claims.json": [],
        "pending.json": {},
    }
    for name, value in defaults.items():
        path = os.path.join(DATA, name)
        if not os.path.exists(path):
            write_json(path, value)


def read_json(path, fallback):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return fallback


def write_json(path, value):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def config():
    return read_json(os.path.join(DATA, "config.json"), {"password": "wilsons"})


def now_ms():
    return int(time.time() * 1000)


def hydrate(claim):
    claim = dict(claim)
    plan = claim.get("plan") or "kitchen"
    claim["plan"] = plan
    claim["price"] = int(claim.get("price") or PLAN_PRICE.get(plan, 249))
    claim.setdefault("status", "active")
    claim.setdefault("startedAt", claim.get("claimedAt") or now_ms())
    claim.setdefault("renewsAt", int(claim["startedAt"]) + MONTH_MS)
    if not claim.get("pin"):
        claim["pin"] = f"{secrets.randbelow(1_000_000):06d}"
    if not claim.get("manageToken"):
        claim["manageToken"] = secrets.token_urlsafe(24)
    if claim["status"] == "active" and int(claim.get("renewsAt") or 0) < now_ms():
        claim["status"] = "past_due"
    return claim


def public_claim(claim):
    return {k: v for k, v in claim.items() if k not in SECRET_FIELDS}


def owner_view(claim):
    safe = public_claim(claim)
    safe["email"] = claim.get("email")
    return safe


def lease_ok(lease, body):
    token = str(body.get("token") or "")
    stored_token = str(lease.get("manageToken") or "")
    if token and stored_token and secrets.compare_digest(token, stored_token):
        return True
    email = str(body.get("email") or "").strip().lower()
    pin = str(body.get("pin") or "").strip()
    stored_pin = str(lease.get("pin") or "")
    stored_email = str(lease.get("email") or "").lower()
    if email and pin and stored_pin and stored_email:
        return email == stored_email and secrets.compare_digest(pin, stored_pin)
    return False


def load_claims():
    return [hydrate(c) for c in read_json(os.path.join(DATA, "claims.json"), [])]


def save_claims(claims):
    write_json(os.path.join(DATA, "claims.json"), claims)
    return claims


def load_pending():
    return read_json(os.path.join(DATA, "pending.json"), {})


def save_pending(pending):
    write_json(os.path.join(DATA, "pending.json"), pending)
    return pending


def fulfill_claim(claim, stripe_meta=None):
    claim = hydrate(claim)
    claim["status"] = "active"
    claim["startedAt"] = now_ms()
    claim["renewsAt"] = now_ms() + MONTH_MS
    claim["lastPaidAt"] = now_ms()
    if stripe_meta:
        if stripe_meta.get("customer"):
            claim["stripeCustomerId"] = stripe_meta["customer"]
        if stripe_meta.get("subscription"):
            claim["stripeSubscriptionId"] = stripe_meta["subscription"]
        if stripe_meta.get("id"):
            claim["stripeSessionId"] = stripe_meta["id"]
    claims = load_claims()
    sid = claim.get("stripeSessionId")
    if sid:
        existing = next((c for c in claims if c.get("stripeSessionId") == sid), None)
        if existing:
            return existing
    cid = claim.get("id")
    claims = [c for c in claims if not (c.get("id") == cid and c.get("status") in LIVE)]
    claims.append(claim)
    save_claims(claims)
    return claim


def find_proven(claims, body):
    cid = str(body.get("id") or "")
    matches = [c for c in claims if lease_ok(c, body)]
    if cid:
        matches = [c for c in matches if c.get("id") == cid]
    return matches


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api("GET", parsed)
        if parsed.path.startswith("/data/"):
            self.send_error(404)
            return
        if parsed.path.rstrip("/") == "/dashboard":
            self.path = "/dashboard.html"
        if parsed.path.rstrip("/") == "/my":
            self.path = "/my.html"
        if parsed.path.rstrip("/") == "/paid":
            self.path = "/paid.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api("POST", parsed)
        self.send_error(404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            return self.handle_api("DELETE", parsed)
        self.send_error(404)

    def raw(self):
        if not hasattr(self, "_raw"):
            n = int(self.headers.get("Content-Length") or 0)
            self._raw = self.rfile.read(n) if n else b""
        return self._raw

    def body(self):
        try:
            return json.loads(self.raw().decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return {}

    def json_out(self, code, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authed(self):
        key = self.headers.get("X-Admin-Key") or ""
        return key != "" and key == str(config().get("password") or "wilsons")

    def handle_api(self, method, parsed):
        path = posixpath.normpath(parsed.path)
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/api/stripe/status" and method == "GET":
            import stripe_pay
            return self.json_out(200, {"configured": stripe_pay.configured()})

        if path == "/api/checkout" and method == "POST":
            import stripe_pay
            incoming = self.body()
            cid = str(incoming.get("id") or "")
            if not cid or cid == "k1":
                return self.json_out(400, {"ok": False, "error": "Pick a kitchen."})
            incoming["email"] = str(incoming.get("email") or "").strip().lower()
            if not EMAIL_RE.match(incoming["email"]):
                return self.json_out(400, {"ok": False, "error": "Enter a real email for the lease."})
            claims = load_claims()
            taken = next((c for c in claims if c.get("id") == cid and c.get("status") in LIVE), None)
            if taken:
                return self.json_out(409, {"ok": False, "error": "That kitchen is already leased."})
            if not stripe_pay.configured():
                return self.json_out(400, {
                    "ok": False,
                    "error": "Stripe is not set up yet. Add STRIPE_SECRET_KEY to a .env file.",
                })
            pending_id = secrets.token_urlsafe(16)
            pending = load_pending()
            pending[pending_id] = {"claim": incoming, "at": now_ms()}
            save_pending(pending)
            try:
                session = stripe_pay.create_checkout(incoming, pending_id)
            except Exception as e:
                return self.json_out(400, {"ok": False, "error": str(e)})
            pending[pending_id]["sessionId"] = session.id
            save_pending(pending)
            return self.json_out(200, {"ok": True, "url": session.url})

        if path == "/api/checkout/session" and method == "GET":
            import stripe_pay
            sid = (qs.get("session_id") or [""])[0]
            if not sid:
                return self.json_out(400, {"ok": False, "error": "Missing session."})
            try:
                session = stripe_pay.retrieve_session(sid)
            except Exception as e:
                return self.json_out(400, {"ok": False, "error": str(e)})
            paid = session.payment_status == "paid" or session.status == "complete"
            if not paid:
                return self.json_out(402, {"ok": False, "error": "Payment not finished."})
            claims = load_claims()
            existing = next((c for c in claims if c.get("stripeSessionId") == sid), None)
            if not existing:
                pending_id = (session.metadata or {}).get("pending_id")
                bag = load_pending().get(pending_id) if pending_id else None
                if not bag:
                    return self.json_out(404, {"ok": False, "error": "Lease not ready yet. Wait a few seconds."})
                existing = fulfill_claim(bag["claim"], {
                    "id": session.id,
                    "customer": session.customer,
                    "subscription": session.subscription,
                })
                pending = load_pending()
                pending.pop(pending_id, None)
                save_pending(pending)
            return self.json_out(200, {
                "ok": True,
                "lease": {
                    "id": existing.get("id"),
                    "pin": existing.get("pin"),
                    "manageToken": existing.get("manageToken"),
                    "email": existing.get("email"),
                    "name": existing.get("name"),
                },
            })

        if path == "/api/stripe/webhook" and method == "POST":
            import stripe_pay
            try:
                event = stripe_pay.parse_webhook(self.raw(), self.headers.get("Stripe-Signature"))
            except Exception as e:
                return self.json_out(400, {"ok": False, "error": str(e)})
            etype = event["type"]
            obj = event["data"]["object"]
            if etype == "checkout.session.completed":
                pending_id = (obj.get("metadata") or {}).get("pending_id")
                bag = load_pending().get(pending_id) if pending_id else None
                if bag:
                    fulfill_claim(bag["claim"], {
                        "id": obj.get("id"),
                        "customer": obj.get("customer"),
                        "subscription": obj.get("subscription"),
                    })
                    pending = load_pending()
                    pending.pop(pending_id, None)
                    save_pending(pending)
            elif etype == "invoice.paid":
                sub = obj.get("subscription")
                claims = load_claims()
                lease = next((c for c in claims if c.get("stripeSubscriptionId") == sub), None)
                if lease:
                    lease["status"] = "active"
                    lease["lastPaidAt"] = now_ms()
                    lease["renewsAt"] = now_ms() + MONTH_MS
                    save_claims(claims)
            elif etype == "invoice.payment_failed":
                sub = obj.get("subscription")
                claims = load_claims()
                lease = next((c for c in claims if c.get("stripeSubscriptionId") == sub), None)
                if lease:
                    lease["status"] = "past_due"
                    save_claims(claims)
            elif etype == "customer.subscription.deleted":
                sub = obj.get("id")
                claims = load_claims()
                lease = next((c for c in claims if c.get("stripeSubscriptionId") == sub), None)
                if lease:
                    lease["status"] = "cancelled"
                    lease["cancelledAt"] = now_ms()
                    save_claims(claims)
            return self.json_out(200, {"ok": True})

        if path == "/api/login" and method == "POST":
            pw = str(self.body().get("password") or "")
            ok = pw == str(config().get("password") or "wilsons")
            return self.json_out(200 if ok else 401, {"ok": ok})

        if path == "/api/emails" and method == "POST":
            email = str(self.body().get("email") or "").strip().lower()
            if not EMAIL_RE.match(email):
                return self.json_out(400, {"ok": False, "error": "Enter a real email."})
            emails = read_json(os.path.join(DATA, "emails.json"), [])
            if not any(e.get("email") == email for e in emails):
                emails.append({"email": email, "at": int(time.time() * 1000)})
                write_json(os.path.join(DATA, "emails.json"), emails)
            return self.json_out(200, {"ok": True})

        if path == "/api/claims" and method == "GET":
            claims = load_claims()
            save_claims(claims)
            if not self.authed():
                public = []
                for c in claims:
                    if c.get("status") not in LIVE:
                        continue
                    public.append(public_claim(c))
                return self.json_out(200, public)
            return self.json_out(200, claims)

        if path == "/api/claims" and method == "POST":
            incoming = self.body()
            claims = load_claims()
            if isinstance(incoming, list):
                if not self.authed():
                    return self.json_out(401, {"ok": False})
                claims = [hydrate(c) for c in incoming]
                save_claims(claims)
                return self.json_out(200, {"ok": True})
            cid = str(incoming.get("id") or "")
            if not cid or cid == "k1":
                return self.json_out(400, {"ok": False, "error": "Pick a kitchen."})
            incoming.pop("pin", None)
            incoming.pop("manageToken", None)
            incoming["email"] = str(incoming.get("email") or "").strip().lower()
            if not EMAIL_RE.match(incoming["email"]):
                return self.json_out(400, {"ok": False, "error": "Enter a real email for the lease."})
            incoming = hydrate(incoming)
            claims = [c for c in claims if c.get("id") != cid]
            claims.append(incoming)
            save_claims(claims)
            return self.json_out(200, {
                "ok": True,
                "lease": {
                    "id": incoming["id"],
                    "pin": incoming["pin"],
                    "manageToken": incoming["manageToken"],
                    "email": incoming["email"],
                },
            })

        if path == "/api/lease/lookup" and method == "POST":
            body = self.body()
            found = find_proven(load_claims(), body)
            if not found:
                return self.json_out(403, {"ok": False, "error": "Email and PIN didn’t match a lease."})
            return self.json_out(200, {
                "ok": True,
                "token": found[0].get("manageToken"),
                "leases": [owner_view(c) for c in found],
            })

        if path == "/api/lease/update" and method == "POST":
            body = self.body()
            claims = load_claims()
            matches = find_proven(claims, body)
            lease = matches[0] if matches else None
            if not lease or lease.get("status") == "cancelled":
                return self.json_out(403, {"ok": False, "error": "That PIN doesn’t unlock this kitchen."})
            for field in ("name", "owner", "cuisine", "tagline", "url"):
                if field in body and body[field] is not None:
                    lease[field] = str(body[field]).strip()
            if body.get("color") is not None:
                lease["color"] = int(body["color"])
            if body.get("accent") is not None:
                lease["accent"] = int(body["accent"])
            if "logo" in body:
                lease["logo"] = body.get("logo") or ""
            if body.get("plan") in PLAN_PRICE:
                lease["plan"] = body["plan"]
                lease["price"] = PLAN_PRICE[body["plan"]]
            save_claims(claims)
            return self.json_out(200, {"ok": True, "lease": owner_view(lease)})

        if path == "/api/lease/cancel" and method == "POST":
            body = self.body()
            claims = load_claims()
            matches = find_proven(claims, body)
            lease = matches[0] if matches else None
            if not lease:
                return self.json_out(403, {"ok": False, "error": "That PIN doesn’t unlock this kitchen."})
            lease["status"] = "cancelled"
            lease["cancelledAt"] = now_ms()
            save_claims(claims)
            try:
                import stripe_pay
                stripe_pay.cancel_subscription(lease.get("stripeSubscriptionId"))
            except Exception:
                pass
            return self.json_out(200, {"ok": True, "lease": owner_view(lease)})

        if path == "/api/admin/lease" and method == "POST":
            if not self.authed():
                return self.json_out(401, {"ok": False, "error": "Sign in."})
            body = self.body()
            claims = load_claims()
            cid = str(body.get("id") or "")
            lease = next((c for c in claims if c.get("id") == cid), None)
            if not lease:
                return self.json_out(404, {"ok": False, "error": "No lease on that kitchen."})
            action = str(body.get("action") or "")
            if action == "renew":
                lease["status"] = "active"
                lease["lastPaidAt"] = now_ms()
                lease["renewsAt"] = now_ms() + MONTH_MS
            elif action == "pause":
                lease["status"] = "paused"
                try:
                    import stripe_pay
                    stripe_pay.pause_subscription(lease.get("stripeSubscriptionId"))
                except Exception:
                    pass
            elif action == "resume":
                lease["status"] = "active"
                if int(lease.get("renewsAt") or 0) < now_ms():
                    lease["renewsAt"] = now_ms() + MONTH_MS
                try:
                    import stripe_pay
                    stripe_pay.resume_subscription(lease.get("stripeSubscriptionId"))
                except Exception:
                    pass
            elif action == "cancel":
                lease["status"] = "cancelled"
                lease["cancelledAt"] = now_ms()
                try:
                    import stripe_pay
                    stripe_pay.cancel_subscription(lease.get("stripeSubscriptionId"))
                except Exception:
                    pass
            elif action == "plan" and body.get("plan") in PLAN_PRICE:
                lease["plan"] = body["plan"]
                lease["price"] = PLAN_PRICE[body["plan"]]
            else:
                return self.json_out(400, {"ok": False, "error": "Unknown action."})
            save_claims(claims)
            return self.json_out(200, {"ok": True, "lease": lease})

        if not self.authed():
            return self.json_out(401, {"ok": False, "error": "Sign in."})

        if path == "/api/emails" and method == "GET":
            return self.json_out(200, read_json(os.path.join(DATA, "emails.json"), []))

        if path == "/api/emails" and method == "DELETE":
            email = (qs.get("email") or [""])[0].strip().lower()
            emails = [e for e in read_json(os.path.join(DATA, "emails.json"), []) if e.get("email") != email]
            write_json(os.path.join(DATA, "emails.json"), emails)
            return self.json_out(200, {"ok": True})

        if path == "/api/claims" and method == "DELETE":
            cid = (qs.get("id") or [""])[0]
            claims = [c for c in read_json(os.path.join(DATA, "claims.json"), []) if c.get("id") != cid]
            write_json(os.path.join(DATA, "claims.json"), claims)
            return self.json_out(200, {"ok": True, "claims": claims})

        if path == "/api/password" and method == "POST":
            nxt = str(self.body().get("password") or "").strip()
            if len(nxt) < 4:
                return self.json_out(400, {"ok": False, "error": "Use at least 4 characters."})
            cfg = config()
            cfg["password"] = nxt
            write_json(os.path.join(DATA, "config.json"), cfg)
            return self.json_out(200, {"ok": True})

        return self.json_out(404, {"ok": False})


def main():
    ensure_data()
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Kitchens → http://localhost:{PORT}")
    print(f"Dashboard → http://localhost:{PORT}/dashboard.html")
    print("Default dashboard password: wilsons")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
