# WhatsApp SaaS Marketing Platform — PRD

## Original Problem Statement
Create a complete end-to-end WhatsApp SaaS subscription platform that integrates with any ERP and supports bulk WhatsApp messaging for internal usage. Robust app with professional UI design.

## Architecture
- **Frontend**: React 19 (CRA) + Tailwind 3 + Shadcn UI primitives + Recharts
- **Backend**: FastAPI + Motor (MongoDB async)
- **Auth**: JWT (bcrypt password hashing)
- **DB**: MongoDB (multi-tenant via tenant_id scoping on all collections)
- **Encryption**: Fernet AES-256 for WhatsApp credentials

## Integrations (real keys in /app/backend/.env)
- **Twilio WhatsApp** (sandbox + own-account + Meta Cloud) — bulk send, inbound webhook, status callbacks
- **Twilio Verify** — SMS OTP (route stub ready)
- **Groq** — `llama-3.3-70b-versatile` for AI reply suggestions, sentiment, lead scoring
- **Razorpay** — Test-mode subscription upgrade checkout + signature verify
- **Gmail SMTP** — welcome emails on registration

## Pages Implemented
1. Landing (hero, live conversation preview, features, pricing, ERP code sample, footer CTA)
2. Login + Register
3. Dashboard (KPIs, line chart, donut, plan usage, trial banner, LIVE badge auto-refresh 7s)
4. WhatsApp Setup (BYOC: sandbox / own Twilio / Meta Cloud, encrypted save, sandbox simulator)
5. Campaigns (create with recipients list, pending_approval gate, run/pause, real-time progress polling)
6. Leads / CRM (table, filters, status dropdown, CSV import, custom fields)
7. Live Chat (3-pane WhatsApp-style with bubble pattern bg, AI co-pilot panel, sentiment, lead score)
8. Auto-replies (keyword & always triggers, priority, toggle active)
9. Templates (create/list/delete with category)
10. Analytics (volume area chart, pie, lead funnel, source bar chart, campaign performance, insights — auto-refresh 7s)
11. Subscription (plans, current plan card, Razorpay checkout, payment history)
12. ERP & API (API keys with one-time reveal, outbound webhooks, audit log, cURL sample)
13. Settings

## Design
- WhatsApp brand palette: `#075E54` (dark teal primary), `#128C7E` (mid), `#25D366` (light accent)
- Vercel/Linear-inspired Swiss B2B aesthetic with crisp 1px borders and dense data tables
- Outfit display + Inter body + JetBrains Mono
- WhatsApp-pattern background on chat console; soft chat bubble colors (#DCF8C6 / white)

## Key Backend Endpoints
- `/api/auth/{register,login,me}`
- `/api/whatsapp/{credentials,send,templates,webhook/twilio,simulate-inbound}`
- `/api/campaigns` (CRUD + approve/pause)
- `/api/leads` (CRUD + import)
- `/api/conversations`, `/api/conversations/{id}/{messages,send,ai-suggestion}`
- `/api/auto-reply-rules` (CRUD + toggle)
- `/api/billing/{plans,subscription,orders,verify,orders}`
- `/api/integrations/{api-keys,webhooks,erp/send-message,erp/leads,audit-logs}`
- `/api/dashboard/{overview,timeseries,status-breakdown}`

## Test Status
- Backend pytest suite: **34/34 PASS** (`/app/backend/tests/backend_test.py`)
- Frontend smoke: login → all 9 sidebar routes load successfully
- 6 ObjectId-leak 500s found and fixed by testing agent

## Demo Credentials
- `demo@test.com` / `demo1234` (admin, Demo Inc tenant) — pre-seeded

## Backlog (P1)
- Twilio Verify SMS OTP UI flow (backend ready)
- Multi-user team invites / role management
- Resume support after pausing a campaign
- Move Twilio sync send into `run_in_executor` for high-volume scaling
- WebSocket replacement for chat polling
- CSV upload via `<input type=file>` (currently paste-area only)
- Rich media messages (image/document/audio)

