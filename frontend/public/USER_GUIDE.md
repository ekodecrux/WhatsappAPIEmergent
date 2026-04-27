# wabridge — User Guide

A step-by-step playbook for every workflow on the platform.

> **In a hurry?** Sign up → connect Twilio Sandbox → click the ✈️ on the credential to simulate an inbound message → open Live Chat. Total time: under 60 seconds.

---

## Table of contents

1. [Getting started](#1-getting-started)
2. [Connect WhatsApp](#2-connect-whatsapp)
3. [Add & import leads](#3-add--import-leads)
4. [Bulk campaigns](#4-bulk-campaigns)
5. [Build a WhatsApp chatbot (visual flow builder)](#5-build-a-whatsapp-chatbot)
6. [Deploy a flow as a QR code](#6-deploy-a-flow-as-a-qr-code)
7. [ERP & API integration](#7-erp--api-integration)
8. [Team & roles](#8-team--roles)
9. [Analytics](#9-analytics)
10. [Subscription](#10-subscription)

---

## 1. Getting started

Visit `/register`. Sign up with whichever auth you prefer:

- **Password** — fastest, just email + password
- **Email OTP** — 6-digit code mailed to you (5-min expiry, 5-attempt cap, hashed at rest)
- **SMS OTP** — Twilio Verify sends a code to your phone

Every signup creates a multi-tenant workspace with a **14-day Pro trial**, no card.

Tour the sidebar after sign-in:

| Page | What it does |
|---|---|
| **Overview** | Live KPIs, charts, plan usage |
| **WhatsApp Setup** | Connect Twilio sandbox / your Twilio / Meta Cloud |
| **Campaigns** | Bulk send with approval gate |
| **Leads / CRM** | Capture & qualify customers |
| **Live Chat** | 3-pane WhatsApp-style inbox + AI co-pilot |
| **Auto-replies** | Simple keyword → reply rules |
| **Chatbot Flows** | Visual mind-map bot builder |
| **Templates** | WhatsApp message templates |
| **Analytics** | Volume, funnel, campaign performance |
| **Subscription** | Plans, Razorpay checkout, invoices |
| **ERP & API** | API keys, webhooks, audit log |
| **Team** | Invites & role management |

---

## 2. Connect WhatsApp

### Pick a provider

`WhatsApp Setup → Connect account`:

- **Twilio Sandbox** — instant, no setup, uses our shared `whatsapp:+14155238886`
- **Twilio (own account)** — paste your Account SID + Auth Token + WhatsApp From
- **Meta Cloud API** — paste permanent access token + phone number ID

### Opt-in your phone (sandbox only)

Twilio's shared sandbox needs a one-time opt-in:

1. Open Twilio Console → *Messaging → Try it out → Send a WhatsApp message*
2. Note the join code (e.g. `join silent-jungle`)
3. From your phone, send that text to **+1 415 523 8886** on WhatsApp
4. Twilio replies "✅ connected" — you're now opted-in

> **No phone?** Use the **Sandbox simulator** (✈️ icon next to the credential row) to fake an inbound message and test the entire stack without Twilio at all.

### Production webhook

For real customers to reach you, set the *"WHEN A MESSAGE COMES IN"* webhook in Twilio to:

```
{API_URL}/api/whatsapp/webhook/twilio
```

Method `POST`. The platform's webhook handles incoming messages, fires AI sentiment + suggestion, and triggers any matching chatbot flow or auto-reply rule.

### Security

All Twilio/Meta tokens are **AES-256 encrypted** at rest with a tenant-derived Fernet key. Decryption only happens in-memory at send time. Tokens never appear in logs.

---

## 3. Add & import leads

### Manual entry

`Leads / CRM → Add lead`. Required: `phone` in E.164 (e.g. `+919876543210`). Optional: name, email, company, notes.

### Bulk CSV upload

Click **Import CSV** → upload a `.csv` file or paste raw CSV. Required header: `phone`. Optional: `name`, `email`, `company`. Duplicates are skipped per tenant.

```csv
phone,name,email,company
+919876543210,Aarav Mehta,aarav@acme.in,Acme
+919876543211,Priya Singh,priya@beta.co,Beta Inc
```

### Filter & score

- Inline status dropdown: `new → contacted → qualified → converted / lost`
- Lead score 0-100 auto-updates from inbound sentiment (Groq AI)
- Filter bar at top filters by status

### Push leads from your ERP

```bash
curl -X POST {API_URL}/api/integrations/erp/leads \
  -H "X-API-Key: wsk_••••••••••" \
  -H "Content-Type: application/json" \
  -d '{ "phone":"+919876543210", "name":"Aarav", "company":"Acme" }'
```

---

## 4. Bulk campaigns

### Create

`Campaigns → New campaign`:

1. Pick a WhatsApp connection
2. Write the message body (supports `{{name}}` interpolation in future)
3. Paste recipient phones — one per line, comma- or space-separated
4. Submit → campaign goes into `pending_approval`

### Approve & monitor

Admins click **Approve** → sender starts. Throttled to ~10 messages/sec.

- **Pause** mid-send to halt
- **Resume** later — skips already-sent recipients

### Track

Live progress bar updates every 5s. Each send lands in **Live Chat** as a conversation thread.

> ⚠️ Twilio sandbox can only send to opted-in phones. Use your own Twilio or Meta Cloud for production scale.

---

## 5. Build a WhatsApp chatbot

The flow builder lets you design conversational bots visually — no code.

### Pick a template or start blank

`Chatbot Flows`:

| Template | What it does |
|---|---|
| **Mobile Banking Bot** | auth → menu → balance / transactions / transfer funds |
| **Training Certification** | quiz → completion certificate |
| **Lead Qualifier** | name, company, team-size capture |
| **Support FAQ Bot** | password reset / billing / agent |
| **Blank flow** | start from scratch |

### Visual builder

Drag nodes from the **left palette**. Connect by dragging from a node's right-side handle to another node's left-side handle. Click any node/edge to edit it in the **right inspector**.

#### Node types

| Type | Purpose |
|---|---|
| **Send message** | Push a static or `{{var}}` templated reply |
| **Ask question** | Send a prompt, capture user's reply into `{{var}}` |
| **Choice menu** | Numbered options; route by option text or index |
| **Keyword branch** | Route by inbound text matching keywords on edge labels |
| **Condition** | Compare a variable (e.g. `{{amount}} > 10000`); label edges `true` / `false` |
| **API / Webhook** | POST all captured variables to your ERP URL |
| **End** | Final message + terminate session |

### Triggers

Bottom of the left panel — comma-separated keywords (e.g. `bank, balance, hi`). When inbound text contains any keyword and no flow session is active, this flow starts.

### Variables

In Ask nodes, set a `variable` name (e.g. `name`). Later, in any Send/End node, write `Hi {{name}}!` — the engine substitutes the captured value.

### Test → Publish

1. **Test** button (top toolbar) → fires a synthetic conversation against the flow
2. Open **Live Chat** to watch the bot respond in real time
3. When happy, click **Publish** → bot is live and will trigger on real inbound matches

---

## 6. Deploy a flow as a QR code

Every published flow has a **QR icon** on the Chatbot Flows list.

1. Click the QR icon → modal renders a scannable PNG
2. Click **Download PNG** → save and print

The QR encodes a `wa.me` link pre-filled with your flow's first trigger keyword. When a customer scans the QR with their phone camera:

1. WhatsApp opens
2. Your business number is pre-loaded
3. The trigger keyword is pre-typed
4. They tap Send → your bot greets them automatically

**Use cases**: bank stickers on ATMs, training module QRs that issue quizzes + certificates, product packaging QRs that launch feedback surveys, storefront QRs for menus or appointment booking.

---

## 7. ERP & API integration

### Generate an API key

`ERP & API → Generate key`. The raw key is shown **only once** — copy it immediately. Listings show only the prefix.

### Send WhatsApp from your ERP

```bash
curl -X POST {API_URL}/api/integrations/erp/send-message \
  -H "X-API-Key: wsk_••••••••••" \
  -H "Content-Type: application/json" \
  -d '{
    "to_phone": "+919876543210",
    "message": "Order #INV-1042 confirmed. Track here: ..."
  }'
```

Response:

```json
{ "success": true, "sid": "SM…", "status": "queued" }
```

### Push leads from your ERP

```bash
curl -X POST {API_URL}/api/integrations/erp/leads \
  -H "X-API-Key: wsk_••••••••••" \
  -d '{ "phone":"+919876543210", "name":"Aarav", "company":"Acme" }'
```

### Outbound webhooks

Configure URLs to receive `message.received` and `message.status` events into your ERP.

### Audit log

Every key generation, publish, invite, etc. is timestamped on the same page.

---

## 8. Team & roles

### Roles

- **Admin** — full access, can invite/remove members, change roles
- **Member** — full access except team management
- **Viewer** — read-only

### Invite a teammate

`Team → Invite teammate` → enter email + role. Token is emailed and shown in-app.

### Accept an invite

The invitee opens `/accept-invite?token=…`, sets a password, and joins the same workspace.

### Manage

Admins can change roles, disable, or remove members. You cannot demote or remove yourself.

---

## 9. Analytics

### Channel-wide

`Analytics` page auto-refreshes every 7 seconds:

- Volume area chart (sent vs received)
- Outbound status pie (delivered / read / failed)
- Lead funnel (new → contacted → qualified → converted)
- Lead sources bar chart
- Campaign performance (last 8 campaigns)
- Insights: delivery rate vs benchmark, conversion rate

### Per-flow

Click the chart icon on any flow → modal shows:

- Total sessions, active, completed, completion rate
- Per-node visits with drop-off bars (where users abandon the flow)

### Audit log

Bottom of `ERP & API` page — every action with actor, action, resource, timestamp.

---

## 10. Subscription

### Plans

| Plan | Price | Messages / mo | Leads | Numbers |
|---|---|---|---|---|
| Trial | ₹0 | 100 | 100 | 1 |
| Basic | ₹999 | 5,000 | 1,000 | 1 |
| Pro | ₹2,999 | 50,000 | 10,000 | 3 |
| Enterprise | ₹9,999 | 500,000 | 100,000 | 10 |

### Upgrade

`Subscription → Upgrade to <plan>` opens Razorpay Checkout in **TEST mode**. Use:

- Card: `4111 1111 1111 1111`
- Expiry: any future date (e.g. 12/28)
- CVV: `123`

Successful verification updates your tenant's plan instantly and extends `subscription_end_date` by 30 days.

### Payment history

Same page lists every order with Razorpay order ID, amount, status, timestamp.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Twilio send returns `success: false` | Recipient hasn't opted into the sandbox | Send the join code from your phone (see §2) |
| AI suggestion is `[AI unavailable: …]` | Groq API rate-limited or invalid key | Check `GROQ_API_KEY` in `/app/backend/.env` |
| Email OTP returns `dev_code` | SMTP rate-limit or auth failure | Use the `dev_code` directly to verify, or check Gmail App Password |
| Razorpay checkout doesn't open | Browser blocked the script | Allow `checkout.razorpay.com` |
| Flow doesn't trigger on inbound | Flow status is `draft` | Click **Publish** |
| QR opens WhatsApp but no auto-reply | Trigger keyword doesn't match the flow's triggers | Check the triggers field at the bottom of the flow builder |

---

*Made with discipline. © wabridge.*
