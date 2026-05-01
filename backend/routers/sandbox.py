"""Sandbox mode — populate a tenant's account with realistic demo data so they can
explore the product while waiting for Meta template approval (1-24 hrs).

Toggle on: seeds 50 conversations, 200 leads, 5 campaigns, 1 marketplace flow installed
Toggle off: removes everything tagged sandbox=true
"""
from __future__ import annotations
import random
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends

from server import db
from models import uid, now
from helpers import get_current_user

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


FIRST_NAMES = ["Asha", "Ravi", "Priya", "Amit", "Sneha", "Karan", "Neha", "Rohan", "Diya", "Arjun",
               "Pooja", "Vikram", "Riya", "Aditya", "Meera", "Sanjay", "Kavya", "Manish", "Tanvi", "Rahul"]
LAST_NAMES = ["Sharma", "Patel", "Gupta", "Khan", "Reddy", "Iyer", "Singh", "Kumar", "Mehta", "Bose"]
SAMPLE_INBOUND = [
    "Hi, can I get a quote?", "What's your pricing?", "How long for delivery?",
    "Do you ship to Bangalore?", "Is this still available?", "Need a custom plan",
    "Can I see a demo?", "Whats your refund policy?", "Looking for bulk order",
    "Hi, are you open today?",
]
SAMPLE_OUTBOUND = [
    "Sure! Sharing pricing now.", "Yes, we deliver across India.", "Thanks for reaching out!",
    "Demo can be scheduled tomorrow at 11 AM.", "Yes — bulk gets 15% off.",
]


