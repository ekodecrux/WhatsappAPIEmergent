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


  - Bulk-translate flows (1 click → 5 languages)
  - Tenant impersonation ("View as tenant X" for super admin)
  - Custom domain mapping for tenant white-labeling
- **P2**:
  - Lead scoring history charts
  - DRY inbound handlers (twilio_inbound + meta_webhook_inbound share ~80%)
  - Background-task email sends instead of inline (snappier UX on ticket replies)
- **P3**:
  - Mobile app shell
  - Public API docs site
