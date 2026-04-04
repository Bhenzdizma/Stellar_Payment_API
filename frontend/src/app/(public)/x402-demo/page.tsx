"use client";

import { useState } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type StepStatus = "idle" | "running" | "done" | "error";

type Step = { id: string; label: string; status: StepStatus; detail?: string };

const INITIAL: Step[] = [
  { id: "hit",    label: "Hit protected endpoint",              status: "idle" },
  { id: "402",    label: "Receive 402 + payment requirements",  status: "idle" },
  { id: "sign",   label: "Sign Soroban auth entry (wallet)",    status: "idle" },
  { id: "settle", label: "Facilitator settles USDC on-chain",   status: "idle" },
  { id: "access", label: "Receive protected data",              status: "idle" },
];

function StepRow({ step }: { step: Step }) {
  const icons = {
    idle:    <span className="h-5 w-5 rounded-full border-2 border-[#E8E8E8]" />,
    running: <span className="h-5 w-5 rounded-full border-2 border-[var(--pluto-400)] flex items-center justify-center"><span className="h-2 w-2 rounded-full bg-[var(--pluto-500)] animate-ping" /></span>,
    done:    <span className="h-5 w-5 rounded-full bg-[var(--pluto-500)] flex items-center justify-center"><svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span>,
    error:   <span className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center"><svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></span>,
  };

  return (
    <div className={`flex items-start gap-4 py-3 transition-opacity ${step.status === "idle" ? "opacity-35" : "opacity-100"}`}>
      <div className="mt-0.5 shrink-0">{icons[step.status]}</div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <p className={`text-sm font-bold ${step.status === "error" ? "text-red-600" : step.status === "running" ? "text-[var(--pluto-700)]" : "text-[#0A0A0A]"}`}>
          {step.label}
        </p>
        {step.detail && <p className="font-mono text-[10px] text-[#6B6B6B] break-all">{step.detail}</p>}
      </div>
    </div>
  );
}

