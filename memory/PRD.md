# WhatsApp SaaS Marketing Platform — PRD

## Original Problem Statement
Create a complete end-to-end WhatsApp SaaS subscription platform that integrates with any ERP and supports bulk WhatsApp messaging for internal usage. Robust app with professional UI design. Positioned as the "world's first all-in-one WhatsApp marketing & bulk messaging platform with chatbot-based lead generation."

## Architecture
- **Frontend**: React 19 (CRA) + Tailwind 3 + Shadcn UI + Recharts + React Flow
- **Backend**: FastAPI + Motor (MongoDB async)
- **Auth**: JWT (bcrypt password hashing) + Email/SMS OTP
- **DB**: MongoDB (multi-tenant via tenant_id scoping)
- **Encryption**: Fernet AES-256 for WhatsApp credentials

## Integrations
- **Twilio WhatsApp** — sandbox + own-account, with sandbox opt-in helper UI + Test Send flow
- **Meta WhatsApp Cloud API** — direct Graph API integration, validated before save, full webhook receiver (verify + inbound + statuses)
- **Twilio Verify** — SMS OTP
- **Groq** (`llama-3.3-70b-versatile`) — AI reply suggestions, sentiment, lead scoring, flow scaffolding, multilingual translations & language detection
- **Razorpay** — Subscription checkout
- **Gmail SMTP** — welcome emails

## Pages
1. Landing
2. Login / Register / Accept Invite
3. Dashboard (KPIs, charts, LIVE auto-refresh)
4. **WhatsApp Setup** (BYOC sandbox/own/Meta Cloud + opt-in helper + Test Send modal + simulate)
5. Campaigns (CSV upload, pause/resume)
6. Leads / CRM
7. Live Chat (WhatsApp-style + AI co-pilot + sentiment)
8. Auto-replies
9. Chatbot Flows (visual builder, AI scaffold, QR codes, analytics, multilingual translations, publish-to-marketplace)
10. Marketplace (browse/search/clone community templates)
11. Templates
12. Analytics
13. Delivery Status (per-message Twilio status webhook dashboard)
14. Subscription
15. ERP & API
16. Team
17. User Guide

## Key Backend Endpoints
- `/api/auth/{register,login,me}` and `/api/otp/{send,verify}`
- `/api/whatsapp/credentials` — provider-aware: twilio_sandbox / twilio / meta_cloud (validated on save)
- `/api/whatsapp/{send,test-send,simulate-inbound,sandbox-info,templates}`
- `/api/whatsapp/webhook/twilio` (inbound + status)
- **`/api/whatsapp/webhook/meta`** — GET verify (hub.challenge) + POST inbound/status
- `/api/campaigns` (CRUD, approve/pause/resume) — provider-aware sending
- `/api/conversations`, `/api/conversations/{id}/{messages,send,ai-suggestion}`
- `/api/dashboard/{overview,timeseries,status-breakdown,delivery}`
- `/api/flows/...` — CRUD + AI scaffold + QR + analytics + **multilingual translations** (`_languages`, `/translate`, `/translations`)
- `/api/marketplace/{templates,publish,clone,categories}`
- `/api/integrations/{api-keys,webhooks,erp/send-message,erp/leads,audit-logs}`
- `/api/team/{invites,members}`
- `/api/billing/{plans,subscription,orders,verify}`
- `/api/ws?token=…` — real-time chat WebSocket

## Test Status
- **Iteration 7 (latest)**: 17/17 backend pass, 100% frontend — Meta validation, sandbox helper, Test Send, Meta webhooks
- Iteration 6: 22/23 backend (1 skip Groq 429, verified standalone), 100% frontend — multilingual + marketplace + delivery
- Iterations 1–5: 34/34 backend pass

## Demo Credentials
- `demo@test.com` / `demo1234` — admin of "Demo Inc" tenant (pre-seeded)

## Implemented (chronological)
- 2026-Q1: MVP shell, auth, Twilio sandbox, Razorpay, WebSocket chat, Groq AI, Team invites, OTP, CSV upload, campaign resume, React Flow visual builder, flow analytics, QR generation, AI scaffolding, User Guide
- 2026-Feb: Marketing copy repositioning
- 2026-Feb: **Multilingual flows** (P1) + **Template Marketplace** (P2) + **Delivery Status Dashboard**
- **2026-Apr (this session)**: 
  - **Meta WhatsApp Cloud API integration** — direct Graph API send, validation-before-save, full webhook receiver (GET verify + POST inbound/status)
  - **Provider-aware sending** — unified `send_whatsapp(cred, to, body)` dispatcher across send/campaigns/chat/flow_engine/integrations
  - **Twilio Sandbox opt-in helper UI** — prominent banner with 4-step instructions, console deep-link
  - **Test Send modal** — per-credential real-message test with provider error mapping (sandbox 63007/63015/63016/63018 → "join <keyword>" hint)

## Backlog
- **P0 (security)**:
  - Meta webhook X-Hub-Signature-256 HMAC verification (currently unauthenticated)
- **P1**:
  - Bulk-translate flows (one click → 5 languages)
  - Rich media messages (image/document/audio attachments)
  - DRY inbound handlers (`twilio_inbound` and `meta_webhook_inbound` share ~80% logic)
- **P2**:
  - A/B test campaign messages
  - Marketplace template ratings & reviews
  - Lead scoring history charts
  - Migrate `requests.post` in send_whatsapp_via_meta to `httpx.AsyncClient`
- **P3**:
  - Mobile app shell
  - Public API docs site
