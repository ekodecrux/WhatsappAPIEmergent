# WhatsApp SaaS Marketing Platform — PRD

## Original Problem Statement
Create a complete end-to-end WhatsApp SaaS subscription platform that integrates with any ERP and supports bulk WhatsApp messaging for internal usage. Robust app with professional UI design. Positioned as the "world's first all-in-one WhatsApp marketing & bulk messaging platform with chatbot-based lead generation." Includes a Super Admin God-mode console, in-app support tickets, and an action-capable AI assistant available on every page.

## Architecture
- **Frontend**: React 19 (CRA) + Tailwind 3 + Shadcn UI + Recharts + React Flow
- **Backend**: FastAPI + Motor (MongoDB async)
- **Auth**: JWT (bcrypt) + Email/SMS OTP + role hierarchy (member/admin/superadmin)
- **DB**: MongoDB (multi-tenant via tenant_id; superadmin lives in `platform` tenant)
- **Encryption**: Fernet AES-256 for WhatsApp credentials

## Roles
- `member` / `viewer` — tenant-scoped read/write of own tenant data
- `admin` — tenant admin (can invite users, manage their tenant)
- `superadmin` (NEW) — platform-wide; sees and manages every tenant

## Integrations
- **Twilio WhatsApp** (sandbox + own + opt-in helper UI + Test Send modal)
- **Meta WhatsApp Cloud API** (Graph API send + validate + webhook receiver)
- **Twilio Verify** (SMS OTP)
- **Groq** `llama-3.3-70b-versatile` — AI suggestions, sentiment, scaffolding, multilingual translations, AI assistant
- **Razorpay** — Subscription checkout
- **Gmail SMTP** — welcome emails

## Pages
1. Landing
2. Login / Register / Accept Invite
3. **Overview Dashboard** (KPIs, charts, LIVE auto-refresh)
4. WhatsApp Setup (BYOC sandbox/own/Meta + opt-in helper + Test Send)
5. Campaigns (CSV upload, pause/resume)
6. Leads / CRM
7. Live Chat
8. Auto-replies
9. Chatbot Flows (visual builder + AI scaffold + QR + analytics + multilingual + publish-to-marketplace)
10. Marketplace (browse/clone community templates)
11. Templates
12. Analytics
13. Delivery Status (per-message Twilio/Meta status webhook dashboard)
14. **Support** (NEW) — raise & track tickets
15. Subscription
16. ERP & API
17. Team
18. User Guide
19. Settings
20. **Admin Console** (NEW, super-admin only): 5 tabs — Overview · Tenants · Users · Subscriptions · Support Inbox

## Floating Widgets (every authenticated page)
- **AI Assistant** (NEW) — context-aware Groq-powered chat that returns text, action proposals (one-click execute), or auto-creates support tickets

## Key Backend Endpoints
- `/api/auth/{register,login,me}` — login now returns `is_superadmin`
- `/api/otp/{send,verify}`
- `/api/whatsapp/{credentials,send,test-send,simulate-inbound,sandbox-info,templates,webhook/{twilio,twilio/status,meta}}`
- `/api/campaigns`, `/api/leads`, `/api/conversations/...`
- `/api/dashboard/{overview,timeseries,status-breakdown,delivery}`
- `/api/flows/...` + `/api/flows/{id}/{translate,translations}`
- `/api/marketplace/{templates,publish,clone,categories}`
- `/api/integrations/{api-keys,webhooks,erp/...,audit-logs}`
- `/api/team/{invites,members}`
- `/api/billing/{plans,subscription,orders,verify}`
- **`/api/admin/*`** (NEW, superadmin only) — `stats`, `tenants` (list/get/patch), `users`, `subscriptions`, `tickets`
- **`/api/support/tickets`** (NEW) — CRUD + replies, super-admin status PATCH
- **`/api/assistant/chat`** (NEW) — Groq-backed action-capable assistant
- `/api/ws?token=…` — real-time chat

