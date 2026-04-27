# WhatsApp SaaS Marketing Platform — PRD

## Original Problem Statement
Create a complete end-to-end WhatsApp SaaS subscription platform that integrates with any ERP and supports bulk WhatsApp messaging for internal usage. Robust app with professional UI design. Positioned as the "world's first all-in-one WhatsApp marketing & bulk messaging platform with chatbot-based lead generation."

## Architecture
- **Frontend**: React 19 (CRA) + Tailwind 3 + Shadcn UI primitives + Recharts + React Flow
- **Backend**: FastAPI + Motor (MongoDB async)
- **Auth**: JWT (bcrypt password hashing) + Email/SMS OTP
- **DB**: MongoDB (multi-tenant via tenant_id scoping on all collections)
- **Encryption**: Fernet AES-256 for WhatsApp credentials

## Integrations
- **Twilio WhatsApp** (sandbox + own-account + Meta Cloud) — bulk send, inbound webhook, status callbacks
- **Twilio Verify** — SMS OTP
- **Groq** — `llama-3.3-70b-versatile` for AI reply suggestions, sentiment, lead scoring, flow scaffolding, **multilingual flow translations & language detection**
- **Razorpay** — Test-mode subscription upgrade checkout + signature verify
- **Gmail SMTP** — welcome emails on registration

## Pages
1. Landing
2. Login / Register / Accept Invite
3. Dashboard (KPIs, line chart, donut, plan usage, LIVE auto-refresh 7s)
4. WhatsApp Setup (BYOC + sandbox simulator)
5. Campaigns (CSV upload, pause/resume)
6. Leads / CRM
7. Live Chat (3-pane WhatsApp-style + AI co-pilot)
8. Auto-replies
9. Chatbot Flows (drag-and-drop visual builder, AI scaffold, QR codes, analytics, **multilingual translations**, **publish-to-marketplace**)
10. **Marketplace** (browse/search/clone community templates)
11. Templates (WhatsApp message templates)
12. Analytics
13. **Delivery Status** (per-message Twilio status webhook dashboard with trend chart, status counts, per-campaign breakdown, recent failures)
14. Subscription (Razorpay)
15. ERP & API (keys, webhooks, audit log)
16. Team (invites + roles)
17. User Guide

## Key Backend Endpoints
- `/api/auth/{register,login,me}`
- `/api/otp/{send,verify}`
- `/api/whatsapp/{credentials,send,templates,webhook/twilio,webhook/twilio/status,simulate-inbound}`
- `/api/campaigns` (CRUD + approve/pause/resume)
- `/api/leads` (CRUD + CSV import)
- `/api/conversations`, `/api/conversations/{id}/{messages,send,ai-suggestion}`
- `/api/auto-reply-rules`
- `/api/billing/{plans,subscription,orders,verify}`
- `/api/integrations/{api-keys,webhooks,erp/send-message,erp/leads,audit-logs}`
- `/api/dashboard/{overview,timeseries,status-breakdown,delivery}` ← **delivery NEW**
- `/api/team/{invites,members}`
- `/api/flows` (CRUD + publish/unpublish/test/analytics/qr/ai-scaffold)
- **`/api/flows/_languages`** — list 23 supported translation languages
- **`/api/flows/{fid}/translate`** — translate flow strings via Groq
- **`/api/flows/{fid}/translations`** — list / GET / PUT-upsert / DELETE
- **`/api/marketplace/templates`** — browse community flows (search/category/sort)
- **`/api/marketplace/publish/{fid}`** — publish own flow
- **`/api/marketplace/templates/{tpl_id}/clone`** — clone a community flow
- **`/api/marketplace/categories`** — distinct categories
- `/api/ws?token=…` — real-time chat WebSocket

## Test Status (latest: iter 6)
- Backend: **22/23 pass** + 1 skipped (Groq 429 rate-limit during multi-translate suite — verified working via standalone curl)
- Frontend: 100% — Marketplace, Delivery Status, Translations modal, Publish modal all render & function
- Earlier iterations 1–5: 34/34 backend pass, frontend smoke verified

## Demo Credentials
- `demo@test.com` / `demo1234` — admin of "Demo Inc" tenant (pre-seeded)

## Implemented (chronological)
- 2026-Q1: MVP shell, auth, Twilio sandbox, Razorpay, WebSocket chat, Groq AI suggestions, Team invites, OTP auth, CSV upload, campaign resume, React Flow visual builder with Condition/API nodes, flow analytics, QR generation, AI flow scaffolding, User Guide
- 2026-Feb: Marketing copy repositioning (all-in-one WhatsApp marketing platform)
- **2026-Feb (this session)**:
  - **Multilingual flows** (P1) — auto-translate to 22 target languages via Groq, language detection on inbound, runtime localization in flow_engine, multilingual choice-edge matching
  - **Template Marketplace** (P2) — publish/browse/clone community flows, downloads counter, search & sort
  - **Delivery Status Dashboard** — totals, status breakdown, daily trend chart, per-campaign delivery rate, recent failures table

## Backlog
- **P1**:
  - Twilio Verify SMS OTP UI integration polish
  - Rich media messages (image/document/audio attachments in chat & campaigns)
  - Bulk translation (translate to multiple langs in one click)
  - Marketplace publish-rate-limit / dedupe (prevent same flow being republished)
- **P2**:
  - A/B test campaign messages
  - Lead scoring history charts
  - WebSocket-based marketplace updates (live "new template" feed)
  - Marketplace template ratings & reviews
  - Replace native `<select>` with shadcn Select for visual consistency
- **P3**:
  - Mobile app shell
  - Public API docs site (Redoc/Swagger themed)
