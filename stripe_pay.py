"""Stripe Checkout for kitchen leases."""
from __future__ import annotations

import os

PLAN_PRICE = {"stall": 149, "kitchen": 249, "corner": 399}
PLAN_LABEL = {"stall": "Stall", "kitchen": "Kitchen", "corner": "Corner"}


def secret():
    return (os.environ.get("STRIPE_SECRET_KEY") or "").strip()


def webhook_secret():
    return (os.environ.get("STRIPE_WEBHOOK_SECRET") or "").strip()


def public_url():
    return (
        os.environ.get("PUBLIC_URL")
        or os.environ.get("RENDER_EXTERNAL_URL")
        or "http://localhost:8765"
    ).rstrip("/")


def configured():
    return bool(secret())


def _stripe():
    import stripe
    key = secret()
    if not key:
        raise RuntimeError("Set STRIPE_SECRET_KEY in your environment (sk_test_… or sk_live_…).")
    stripe.api_key = key
    return stripe


def create_checkout(claim, pending_id):
    stripe = _stripe()
    plan = claim.get("plan") or "kitchen"
    cents = int(PLAN_PRICE.get(plan, 249)) * 100
    label = PLAN_LABEL.get(plan, "Kitchen")
    name = claim.get("name") or "Kitchen lease"
    kwargs = dict(
        mode="subscription",
        customer_email=claim.get("email") or None,
        success_url=public_url() + "/paid.html?session_id={CHECKOUT_SESSION_ID}",
        cancel_url=public_url() + "/?checkout=cancel",
        metadata={"pending_id": pending_id, "kitchen_id": claim.get("id") or ""},
        subscription_data={"metadata": {"pending_id": pending_id, "kitchen_id": claim.get("id") or ""}},
        line_items=[
            {
                "quantity": 1,
                "price_data": {
                    "currency": "usd",
                    "unit_amount": cents,
                    "recurring": {"interval": "month"},
                    "product_data": {
                        "name": f"{label} kitchen lease — {name}",
                        "description": f"Monthly storefront on Kitchens. Kitchen {claim.get('id')}.",
                        "tax_code": "txcd_20030000",
                    },
                },
            }
        ],
    )
    try:
        session = stripe.checkout.Session.create(**kwargs, managed_payments={"enabled": False})
    except TypeError:
        session = stripe.checkout.Session.create(**kwargs)
    return session


def retrieve_session(session_id):
    stripe = _stripe()
    return stripe.checkout.Session.retrieve(session_id)


def parse_webhook(payload, sig_header):
    stripe = _stripe()
    wh = webhook_secret()
    if not wh:
        raise RuntimeError("Set STRIPE_WEBHOOK_SECRET (from `stripe listen` or the Stripe dashboard).")
    return stripe.Webhook.construct_event(payload, sig_header, wh)


def cancel_subscription(sub_id):
    if not sub_id or not configured():
        return
    stripe = _stripe()
    try:
        stripe.Subscription.delete(sub_id)
    except Exception:
        try:
            stripe.Subscription.cancel(sub_id)
        except Exception:
            pass


def pause_subscription(sub_id):
    if not sub_id or not configured():
        return
    stripe = _stripe()
    stripe.Subscription.modify(sub_id, pause_collection={"behavior": "void"})


def resume_subscription(sub_id):
    if not sub_id or not configured():
        return
    stripe = _stripe()
    stripe.Subscription.modify(sub_id, pause_collection="")