## Test Status
- **Iteration 9 (latest)**: 20/20 backend pass, 100% frontend (Meta HMAC + email-on-reply + marketplace reviews + A/B campaigns + rich media)
- Iteration 8: 25/25 backend (Super Admin + Tickets + AI Assistant)
- Iteration 7: 17/17 backend (Meta validation + sandbox helper)
- Iteration 6: 22/23 (Multilingual + Marketplace + Delivery)
- Iterations 1–5: 34/34 baseline

## Demo Credentials
- **Tenant admin**: `demo@test.com` / `demo1234` (Demo Inc tenant)
- **Super admin**: `superadmin@wabridge.com` / `superadmin123` (auto-seeded; platform tenant)

## Implemented (this session — Apr 2026)
- Meta WhatsApp Cloud API (validation, send, webhook GET/POST)
- Provider-aware unified `send_whatsapp(cred, to, body)` dispatcher
- Twilio Sandbox opt-in helper UI + Test Send modal
- **Super Admin Console** — platform stats, tenant management (plan/extend trial/suspend), users, subscriptions, ticket inbox
- **Support Tickets** — manual + AI-auto-created tickets, replies, status workflow
- **AI Assistant** — context-aware floating widget on every page; returns text answers, action proposals (draft flow / draft campaign / send test / navigate / raise ticket), or auto-creates tickets when out of scope
- Hardened: extend_trial_days clamped to 1–90 days and only allowed on trial plans

## Implemented (this session — Apr 2026 part 2)
- **Meta webhook HMAC verification** — `X-Hub-Signature-256` HMAC-SHA256 against `META_APP_SECRET` (set in `.env`). Missing/invalid signatures rejected with 401.
- **Email notifications on ticket replies** — when staff replies → customer emailed; when customer replies → all super admins emailed. Threaded subject + status + priority embedded.
- **Marketplace ratings & reviews** — 1-5 star ratings + comments; one review per user (upsert); `avg_rating` + `rating_count` aggregates; cards display ⭐ + count.
- **A/B campaigns** — variants[] with weights summing ≤100%; deterministic weighted RNG per recipient; per-variant counters + winner badge in results modal.
- **Rich media attachments** — `media_url` + `media_type` (image/document/audio/video) on /send, /conversations/{id}/send, and /campaigns (top-level + per-variant). Provider-aware: Twilio uses `media_url[]`, Meta uses native typed payload with caption. Twilio inbound webhook captures `MediaUrl0`.

## Implemented (this session — Apr 2026 part 3 — P1 ERP Passthrough + P2 Admin Analytics)
- **Real ERP API Passthrough** — wallet-billed external send endpoints with HMAC-signed outbound webhooks:
  - `POST /api/integrations/erp/send-message` — wallet-billed single send (auto-refund on provider failure), persists to chat history, dispatches `message.sent` / `message.failed` webhook
  - `POST /api/integrations/erp/send-bulk` — up to 100 recipients with per-recipient `{{variable}}` substitution
  - `POST /api/integrations/erp/send-template` — saved-template send with variable substitution + media inheritance
  - `GET /api/integrations/erp/messages?phone=&limit=` — fetch conversation history
  - `GET /api/integrations/erp/balance` — wallet balance + billing mode for the tenant
  - `POST /api/integrations/webhooks/{id}/test` — synchronous signed test ping for webhook URLs
  - `GET /api/integrations/webhooks/{id}/deliveries` — delivery activity log (status_code, duration_ms, request/response bodies)
  - HMAC-SHA256 signature header `X-Wabridge-Signature-256` for all outbound webhooks
  - Per-key rate limiting (default 120 req/min) with TTL-indexed bucket counter
  - Twilio + Meta inbound webhook handlers also dispatch `message.received` and `message.status` events
  - Frontend: full revamp of `Integrations.jsx` with 4 tabs (API keys / Webhooks / Activity / Docs), live ping button, deliveries log, in-app docs panel with curl examples
- **Super Admin Analytics** — `/api/admin/analytics/*`:
  - `GET /timeseries?days=N` — daily series of new_tenants / messages / topup revenue / wallet cost
  - `GET /top-tenants?metric=messages|revenue|wallet_balance&limit=N` — leaderboards
  - `GET /funnel` — total/trial/paid/suspended/active_7d/churn metrics + trial→paid % + 7d activation %
  - `GET /message-mix?days=N` — outbound status breakdown (sent/delivered/read/failed/queued)
  - Frontend: new "Analytics" tab in Super Admin Console with daily bar charts, KPI cards, conversion funnel, top tenants leaderboard with metric switching, status mix bars, range buttons (7/30/90d)

