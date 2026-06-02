"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Decision = "accept" | "decline";

export function DecisionPanel({
  matterId,
  hasConflicts,
}: {
  matterId: string;
  hasConflicts: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: Decision) => {
    setError(null);
    setBusy(decision);
    try {
      const res = await fetch(`/api/matters/${matterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error?.message ?? `Couldn't save (${res.status}).`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border-2 border-slate-900 bg-white p-6 shadow-md">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900">
            Your decision
          </h2>
          <p className="text-xs text-slate-500">
            The AI&apos;s structured fields are below. You decide what happens.
          </p>
        </div>
        {hasConflicts ? (
          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-900 ring-1 ring-rose-300">
            ⚠ Resolve conflicts first
          </span>
        ) : null}
      </div>

      <label className="block space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-700">
          Note for the trail
        </span>
        <span className="block text-xs font-normal normal-case text-slate-500">
          Why you accepted or declined. Referral target if you&apos;re passing
          it. Anything you&apos;d want a partner to see in six months.
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Optional, but recommended."
          className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </label>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => decide("decline")}
          disabled={!!busy}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "decline" ? "Declining…" : "Decline"}
        </button>
        <button
          type="button"
          onClick={() => decide("accept")}
          disabled={!!busy}
          className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy === "accept" ? "Accepting…" : "Accept matter"}
        </button>
      </div>
    </section>
  );
}
