"""Role-Based Access Control (RBAC) — predefined roles + permission matrix + middleware.

Six predefined roles (RBAC-F1):
  - owner:            full access incl. billing, wallet, destructive ops
  - admin:            full tenant ops minus billing/wallet destructive
  - support_agent:    live inbox, quick-replies, campaigns read-only
  - marketing_manager: campaigns, flows, templates, catalog
  - billing_manager:  wallet, billing, subscription — no message ops
  - viewer:           read-only across the tenant

Back-compat migration:
  - legacy "admin"   → "admin"
  - legacy "member"  → "viewer"
  - legacy "viewer"  → "viewer"
  - first user of a tenant is auto-promoted to "owner" at login time
"""
from __future__ import annotations

from fastapi import Depends, HTTPException

from helpers import get_current_user


# Six predefined roles
ROLES = ["owner", "admin", "support_agent", "marketing_manager", "billing_manager", "viewer"]

# Permission matrix — lowest allowed role per action.
# Any higher role inherits what lower roles have where it makes sense.
PERMISSIONS: dict[str, set[str]] = {
    # ---- Destructive / owner-only ----
    "workspace.delete":           {"owner"},
    "workspace.transfer":         {"owner"},

    # ---- Billing & wallet ----
    "billing.manage":             {"owner", "billing_manager"},
    "billing.view":               {"owner", "admin", "billing_manager", "viewer"},
    "wallet.topup":               {"owner", "billing_manager", "admin"},
    "wallet.debit_manual":        {"owner", "billing_manager"},
    "wallet.view":                {"owner", "admin", "billing_manager", "marketing_manager", "support_agent", "viewer"},

    # ---- Users & roles ----
    "users.invite":               {"owner", "admin"},
    "users.remove":               {"owner", "admin"},
    "users.change_role":          {"owner"},
    "users.view":                 {"owner", "admin", "billing_manager", "marketing_manager", "support_agent", "viewer"},

    # ---- Campaigns & flows & templates ----
    "campaigns.create":           {"owner", "admin", "marketing_manager"},
    "campaigns.send":             {"owner", "admin", "marketing_manager"},
    "campaigns.pause":            {"owner", "admin", "marketing_manager"},
    "campaigns.view":             {"owner", "admin", "marketing_manager", "support_agent", "viewer"},
    "flows.create":               {"owner", "admin", "marketing_manager"},
    "flows.publish":              {"owner", "admin", "marketing_manager"},
    "flows.view":                 {"owner", "admin", "marketing_manager", "support_agent", "viewer"},
    "templates.manage":           {"owner", "admin", "marketing_manager"},
    "catalog.manage":             {"owner", "admin", "marketing_manager"},

    # ---- Live chat / inbox ----
    "chat.reply":                 {"owner", "admin", "support_agent", "marketing_manager"},
    "chat.view":                  {"owner", "admin", "support_agent", "marketing_manager", "viewer"},
    "quick_replies.manage":       {"owner", "admin", "support_agent", "marketing_manager"},
    "leads.manage":               {"owner", "admin", "support_agent", "marketing_manager"},
    "leads.view":                 {"owner", "admin", "support_agent", "marketing_manager", "viewer"},

    # ---- Integrations / credentials ----
    "channels.manage":            {"owner", "admin"},
    "channels.view":               {"owner", "admin", "marketing_manager", "support_agent", "viewer"},
    "integrations.manage":        {"owner", "admin"},
    "webhooks.manage":            {"owner", "admin"},
    "api_keys.manage":            {"owner", "admin"},

    # ---- Branding / custom domains ----
    "branding.manage":            {"owner", "admin"},
    "branding.view":              {"owner", "admin", "marketing_manager", "billing_manager", "support_agent", "viewer"},

    # ---- Audit / security ----
    "audit_log.view":             {"owner", "admin"},
    "security.manage":            {"owner"},

    # ---- Analytics ----
    "analytics.view":             {"owner", "admin", "marketing_manager", "billing_manager", "viewer"},

    # ---- Sandbox / dev ----
    "sandbox.toggle":             {"owner", "admin"},
    "support.ticket.create":      {"owner", "admin", "support_agent", "marketing_manager", "billing_manager", "viewer"},
}


def normalize_role(role: str | None) -> str:
    """Map legacy + unknown role strings to the 6-role set."""
    if not role:
        return "viewer"
    r = role.lower().strip()
    if r == "member":
        return "viewer"
    if r in ROLES:
        return r
    # Unknown → safest default
    return "viewer"


def has_permission(user: dict, action: str) -> bool:
    """Check if the user's effective role grants the action.

    Super-admins (platform owner) bypass tenant RBAC — they're role-guarded elsewhere.
    """
    if user.get("is_superadmin"):
        return True
    # Explicit overrides (RBAC-T2 permissions_overrides)
    overrides = user.get("permissions_overrides") or []
    if f"deny:{action}" in overrides:
        return False
    if f"allow:{action}" in overrides:
        return True
    role = normalize_role(user.get("role"))
    allowed = PERMISSIONS.get(action, set())
    return role in allowed


def require_permission(action: str):
    """FastAPI dependency factory. Usage: `Depends(require_permission('campaigns.send'))`"""
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if not has_permission(user, action):
            raise HTTPException(status_code=403, detail=f"Permission denied: {action} requires a higher role")
        return user
    return _dep


def list_user_permissions(user: dict) -> list[str]:
    """Return every action the user can perform (used by frontend to hide disabled buttons)."""
    if user.get("is_superadmin"):
        return list(PERMISSIONS.keys())
    role = normalize_role(user.get("role"))
    overrides = user.get("permissions_overrides") or []
    denied = {o.split(":", 1)[1] for o in overrides if o.startswith("deny:")}
    extra = {o.split(":", 1)[1] for o in overrides if o.startswith("allow:")}
    base = {action for action, roles in PERMISSIONS.items() if role in roles}
    return sorted((base | extra) - denied)