## Implemented (this session — Apr 2026 part 4 — Super Admin = Platform Owner)
- **Role separation enforced** — when `is_superadmin=true`:
  - Auto-redirect to `/app/admin` on login
  - Sidebar shows ONLY platform menu (Platform Console / Tenants / Subscriptions / Pricing & Discounts / Support Inbox / Analytics) — tenant features hidden
  - Hard route-guard sends superadmin away from any `/app/{tenant-page}` URL
  - Topbar shows "Platform Owner" purple badge; no wallet pill, no AI assistant widget
- **Tenants Manage modal — full SaaS-owner controls in one place:**
  - **Subscription**: assign plan (trial/basic/pro/enterprise) without payment; extend trial; suspend/activate
  - **Wallet & discount**: switch billing mode (BYOC ↔ wallet); see balance; manual credit/debit ± with reason; set top-up bonus % (e.g. 10% → tenant pays ₹1000, wallet credited ₹1100)
  - **Per-message pricing override**: set custom Marketing/Utility/Auth/Service rates per tenant (defaults ₹0.85/₹0.115/₹0.115/₹0)
  - **Internal notes** field
- **New "Pricing & Discounts" tab** — platform-wide view: top-up revenue, wallet COGS, approx margin, # tenants on discount, # on custom pricing; per-tenant table with discount badges
- **Backend**: `PATCH /admin/tenants/{tid}` now accepts `discount_pct` (0-100, validated) + `billing_mode` (wallet/byoc); `/wallet/topup/verify` applies tenant's `discount_pct` as bonus credit on every Razorpay top-up

## Implemented (this session — Apr 2026 part 5 — Quick-Win Sprint)
**5 world-class features + sidebar IA collapse, ~1 pass:**
- **(1) CTWA attribution** — Meta inbound webhook now captures `referral` payload (source_url, headline, ad source_id) and tags conversation with `source='ctwa'`. Chat header shows purple "from ad" badge; right sidebar shows CTWA attribution panel.
- **(2) Quick replies** — full CRUD (`/api/quick-replies`) + slash-trigger popover in Live Chat — type `/` to filter saved snippets, click to insert. Per-snippet use_count tracking. Manage modal in chat header.
- **(4) Cart recovery automation** — `POST /api/integrations/erp/abandon-cart` (E.164 phone + delay 1–10080 min) schedules into `scheduled_messages`; new background scheduler (30s tick) wallet-bills, persists to chat history, dispatches `message.sent`/`message.failed` webhook, with auto-refund on failure.
- **(6) Tenant impersonation** — `POST /api/admin/tenants/{tid}/impersonate` issues short-lived JWT for first admin of target tenant; "View as" button on tenant rows; sticky amber banner reads "Viewing as X at Y · impersonated by superadmin@…"; "Return to platform" restores super-admin session.
- **(7) Green Tick application helper** — emerald wizard on Channels page with 6 progressive steps (Business Manager verify → display name → profile → 100+ inbound → apply → wait), checklist persists to localStorage, includes copy-paste press-release template for the 3-article requirement.
- **Sidebar IA collapse** — 18 flat items → 5 grouped sections (Engage / Customers / Insights / Build / Account) with tightened labels (Dashboard, Inbox, Channels, Developer, Chatbots). Super-admin sidebar unchanged (6 platform items).
- **PostHog runtime crash fixed** — disabled buggy `capture_dead_clicks` autocapture in `index.html`.
- **Testing**: 15/15 backend pytest PASS (incl. live 90s scheduler poll). Frontend zero console/page errors verified.


