/**
 * PLUTO x402 Official Demo Agent
 *
 * Uses the official @x402/fetch + @x402/stellar SDK.
 * Demonstrates the full x402 Soroban auth flow on Stellar testnet.
 *
 * Prerequisites:
 *   - AGENT_SECRET in .env (your funded Freighter testnet wallet secret key)
 *   - X402_PROVIDER_PUBLIC_KEY in .env
 *   - Backend running: npm run dev
 *
 * Run: node scripts/demoAgent.js
 */

import "dotenv/config";
import { Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { wrapFetchWithPayment } from "@x402/fetch";
import { createEd25519Signer, getNetworkPassphrase } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

const API_BASE = `http://localhost:${process.env.PORT || 4000}`;
const NETWORK = process.env.STELLAR_NETWORK === "public" ? "stellar:pubnet" : "stellar:testnet";
const RPC_URL = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";

const C = {
  reset: "\x1b[0m", cyan: "\x1b[36m", green: "\x1b[32m",
  yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
  bold: "\x1b[1m", dim: "\x1b[2m",
};

const log  = (s, m) => console.log(`${C.cyan}[AGENT]${C.reset} ${C.yellow}[${s}]${C.reset} ${m}`);
const ok   = (m)    => console.log(`${C.green}[AGENT] ✓${C.reset} ${m}`);
const info = (m)    => console.log(`${C.dim}[AGENT]   ${m}${C.reset}`);
const die  = (m, e) => { console.error(`${C.red}[AGENT] ✗ ${m}${C.reset}`, e?.message || ""); process.exit(1); };

async function main() {
  console.log(`\n${C.bold}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║  PLUTO x402 Official Demo · @x402/stellar SDK        ║${C.reset}`);
  console.log(`${C.bold}╚══════════════════════════════════════════════════════╝${C.reset}\n`);

  // ── Checks ──────────────────────────────────────────────────────────────────
  try {
    const h = await fetch(`${API_BASE}/health`);
    if (!h.ok) throw new Error();
    ok(`PLUTO server running at ${API_BASE}`);
  } catch { die(`Cannot reach PLUTO at ${API_BASE} — run: npm run dev`); }

  if (!process.env.AGENT_SECRET) die("AGENT_SECRET not set in .env");
  if (!process.env.X402_PROVIDER_PUBLIC_KEY) die("X402_PROVIDER_PUBLIC_KEY not set in .env");

  // ── Setup x402 client ────────────────────────────────────────────────────────
  log("SETUP", "Initialising x402 client with Stellar signer...");

  const signer = createEd25519Signer(process.env.AGENT_SECRET, NETWORK);
  info(`Agent address : ${C.magenta}${signer.address}${C.reset}`);
  info(`Network       : ${C.yellow}${NETWORK}${C.reset}`);
  info(`Soroban RPC   : ${RPC_URL}`);
  info(`Facilitator   : ${process.env.X402_FACILITATOR_URL || "https://www.x402.org/facilitator"}`);

  // wrapFetchWithPayment wraps the global fetch to automatically handle 402 responses.
  // When a 402 is received it:
  //   1. Reads the payment requirements from the response headers
  //   2. Signs a Soroban authorization entry with your Stellar keypair
  //   3. Sends the signed auth entry in the X-PAYMENT header
  //   4. The facilitator (x402.org) settles the USDC transfer on-chain
  //   5. Retries the original request — you get the 200 response
  const fetchWithPayment = wrapFetchWithPayment(fetch, signer, {
    network: NETWORK,
    rpcUrl: RPC_URL,
  });

  ok("x402 client ready — fetch is now payment-aware");
  console.log();

  // ── Demo 1: Hit /api/demo/protected ─────────────────────────────────────────
  console.log(`${C.bold}━━━ Demo 1: Protected endpoint ($0.10 USDC) ━━━${C.reset}\n`);
  log("1/2", `GET ${API_BASE}/api/demo/protected`);
  info("First attempt will get 402, client pays automatically, retries...");

  try {
    const res = await fetchWithPayment(`${API_BASE}/api/demo/protected`);

    if (res.ok) {
      const data = await res.json();
      ok("Protected data received:");
      console.log(JSON.stringify(data, null, 2));
    } else {
      const err = await res.text();
      info(`Response ${res.status}: ${err}`);
    }
  } catch (err) {
    console.error(`${C.red}[AGENT] Demo 1 failed:${C.reset}`, err.message);
    info("This may fail if your wallet doesn't have a Soroban USDC trustline.");
    info("See: https://developers.stellar.org/docs/build/agentic-payments/x402/quickstart-guide");
  }

  console.log();

  // ── Demo 2: POST /api/create-payment ────────────────────────────────────────
  console.log(`${C.bold}━━━ Demo 2: Create payment link ($0.01 USDC) ━━━${C.reset}\n`);
  log("2/2", `POST ${API_BASE}/api/create-payment`);
  info("No merchant account needed — x402 payment IS the auth");

  try {
    const res = await fetchWithPayment(`${API_BASE}/api/create-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 10,
        asset: "USDC",
        recipient: process.env.X402_PROVIDER_PUBLIC_KEY,
        description: "Agent-created payment link via official x402",
      }),
    });

    if (res.status === 201 || res.status === 200) {
      const data = await res.json();
      ok("Payment link created by agent (no merchant account!):");
      console.log(`  ${C.magenta}${data.payment_link}${C.reset}`);
      console.log(`  Payment ID: ${C.yellow}${data.payment_id}${C.reset}`);
    } else {
      const err = await res.text();
      info(`Response ${res.status}: ${err}`);
    }
  } catch (err) {
    console.error(`${C.red}[AGENT] Demo 2 failed:${C.reset}`, err.message);
  }

  console.log(`\n${C.green}${C.bold}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.green}${C.bold}║              AGENT MISSION COMPLETE ✓                ║${C.reset}`);
  console.log(`${C.green}${C.bold}╚══════════════════════════════════════════════════════╝${C.reset}\n`);

  console.log(`${C.bold}Official x402 flow:${C.reset}`);
  console.log(`  GET /protected → 402 → Soroban auth signed → Facilitator settles USDC → 200\n`);
  console.log(`${C.bold}What happened on-chain:${C.reset}`);
  console.log(`  Your wallet signed a Soroban authorization entry`);
  console.log(`  The x402 facilitator (x402.org) submitted the USDC transfer`);
  console.log(`  USDC moved: ${C.magenta}${signer.address}${C.reset} → ${C.magenta}${process.env.X402_PROVIDER_PUBLIC_KEY}${C.reset}\n`);
}

main().catch(err => {
  console.error(`${C.red}[AGENT] Fatal:${C.reset}`, err.message);
  process.exit(1);
});
