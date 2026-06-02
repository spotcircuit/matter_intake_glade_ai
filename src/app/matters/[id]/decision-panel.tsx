"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Decision = "accept" | "decline";

export function DecisionPanel({ matterId }: { matterId: string }) {
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
        setError(json?.error?.message ?? `Failed (${res.status}).`);
        return;
      }
      // Server-side rendered page — refresh to pick up the new status.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-600">
          Attorney decision
        </h2>
        <p className="text-[11px] text-slate-500">
          You decide. The AI suggestion above is advisory.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Note (optional)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Reason for accepting / declining; referral; anything you'd want in the audit log."
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
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

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={() => decide("decline")}
          disabled={!!busy}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "decline" ? "Declining…" : "Decline"}
        </button>
        <button
          type="button"
          onClick={() => decide("accept")}
          disabled={!!busy}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy === "accept" ? "Accepting…" : "Accept"}
        </button>
      </div>
    </section>
  );
}