## Implemented (this session — May 2026 part 6 — Catalog & AI Sprint)
**Final batch — all wired & tested (iter-13 100% pass):**
- **(1) WhatsApp Catalog page** (`/app/catalog`) — full CRUD for products + 1-click Razorpay pay-link generator that copies a wa.me-pasteable WhatsApp message to clipboard.
- **(2) Catalog & Checkout flow nodes** — new `Show products` (catalog) and `Collect payment` (checkout) nodes in the Visual Flow Builder.
- **(3) AI Spam-score widget** — debounced inline check on the Campaigns composer (heuristic + Groq LLM blend).
- **(4) Optimal-send-time hint** — Mongo aggregation over inbound replies of last 60 days returns best hour + day.
- **(5) AI Reply Coach (ghost-text autocomplete)** — Tab-acceptable continuation in chat input.
- **(6) Sandbox mode** — 1-click toggle on Settings: seeds 50 conversations, 200 leads, 5 campaigns.
- **(7) Annual billing toggle** — Subscription page Monthly/Annual switcher.

## Implemented (this session — May 2026 part 9 — UX Wizard + LLM Failover)
**Closes 2 user-reported pain points (iter-16: backend 100% pass, frontend Steps 1-2 + open-wizard 100% pass):**
- **Hybrid LLM failover (Groq → Gemini Flash)** — when Groq returns 429 / quota / rate-limit, every AI surface (spam-score, reply-coach, ai_suggest_reply, ai_analyze_sentiment, flow scaffolder, translator) transparently falls back to Gemini 2.5 Flash via `emergentintegrations` + `EMERGENT_LLM_KEY`. Zero downtime, structured `llm.failover` log line for observability. Non-rate-limit Groq errors are now logged at WARN level so real bugs aren't masked.
- **Twilio Setup Wizard** (`/app/connect-whatsapp`) — single full-screen 4-step wizard replacing the multi-modal Setup → Test Send → Diagnose → Sandbox Info navigation. Step 1: pick Sandbox / Production. Step 2: paste credentials with inline sandbox-keyword instructions. Step 3: send test → on failure, **automatically runs `/whatsapp/twilio/diagnose`** and renders account_status + sender list + suggested action inline. Step 4: success state with one-click links to Campaigns / Flows. Onboarding checklist now points the "Connect WhatsApp" step to the new wizard. Legacy `/app/whatsapp` page still works and got a "Use guided wizard" CTA for opt-in.

## Implemented (this session — May 2026 part 8 — Enterprise-Readiness Sprint)
**Closed 5 SOC 2 + RBAC gaps from gap-analysis doc (iter-15: backend 100% pass):**
- **Audit Logging Middleware** (SOC-T1 + SOC-T2) — pure ASGI middleware captures every POST/PATCH/PUT/DELETE on `/api/*`. Writes `{user_id, tenant_id, method, endpoint, query, status, duration_ms, ip, ua, ts}` to immutable `audit_logs` collection with **365-day TTL**. Skips high-volume polling endpoints (`ai-assist/*`, `assistant/chat`, `ws`, `branding/public`, `health`).
- **RBAC v1 — 6 predefined roles** (RBAC-F1/F3/T1/T2) — Owner, Admin, Support Agent, Marketing Manager, Billing Manager, Viewer. Central `rbac.py` with full **permission matrix** (30+ actions) + `require_permission(action)` FastAPI dependency. First-registered user is auto-promoted to **owner**; only owners can change roles; cannot demote last owner. Legacy `admin`/`member` auto-map.
- **MFA (TOTP)** (RBAC-F7) — pyotp + QR-code enrollment + 8 one-time backup codes (SHA-256 hashed). Login flow: password → `{mfa_required, challenge_token}` → `/api/mfa/challenge {code}` → access_token. Backup codes **one-time use** (invalidated after redemption). 2-minute challenge TTL.
- **Auto-revoke inactive users** (SOC-F1) — hourly scheduler sweeps users idle >90 days → `is_active=false`. Warning emails auto-dispatched at 60/75/89 days.
- **Data retention auto-purge** (SOC-F6) — tenants with `deleted_at` older than `retention_days` (default 90) are hard-purged across 20+ collections.
- **Web-scrape lead discovery** (bonus — merchants without contact lists) — `POST /api/leads/scrape-url` fetches a public page, extracts E.164 phone numbers + emails with duplicate detection vs existing CRM. UI on `/app/leads` → Import dialog has **2 tabs (CSV / From Web Page)** with compliance banner.
- **Frontend**: New `/app/security` page (3 tabs: MFA · Audit Trail · Inactive Users); MFA challenge UI in `AuthForm`; Team page shows 6-role labels with owner-only dropdown for role changes.
- **Bug fixes from iter-15**: `DisableIn.code` + `ChallengeIn.code` max_length raised to 12 (accept 9-char backup codes `XXXX-XXXX`); team invite role validation pre-normalize to reject bogus values.

