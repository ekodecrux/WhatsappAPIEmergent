"""Branding & custom-domain mapping for tenant white-labeling.

Per-tenant overrides:
- logo_url, brand_name, primary_color, favicon_url, login_hero_text, custom_css

Per-tenant custom domains:
- Add domain → returns TXT verification token + CNAME target
- Verify → DNS lookup checks the TXT record matches the token
- Public lookup (unauth) → frontend uses to fetch tenant brand by hostname
"""
from __future__ import annotations
import os
import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from server import db
from models import uid, now
from helpers import get_current_user, audit_log

router = APIRouter(prefix="/branding", tags=["branding"])

CNAME_TARGET = os.environ.get("WHITELABEL_CNAME_TARGET", "messaging-vault.preview.emergentagent.com")
HOSTNAME_RX = re.compile(
    r"^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$", re.I
)


# ============== Branding overrides ==============
class BrandingIn(BaseModel):
    brand_name: str | None = Field(default=None, max_length=80)
    logo_url: str | None = Field(default=None, max_length=600)
    favicon_url: str | None = Field(default=None, max_length=600)
    primary_color: str | None = Field(default=None, max_length=20)
    login_hero_text: str | None = Field(default=None, max_length=300)
    custom_css: str | None = Field(default=None, max_length=20000)


def _public_brand(tenant: dict) -> dict:
    b = (tenant or {}).get("branding") or {}
    return {
        "tenant_id": tenant.get("id"),
        "tenant_name": tenant.get("company_name") or b.get("brand_name") or "wabridge",
        "brand_name": b.get("brand_name") or tenant.get("company_name") or "wabridge",
        "logo_url": b.get("logo_url"),
        "favicon_url": b.get("favicon_url"),
        "primary_color": b.get("primary_color"),
        "login_hero_text": b.get("login_hero_text"),
        "custom_css": b.get("custom_css") or "",
    }


@router.get("")
async def get_branding(current=Depends(get_current_user)):
    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0}) or {}
    domains_cur = db.tenant_domains.find(
        {"tenant_id": current["tenant_id"]}, {"_id": 0},
    ).sort("created_at", -1)
    domains = await domains_cur.to_list(50)
    return {
        "branding": (tenant.get("branding") or {}),
        "domains": domains,
        "cname_target": CNAME_TARGET,
    }


