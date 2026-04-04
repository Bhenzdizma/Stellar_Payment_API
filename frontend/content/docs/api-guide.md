# Subscription API Guide

This is **Path 01** for teams that want the traditional SaaS flow:

- create a merchant account
- use `x-api-key` for authenticated API calls
- manage webhooks, settings, and dashboard operations

If you want pay-per-request without merchant registration for create calls, use **Path 02** in `/docs/x402-agentic-payments`.

---

## What to prepare

Before integrating, ensure you have:

- `API_BASE_URL` (for local: `http://localhost:4000`)
- merchant credentials from `POST /api/register-merchant`
- secure backend environment variables:
  - `PLUTO_API_KEY`
  - `PLUTO_WEBHOOK_SECRET`
- a Stellar recipient address for payment intents

Important:
- Keep API keys on your backend only.
- Your frontend should call your own backend, not PLUTO directly with secret credentials.

---

## Step-by-step implementation

## 1. Register merchant

```http
POST /api/register-merchant
```

```bash
curl -X POST http://localhost:4000/api/register-merchant \
  -H "Content-Type: application/json" \
  -d '{
    "email": "merchant@example.com",
    "business_name": "PLUTO Shop",
    "notification_email": "ops@example.com"
  }'
```

Save these fields:

- `merchant.id`
- `merchant.api_key`
- `merchant.webhook_secret`

## 2. Create payment link (server-side)

```http
POST /api/create-payment
```

Headers:

```text
x-api-key: sk_...
Content-Type: application/json
Idempotency-Key: <uuid-optional-but-recommended>
```

```bash
curl -X POST http://localhost:4000/api/create-payment \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk_your_api_key" \
  -H "Idempotency-Key: 3f0d65e1-27b8-4b28-8f2f-8a6f9fd9d7d9" \
  -d '{
    "amount": 25,
    "asset": "USDC",
    "asset_issuer": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "recipient": "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
    "description": "Order #2048",
    "webhook_url": "https://merchant.example/webhooks/pluto"
  }'
```

Typical response:

```json
{
  "payment_id": "6aa64d44-faf1-41f0-a7e7-c8f9cce62f2f",
  "payment_link": "http://localhost:3000/pay/6aa64d44-faf1-41f0-a7e7-c8f9cce62f2f",
  "status": "pending"
}
```

## 3. Redirect user to `payment_link`

Use the returned checkout URL in your frontend.

## 4. Track status

Use public status polling:

```http
GET /api/payment-status/:id
```

And/or merchant verification call:

```http
POST /api/verify-payment/:id
```

## 5. Process webhooks

Use your webhook endpoint and verify signatures using `PLUTO_WEBHOOK_SECRET`.

For verification details see `/docs/hmac-signatures`.

---

## Frontend framework integration samples

These samples follow the recommended architecture:

`Frontend -> Your backend -> PLUTO API`

### Next.js (App Router)

`app/api/checkout/route.ts`

```ts
import { NextResponse } from "next/server";

const API_URL = process.env.PLUTO_API_URL || "http://localhost:4000";

export async function POST(req: Request) {
  const body = await req.json();

  const response = await fetch(`${API_URL}/api/create-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.PLUTO_API_KEY!,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount: body.amount,
      asset: "USDC",
      recipient: process.env.MERCHANT_STELLAR_RECIPIENT,
      metadata: { order_id: body.orderId },
    }),
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
```

### React (Vite) + Express backend

`server/routes/checkout.js`

```js
import express from "express";

const router = express.Router();
const API_URL = process.env.PLUTO_API_URL || "http://localhost:4000";

router.post("/checkout", async (req, res) => {
  const r = await fetch(`${API_URL}/api/create-payment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.PLUTO_API_KEY,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount: req.body.amount,
      asset: "USDC",
      recipient: process.env.MERCHANT_STELLAR_RECIPIENT,
      metadata: { cart_id: req.body.cartId },
    }),
  });

  const data = await r.json();
  res.status(r.status).json(data);
});

export default router;
```

### Vue/Nuxt 3 server route

`server/api/checkout.post.ts`

```ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const config = useRuntimeConfig();

  const response = await $fetch.raw(`${config.public.plutoApiUrl}/api/create-payment`, {
    method: "POST",
    headers: {
      "x-api-key": config.plutoApiKey,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: {
      amount: body.amount,
      asset: "USDC",
      recipient: config.merchantRecipient,
      metadata: { order_id: body.orderId },
    },
  });

  return response._data;
});
```

---

## Common mistakes to avoid

- Sending `x-api-key` from browser code.
- Reusing one idempotency key across different orders.
- Forgetting to store `payment_id` with your internal order ID.
- Not validating webhook signatures.

---

## Related guides

- `/docs/x402-agentic-payments` for Path 02 (pay-per-request)
- `/docs/hmac-signatures` for webhook verification