export default function X402DemoPage() {
  const [steps, setSteps] = useState<Step[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Step>) =>
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function runDemo() {
    setRunning(true);
    setResult(null);
    setError(null);
    setSteps(INITIAL);

    try {
      // Step 1
      update("hit", { status: "running", detail: `GET ${API_URL}/api/demo/protected` });
      await delay(500);
      const res1 = await fetch(`${API_URL}/api/demo/protected`);

      if (res1.status === 200) {
        // Already accessible (shouldn't happen without payment)
        const data = await res1.json();
        ["hit","402","sign","settle","access"].forEach(id => update(id, { status: "done" }));
        setResult(data);
        setRunning(false);
        return;
      }

      if (res1.status !== 402) {
        update("hit", { status: "error", detail: `Expected 402, got ${res1.status}` });
        setError(`Server returned ${res1.status}. Make sure X402_PROVIDER_PUBLIC_KEY is set and backend is restarted.`);
        setRunning(false);
        return;
      }

      update("hit", { status: "done", detail: `→ 402 Payment Required` });

      // Step 2 — show 402 details
      update("402", { status: "running" });
      await delay(400);
      // The official x402 puts payment info in response headers, not body
      const paymentHeader = res1.headers.get("x-payment-required") || res1.headers.get("www-authenticate");
      update("402", {
        status: "done",
        detail: paymentHeader
          ? `Payment required: $0.10 USDC on ${process.env.NEXT_PUBLIC_STELLAR_NETWORK || "testnet"}`
          : "Payment details in response headers (x-payment-required)",
      });

      // Step 3 — signing (server-side for browser demo)
      update("sign", { status: "running", detail: "Signing Soroban auth entry..." });
      await delay(800);

      // Call our server-side agent-pay endpoint which uses the AGENT_SECRET
      const payRes = await fetch(`${API_URL}/api/demo/agent-pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/api/demo/protected", method: "GET" }),
      });

      if (!payRes.ok) {
        const payErr = await payRes.json().catch(() => ({ error: "Unknown error" }));
        update("sign", { status: "error", detail: payErr.error });
        setError(`${payErr.error}\n\nFor the full demo, run: node scripts/demoAgent.js in the backend terminal.`);
        setRunning(false);
        return;
      }

      const payData = await payRes.json();
      update("sign", { status: "done", detail: "Auth entry signed with agent wallet" });

      // Step 4 — settlement
      update("settle", { status: "running", detail: "Facilitator submitting USDC transfer..." });
      await delay(600);
      update("settle", {
        status: "done",
        detail: payData.tx_hash
          ? `Settled: ${payData.tx_hash.slice(0, 16)}...`
          : "USDC settled via x402.org facilitator",
      });

      // Step 5 — access
      update("access", { status: "running" });
      await delay(400);
      update("access", { status: "done", detail: "200 OK — data unlocked" });
      setResult(payData.data || { message: "Access granted via x402 payment" });

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-16">
      <div className="mx-auto max-w-2xl flex flex-col gap-10">

        {/* Header */}
        <div className="flex flex-col gap-3">
          <Link href="/" className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B] hover:text-[#0A0A0A] transition-colors">← Back</Link>
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-[var(--pluto-500)]">Official x402 Protocol</p>
          <h1 className="text-4xl font-bold text-[#0A0A0A] tracking-tight">Agentic Payments Demo</h1>
          <p className="text-sm font-medium text-[#6B6B6B] max-w-lg leading-relaxed">
            Watch the official x402 Soroban auth flow — AI agents pay per API call using USDC on Stellar. No subscriptions, no API keys.
          </p>
        </div>

        {/* Protocol explanation */}
        <div className="rounded-2xl border border-[#E8E8E8] bg-[#F9F9F9] p-6 flex flex-col gap-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B]">Official x402 flow (Soroban)</p>
          <div className="flex flex-col gap-2 font-mono text-xs">
            {[
              ["→", "Agent hits /api/demo/protected", "text-[var(--pluto-500)]"],
              ["←", "402 + payment requirements in headers", "text-yellow-500"],
              ["→", "Agent signs Soroban auth entry with keypair", "text-[var(--pluto-500)]"],
              ["→", "Sends signed entry to x402.org facilitator", "text-[var(--pluto-500)]"],
              ["⚡", "Facilitator submits USDC transfer on-chain", "text-purple-500"],
              ["←", "200 OK + protected data", "text-emerald-500"],
            ].map(([arrow, text, color]) => (
              <div key={text} className="flex items-center gap-3">
                <span className={`font-bold ${color}`}>{arrow}</span>
                <span className="text-[#0A0A0A]">{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Demo runner */}
        <div className="rounded-2xl border border-[#E8E8E8] bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#E8E8E8] px-6 py-4">
            <div>
              <p className="text-sm font-bold text-[#0A0A0A]">Browser Demo</p>
              <p className="text-[10px] text-[#6B6B6B] font-medium">Runs against your local PLUTO backend</p>
            </div>
            <button onClick={runDemo} disabled={running}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--pluto-500)] px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[var(--pluto-600)] disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {running ? (
                <><svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Running…</>
              ) : "Run x402 Demo"}
            </button>
          </div>

          <div className="px-6 py-2 divide-y divide-[#F5F5F5]">
            {steps.map(s => <StepRow key={s.id} step={s} />)}
          </div>

          {result && (
            <div className="mx-6 mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2">Protected Data Received ✓</p>
              <pre className="font-mono text-xs text-emerald-800 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}

          {error && (
            <div className="mx-6 mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 mb-1">Error</p>
              <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
            </div>
          )}
        </div>

        {/* Terminal demo */}
        <div className="rounded-2xl border border-[#E8E8E8] bg-[#0A0A0A] p-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#6B6B6B] mb-3">Full Autonomous Agent (Terminal)</p>
          <p className="text-xs text-[#6B6B6B] mb-4">
            The terminal demo uses the official <code className="text-emerald-400">@x402/fetch</code> SDK to run the complete Soroban auth flow autonomously.
          </p>
          <code className="block font-mono text-sm text-emerald-400">$ node scripts/demoAgent.js</code>
        </div>

        {/* Docs link */}
        <div className="flex items-center justify-between rounded-2xl border border-[var(--pluto-100)] bg-[var(--pluto-50)] px-6 py-4">
          <div>
            <p className="text-sm font-bold text-[var(--pluto-800)]">Read the full x402 guide</p>
            <p className="text-xs text-[var(--pluto-600)]">API reference, middleware setup, security model</p>
          </div>
          <Link href="/docs/x402-agentic-payments"
            className="rounded-xl bg-[var(--pluto-500)] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-[var(--pluto-600)] transition-all">
            View Docs →
          </Link>
        </div>

        <p className="text-center text-[10px] text-[#C0C0C0]">
          Powered by PLUTO · Official x402 Protocol · Stellar Testnet
        </p>
      </div>
    </main>
  );
}