@router.patch("")
async def update_branding(payload: BrandingIn, current=Depends(get_current_user)):
    patch = {f"branding.{k}": v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not patch:
        raise HTTPException(400, "No fields to update")
    if "branding.primary_color" in patch:
        c = patch["branding.primary_color"].strip()
        if not re.match(r"^#[0-9a-fA-F]{6}$", c):
            raise HTTPException(400, "primary_color must be a 6-digit hex like #16A34A")
    await db.tenants.update_one({"id": current["tenant_id"]}, {"$set": patch})
    await audit_log(current["tenant_id"], current["id"], "update_branding", current["tenant_id"], list(patch.keys()))
    tenant = await db.tenants.find_one({"id": current["tenant_id"]}, {"_id": 0})
    return {"branding": (tenant.get("branding") or {})}


# ============== Custom Domains ==============
class DomainIn(BaseModel):
    hostname: str = Field(min_length=4, max_length=253)


@router.post("/domains")
async def add_domain(payload: DomainIn, current=Depends(get_current_user)):
    host = payload.hostname.strip().lower().removeprefix("https://").removeprefix("http://").rstrip("/")
    if not HOSTNAME_RX.match(host):
        raise HTTPException(400, "Invalid hostname. Use a fully-qualified domain like chat.acme.com")
    if await db.tenant_domains.find_one({"hostname": host, "status": {"$ne": "revoked"}}):
        raise HTTPException(409, "This domain is already registered")
    doc = {
        "id": uid(),
        "tenant_id": current["tenant_id"],
        "hostname": host,
        "txt_token": "wabridge-verify=" + secrets.token_hex(16),
        "cname_target": CNAME_TARGET,
        "status": "pending",
        "created_at": now().isoformat(),
        "created_by": current["id"],
    }
    await db.tenant_domains.insert_one(doc)
    doc.pop("_id", None)
    await audit_log(current["tenant_id"], current["id"], "add_domain", doc["id"], {"hostname": host})
    return doc


@router.post("/domains/{did}/verify")
async def verify_domain(did: str, current=Depends(get_current_user)):
    d = await db.tenant_domains.find_one({"id": did, "tenant_id": current["tenant_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Domain not found")
    if d["status"] == "revoked":
        raise HTTPException(409, "Domain has been revoked by platform admin")

    # Look up TXT records on _wabridge.<hostname>
    try:
        import dns.resolver
        resolver = dns.resolver.Resolver()
        resolver.timeout = 4
        resolver.lifetime = 6
        try:
            answers = resolver.resolve(f"_wabridge.{d['hostname']}", "TXT")
        except Exception:
            answers = resolver.resolve(d["hostname"], "TXT")
        found_tokens = []
        for rdata in answers:
            for txt in rdata.strings:
                try:
                    found_tokens.append(txt.decode("utf-8"))
                except Exception:
                    pass
    except Exception as e:
        return {
            "verified": False,
            "reason": f"DNS lookup failed: {str(e)[:140]}",
            "expected_txt_record": d["txt_token"],
            "expected_host": f"_wabridge.{d['hostname']}",
        }

    matched = any(d["txt_token"] in t for t in found_tokens)
    if not matched:
        return {
            "verified": False,
            "reason": "TXT record not found yet — DNS may take up to 1 hour to propagate.",
            "expected_txt_record": d["txt_token"],
            "expected_host": f"_wabridge.{d['hostname']}",
            "found_records": found_tokens[:6],
        }

    # Verified! mark active
    await db.tenant_domains.update_one(
        {"id": did},
        {"$set": {"status": "verified", "verified_at": now().isoformat()}},
    )
    await audit_log(current["tenant_id"], current["id"], "verify_domain", did, {"hostname": d["hostname"]})
    return {"verified": True, "hostname": d["hostname"], "cname_target": CNAME_TARGET}


@router.delete("/domains/{did}")
async def remove_domain(did: str, current=Depends(get_current_user)):
    res = await db.tenant_domains.delete_one({"id": did, "tenant_id": current["tenant_id"]})
    if not res.deleted_count:
        raise HTTPException(404, "Domain not found")
    return {"deleted": True}


# ============== Public lookup (unauthenticated) ==============
@router.get("/public")
async def public_branding(host: str = Query(..., min_length=3, max_length=253)):
    """Return tenant branding for a custom domain. Used by frontend to white-label by hostname.

    Falls back to {} when no tenant is mapped → frontend renders default wabridge UI.
    """
    h = host.strip().lower().removeprefix("https://").removeprefix("http://").rstrip("/")
    # Strip port if present
    h = h.split(":", 1)[0]
    d = await db.tenant_domains.find_one({"hostname": h, "status": "verified"}, {"_id": 0})
    if not d:
        return {"matched": False, "branding": None}
    tenant = await db.tenants.find_one({"id": d["tenant_id"]}, {"_id": 0})
    if not tenant:
        return {"matched": False, "branding": None}
    return {"matched": True, "branding": _public_brand(tenant)}


# ============== Super-admin oversight ==============
class RevokeIn(BaseModel):
    reason: str | None = None


def _require_super(current):
    if not current.get("is_superadmin"):
        raise HTTPException(403, "Super admin only")


@router.get("/admin/all")
async def admin_list_domains(current=Depends(get_current_user)):
    _require_super(current)
    cur = db.tenant_domains.find({}, {"_id": 0}).sort("created_at", -1)
    domains = await cur.to_list(500)
    # enrich with tenant name
    tids = list({d["tenant_id"] for d in domains})
    tenants = await db.tenants.find({"id": {"$in": tids}}, {"_id": 0, "id": 1, "company_name": 1, "plan": 1}).to_list(500)
    tmap = {t["id"]: t for t in tenants}
    for d in domains:
        t = tmap.get(d["tenant_id"], {})
        d["tenant_name"] = t.get("company_name") or "(unknown)"
        d["tenant_plan"] = t.get("plan") or "trial"
    return domains


@router.post("/admin/{did}/revoke")
async def admin_revoke_domain(did: str, payload: RevokeIn, current=Depends(get_current_user)):
    _require_super(current)
    res = await db.tenant_domains.update_one(
        {"id": did},
        {"$set": {
            "status": "revoked",
            "revoked_at": now().isoformat(),
            "revoke_reason": (payload.reason or "")[:300],
            "revoked_by": current["id"],
        }},
    )
    if not res.matched_count:
        raise HTTPException(404, "Domain not found")
    return {"revoked": True}
