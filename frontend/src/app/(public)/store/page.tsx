"use client";

import { useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const STORE_API_KEY = process.env.NEXT_PUBLIC_STORE_API_KEY || "";

type CreatePaymentResponse = {
  payment_link: string;
  payment_id: string;
};

type X402Challenge = {
  amount: string;
  recipient: string;
  memo: string;
  asset?: string;
  asset_issuer?: string;
};

export default function StorePage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createPayment(token?: string): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { "X-Payment-Token": token } : {}),
    };

    if (STORE_API_KEY.trim()) {
      headers["x-api-key"] = STORE_API_KEY.trim();
    }

    return fetch(`${API_URL}/api/create-payment`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: "5",
        asset: "USDC",
        asset_issuer: process.env.NEXT_PUBLIC_USDC_ISSUER || "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
        recipient: process.env.NEXT_PUBLIC_STORE_RECIPIENT || "GDTVZPCLO7YHRF3JQV6TQI6XW3DIIMFWWQWI25WWLOUZM5AOCZTE5RA3",
        metadata: {
          item: "PLUTO Demo Tee",
          source: "store-page",
        },
      }),
    });
  }

  async function handlePayWithCrypto() {
    setLoading(true);
    setError(null);
    setStatus("Creating payment link...");

    try {
      const firstRes = await createPayment();
      const firstBody = await firstRes.json().catch(() => ({}));

      if (firstRes.ok) {
        const created = firstBody as CreatePaymentResponse;
        setStatus("Payment link created. Redirecting to checkout...");
        window.location.href = created.payment_link;
        return;
      }

      if (firstRes.status !== 402) {
        if (firstRes.status === 401) {
          throw new Error(
            "Server returned 401 instead of 402. Enable x402 on backend (X402_PROVIDER_PUBLIC_KEY + X402_JWT_SECRET), or provide a valid NEXT_PUBLIC_STORE_API_KEY."
          );
        }
        throw new Error((firstBody as { error?: string }).error || `Request failed (${firstRes.status})`);
      }

      const challenge = firstBody as X402Challenge;
      setStatus("x402 challenge received. Agent is paying on Stellar testnet...");

      const payRes = await fetch(`${API_URL}/api/demo/agent-pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(challenge),
      });
      const payBody = await payRes.json().catch(() => ({}));
      if (!payRes.ok || !(payBody as { tx_hash?: string }).tx_hash) {
        throw new Error((payBody as { error?: string }).error || "Agent payment failed");
      }

      setStatus("Payment submitted. Verifying with PLUTO...");

      const verifyRes = await fetch(`${API_URL}/api/verify-x402`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_hash: (payBody as { tx_hash: string }).tx_hash,
          expected_amount: challenge.amount,
          expected_recipient: challenge.recipient,
          memo: challenge.memo,
        }),
      });
      const verifyBody = await verifyRes.json().catch(() => ({}));
      const accessToken = (verifyBody as { access_token?: string }).access_token;
      if (!verifyRes.ok || !accessToken) {
        throw new Error((verifyBody as { error?: string }).error || "x402 verification failed");
      }

      setStatus("Verified. Finalizing checkout link...");

      const retryRes = await createPayment(accessToken);
      const retryBody = await retryRes.json().catch(() => ({}));
      if (!retryRes.ok) {
        throw new Error((retryBody as { error?: string }).error || `Retry failed (${retryRes.status})`);
      }

      const created = retryBody as CreatePaymentResponse;
      setStatus("Success. Redirecting to checkout...");
      window.location.href = created.payment_link;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center gap-8 px-6 py-20 bg-white text-[#0A0A0A]">
      <header className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[#6B6B6B]">Demo Store</p>
        <h1 className="mt-4 text-5xl font-black tracking-tight">PLUTO MERCH</h1>
        <p className="mt-4 text-sm font-medium text-[#6B6B6B]">
          Test purchase flow with x402-enabled payment creation.
        </p>
      </header>

      <section className="rounded-[2rem] border border-[#E8E8E8] bg-white p-8 shadow-[0_20px_60px_rgb(0,0,0,0.05)]">
        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]">Item</p>
          <div className="flex items-center justify-between rounded-2xl border border-[#E8E8E8] bg-[#F9F9F9] px-5 py-4">
            <span className="text-sm font-bold text-[#0A0A0A]">PLUTO Demo Tee</span>
            <span className="text-sm font-bold text-[#0A0A0A]">5.00 USDC</span>
          </div>

          <button
            onClick={handlePayWithCrypto}
            disabled={loading}
            className="mt-2 flex h-14 w-full items-center justify-center rounded-2xl bg-[var(--pluto-500)] text-[10px] font-bold uppercase tracking-[0.3em] text-white transition-all hover:bg-[var(--pluto-600)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Processing..." : "Pay with Crypto"}
          </button>

          {status && (
            <p className="rounded-xl border border-[#E8E8E8] bg-[#F9F9F9] px-4 py-3 text-xs font-medium text-[#0A0A0A]">{status}</p>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">{error}</p>
          )}

          <p className="text-[11px] text-[#6B6B6B]">
            Optional: set <code className="text-[#0A0A0A]">NEXT_PUBLIC_STORE_API_KEY</code> in
            <code className="text-[#0A0A0A]"> frontend/.env.local</code>. With x402 enabled on backend, this demo also works without it.
          </p>
        </div>
      </section>

      <footer className="text-center text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]">
        <Link href="/docs/x402-agentic-payments" className="text-[#0A0A0A] underline underline-offset-4 hover:text-black">
          Read x402 integration docs
        </Link>
      </footer>
    </main>
  );
}
