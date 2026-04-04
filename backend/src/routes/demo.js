/**
 * Demo routes — official x402 protocol using @x402/express + @x402/stellar
 *
 * GET /api/demo/protected  — costs $0.10 USDC per request (official x402)
 * GET /api/demo/free       — free, no payment
 * POST /api/demo/agent-pay — browser demo helper (server-side payment)
 */

import express from "express";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import * as StellarSdk from "stellar-sdk";

const router = express.Router();

const PROVIDER = process.env.X402_PROVIDER_PUBLIC_KEY;
const FACILITATOR = process.env.X402_FACILITATOR_URL || "https://www.x402.org/facilitator";
const NETWORK = process.env.STELLAR_NETWORK === "public" ? "stellar:pubnet" : "stellar:testnet";
const HORIZON_URL = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
const USDC_ISSUER = process.env.USDC_ISSUER || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

async function submitManualPayment({ amount, recipient, memo, asset = "USDC", asset_issuer }) {
  const agentSecret = process.env.AGENT_SECRET;
  if (!agentSecret) {
    throw new Error("AGENT_SECRET not configured — add it to backend/.env");
  }

  if (!amount || !recipient || !memo) {
    throw new Error("Missing required fields for manual payment: amount, recipient, memo");
  }

  if (asset !== "USDC") {
    throw new Error("Demo manual payment currently supports USDC only");
  }

  const keypair = StellarSdk.Keypair.fromSecret(agentSecret);
  const server = new StellarSdk.Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(keypair.publicKey());

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase:
      process.env.STELLAR_NETWORK === "public"
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: recipient,
        asset: new StellarSdk.Asset("USDC", asset_issuer || USDC_ISSUER),
        amount: String(amount),
      }),
    )
    .addMemo(StellarSdk.Memo.text(String(memo)))
    .setTimeout(120)
    .build();

  tx.sign(keypair);
  const submitted = await server.submitTransaction(tx);

  return {
    tx_hash: submitted.hash,
    successful: submitted.successful === true,
    amount: String(amount),
    recipient,
    memo: String(memo),
    asset: "USDC",
  };
}

// ── Protected endpoint (official x402) ───────────────────────────────────────
if (PROVIDER) {
  router.get(
    "/demo/protected",
    paymentMiddlewareFromConfig(
      {
        "GET /api/demo/protected": {
          accepts: {
            scheme: "exact",
            price: "$1.00",
            network: NETWORK,
            payTo: PROVIDER,
          },
        },
      },
      new HTTPFacilitatorClient({ url: FACILITATOR }),
      [{ network: NETWORK, server: new ExactStellarScheme() }],
    ),
    (req, res) => {
      res.json({
        secret_data: "you paid for this",
        timestamp: new Date().toISOString(),
        message: "Unlocked via $1.00 USDC micropayment on Stellar (official x402 protocol).",
      });
    },
  );
} else {
  router.get("/demo/protected", (_req, res) =>
    res.status(503).json({ error: "X402_PROVIDER_PUBLIC_KEY not configured" }),
  );
}

// ── Free endpoint ─────────────────────────────────────────────────────────────
router.get("/demo/free", (_req, res) =>
  res.json({ message: "Free endpoint — no payment required.", timestamp: new Date().toISOString() }),
);

/**
 * POST /api/demo/agent-pay
 * Server-side x402 payment for the browser demo.
 * Uses AGENT_SECRET to sign and pay on behalf of the browser.
 */
router.post("/demo/agent-pay", async (req, res, next) => {
  try {
    // Mode A: custom x402 flow used by /store page (returns tx_hash for /verify-x402).
    const { amount, recipient, memo, asset, asset_issuer } = req.body || {};
    if (amount && recipient && memo) {
      const payment = await submitManualPayment({
        amount,
        recipient,
        memo,
        asset,
        asset_issuer,
      });
      return res.json(payment);
    }

    // Mode B: official x402 Soroban demo used by /x402-demo page.
    const agentSecret = process.env.AGENT_SECRET;
    if (!agentSecret) {
      return res.status(503).json({ error: "AGENT_SECRET not configured — add it to .env" });
    }

    const { createEd25519Signer } = await import("@x402/stellar");
    const { ExactStellarScheme } = await import("@x402/stellar/exact/client");
    const { wrapFetchWithPayment } = await import("@x402/fetch");

    const NETWORK = process.env.STELLAR_NETWORK === "public" ? "stellar:pubnet" : "stellar:testnet";
    const RPC_URL = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";

    const signer = createEd25519Signer(agentSecret, NETWORK);
    const fetchWithPayment = wrapFetchWithPayment(fetch, signer, { network: NETWORK, rpcUrl: RPC_URL });

    const targetUrl = `http://localhost:${process.env.PORT || 4000}/api/demo/protected`;
    const response = await fetchWithPayment(targetUrl);
    const data = await response.json();

    res.json({ data, agent_address: signer.address, status: response.status });
  } catch (err) {
    next(err);
  }
});

export default router;