## Implemented (this session — May 2026 part 7 — Custom Domain & White-Label)
**Tenant white-labeling shipped (iter-14: backend 12/12 PASS, frontend 100%):**
- **Branding overrides** — per-tenant logo, brand name, primary color, favicon, login hero text, full custom CSS injection. Endpoints: `GET/PATCH /api/branding`. Hex-color validation enforced.
- **Custom domain mapping** — tenants can add `chat.acme.com`-style hostnames at `/app/branding`. Backend issues a TXT verification token; UI shows TXT + CNAME instructions inline. Verification uses `dnspython` to lookup `_wabridge.<hostname>` TXT records. Endpoints: `POST /api/branding/domains`, `POST /api/branding/domains/{id}/verify`, `DELETE /api/branding/domains/{id}`.
- **Public hostname lookup** — unauthenticated `GET /api/branding/public?host=...` returns tenant branding for a verified domain. Used by frontend `BrandingContext` to white-label by hostname (skips on emergentagent.com preview hosts).
- **Frontend BrandingContext** — fetches branding on app boot when on a custom domain, applies `document.title`, favicon, `--brand-primary` CSS var, and injects custom CSS via a singleton `<style id="tenant-custom-css">` tag. Login page + AppShell sidebar both render the tenant logo when present.
- **Super Admin oversight** — new "Custom Domains" tab in `/app/admin` shows all tenant domains across the platform with status/plan/added-date filters; one-click revoke with reason persisted.
- **Bug fix** — `lstrip('https://')` was wrongly stripping leading character SET; replaced with `removeprefix` (Python 3.9+) at both add-domain + public-lookup callsites.
- **Indexes** — new compound indexes `tenant_domains(hostname,status)` and `tenant_domains(tenant_id,created_at)` for sub-millisecond public lookups at scale.
**Final batch — all wired & tested (iter-13 100% pass):**
- **(1) WhatsApp Catalog page** (`/app/catalog`) — full CRUD for products + 1-click Razorpay pay-link generator that copies a wa.me-pasteable WhatsApp message to clipboard. Backend: `/api/catalog/products`, `/api/catalog/checkout`, `/api/catalog/checkouts`.
- **(2) Catalog & Checkout flow nodes** — new `Show products` (catalog) and `Collect payment` (checkout) nodes in the Visual Flow Builder. Server-side flow-engine handlers send a formatted product list / generate a Razorpay pay-link inline during a chatbot conversation.
- **(3) AI Spam-score widget** — debounced inline check on the Campaigns composer; heuristic + Groq LLM blend returns 0–100 score, label (good/warning/danger), issues[], and a 1-click rewrite. Endpoint: `POST /api/ai-assist/spam-score`.
- **(4) Optimal-send-time hint** — Mongo aggregation over inbound replies of last 60 days returns best hour + day with confidence label. Endpoint: `GET /api/ai-assist/optimal-send-time`.
- **(5) AI Reply Coach (ghost-text autocomplete)** — type 3+ chars in chat input → debounced `POST /api/ai-assist/reply-coach` returns a Tab-acceptable continuation; gracefully pads a leading space when needed.
- **(6) Sandbox mode** — 1-click toggle on Settings: seeds 50 conversations, 200 leads, 5 campaigns tagged `sandbox=true`; disable cleans up. Endpoints: `/api/sandbox/{enable,disable,status}`.
- **(7) Annual billing toggle** — Subscription page now has Monthly/Annual switcher; backend accepts `billing_cycle=annual` in `/api/billing/orders` and applies pre-set `annual_inr` discount price.
- **Tests**: Iteration 13 — backend 8/8 pytest pass + frontend 7/7 wired flows verified end-to-end.