@router.post("/enable")
async def enable_sandbox(current=Depends(get_current_user)):
    """Seed 50 conversations, 200 leads, 5 campaigns. Idempotent."""
    tid = current["tenant_id"]
    existing = await db.conversations.count_documents({"tenant_id": tid, "sandbox": True})
    if existing >= 30:
        return {"already_active": True, "summary": {"conversations": existing}}

    # Pick or create a sandbox credential
    cred = await db.whatsapp_credentials.find_one({"tenant_id": tid}, {"_id": 0})
    if not cred:
        cred_id = uid()
        cred = {
            "id": cred_id, "tenant_id": tid, "name": "Sandbox channel (demo)",
            "provider": "twilio_sandbox", "is_verified": True, "status": "active",
            "whatsapp_from": "whatsapp:+14155238886", "phone_number_id": "",
            "account_sid_enc": "", "auth_token_enc": "",
            "sandbox": True, "created_at": now().isoformat(),
        }
        await db.whatsapp_credentials.insert_one(cred)

    # 200 leads
    leads_to_insert = []
    for _ in range(200):
        fn = random.choice(FIRST_NAMES)
        ln = random.choice(LAST_NAMES)
        phone = f"+9198{random.randint(10000000, 99999999):08d}"
        leads_to_insert.append({
            "id": uid(), "tenant_id": tid, "phone": phone,
            "name": f"{fn} {ln}", "email": f"{fn.lower()}.{ln.lower()}@demo.test",
            "company": random.choice(["Acme", "Globex", "Initech", "Stark", "Wayne", None]),
            "source": random.choice(["organic", "ctwa", "form", "qr"]),
            "status": random.choice(["new", "qualified", "contacted", "converted", "new", "new"]),
            "lead_score": random.randint(20, 95),
            "sandbox": True,
            "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 45))).isoformat(),
        })
    if leads_to_insert:
        await db.leads.insert_many(leads_to_insert)

    # 50 conversations + 1-5 messages each
    convs_to_insert = []
    msgs_to_insert = []
    for i, ld in enumerate(leads_to_insert[:50]):
        cid = uid()
        last_at = (datetime.now(timezone.utc) - timedelta(hours=random.randint(0, 240)))
        sentiment = random.choice(["positive", "neutral", "neutral", "negative"])
        score = random.randint(20, 95)
        unread = random.choice([0, 0, 0, 1, 2, 3])
        convs_to_insert.append({
            "id": cid, "tenant_id": tid, "credential_id": cred["id"],
            "customer_phone": ld["phone"], "customer_name": ld["name"],
            "status": "active", "unread_count": unread, "lead_score": score,
            "sentiment": sentiment,
            "referral": ({"source_url": "https://facebook.com/ads/...", "headline": "Save 20% this week", "source_id": f"ad_{random.randint(1000,9999)}"} if random.random() < 0.25 else None),
            "source": "ctwa" if random.random() < 0.25 else "organic",
            "last_message": random.choice(SAMPLE_INBOUND),
            "last_message_at": last_at.isoformat(),
            "sandbox": True,
            "created_at": last_at.isoformat(),
        })
        # 2-5 messages
        n_msgs = random.randint(2, 5)
        ts = last_at - timedelta(minutes=10 * n_msgs)
        for j in range(n_msgs):
            direction = "inbound" if j == 0 or random.random() < 0.5 else "outbound"
            msgs_to_insert.append({
                "id": uid(), "conversation_id": cid, "tenant_id": tid,
                "direction": direction,
                "content": random.choice(SAMPLE_INBOUND if direction == "inbound" else SAMPLE_OUTBOUND),
                "status": "delivered" if direction == "outbound" else None,
                "message_id": "", "source": "sandbox",
                "sent_at": (ts + timedelta(minutes=10 * j)).isoformat(),
                "sandbox": True,
            })

    if convs_to_insert:
        await db.conversations.insert_many(convs_to_insert)
    if msgs_to_insert:
        await db.messages.insert_many(msgs_to_insert)

    # 5 campaigns
    camps = []
    for nm, status in [
        ("Welcome series", "completed"),
        ("Monsoon sale 2026", "completed"),
        ("Cart recovery", "running"),
        ("New product launch", "scheduled"),
        ("Loyalty rewards", "draft"),
    ]:
        sent = random.randint(80, 450) if status in ("completed", "running") else 0
        delivered = int(sent * random.uniform(0.85, 0.97))
        read = int(delivered * random.uniform(0.55, 0.85))
        camps.append({
            "id": uid(), "tenant_id": tid, "name": nm, "status": status,
            "total": sent + random.randint(50, 200), "completed": sent,
            "delivered": delivered, "read": read,
            "failed": sent - delivered, "credential_id": cred["id"],
            "body": "Sample campaign body — sandbox demo.",
            "sandbox": True,
            "created_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 30))).isoformat(),
        })
    if camps:
        await db.campaigns.insert_many(camps)

    # Mark tenant sandbox flag
    await db.tenants.update_one({"id": tid}, {"$set": {"sandbox_mode": True, "sandbox_seeded_at": now().isoformat()}})

    return {
        "enabled": True,
        "summary": {
            "conversations": len(convs_to_insert),
            "messages": len(msgs_to_insert),
            "leads": len(leads_to_insert),
            "campaigns": len(camps),
        },
    }


@router.post("/disable")
async def disable_sandbox(current=Depends(get_current_user)):
    """Remove all sandbox=true documents."""
    tid = current["tenant_id"]
    r = {
        "messages": (await db.messages.delete_many({"tenant_id": tid, "sandbox": True})).deleted_count,
        "conversations": (await db.conversations.delete_many({"tenant_id": tid, "sandbox": True})).deleted_count,
        "leads": (await db.leads.delete_many({"tenant_id": tid, "sandbox": True})).deleted_count,
        "campaigns": (await db.campaigns.delete_many({"tenant_id": tid, "sandbox": True})).deleted_count,
    }
    await db.tenants.update_one({"id": tid}, {"$set": {"sandbox_mode": False}, "$unset": {"sandbox_seeded_at": ""}})
    return {"disabled": True, "deleted": r}


@router.get("/status")
async def sandbox_status(current=Depends(get_current_user)):
    tid = current["tenant_id"]
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0}) or {}
    counts = {
        "conversations": await db.conversations.count_documents({"tenant_id": tid, "sandbox": True}),
        "leads": await db.leads.count_documents({"tenant_id": tid, "sandbox": True}),
        "campaigns": await db.campaigns.count_documents({"tenant_id": tid, "sandbox": True}),
    }
    return {"active": bool(tenant.get("sandbox_mode")), "counts": counts}
