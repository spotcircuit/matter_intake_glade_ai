"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ConflictFlagView = {
  id: string;
  matchedParty: string;
  note: string;
};

export function ConflictPanel({
  matterId,
  flags,
}: {
  matterId: string;
  flags: ConflictFlagView[];
}) {
  if (flags.length === 0) return null;

  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-900">
        Conflict check — {flags.length} match
        {flags.length === 1 ? "" : "es"} to verify
      </h2>
      <ul className="mt-3 space-y-3">
        {flags.map((f) => (
          <FlagRow key={f.id} matterId={matterId} flag={f} />
        ))}
      </ul>
      <p className="mt-4 border-t border-rose-200/60 pt-3 text-xs text-rose-800/80">
        The AI doesn&apos;t know whether prior representation precludes this
        matter — you do. Dismiss with a reason if you&apos;ve determined
        there&apos;s no real conflict; the trail keeps a record either way.
      </p>
    </section>
  );
}

function FlagRow({
  matterId,
  flag,
}: {
  matterId: string;
  flag: ConflictFlagView;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismiss = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/matters/${matterId}/conflicts/${flag.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() || undefined }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json?.error?.message ?? `Couldn't dismiss (${res.status}).`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-rose-200/60 bg-white/60 p-3">
      <p>
        <span className="font-medium">{flag.matchedParty}:</span> {flag.note}
      </p>
      {!open ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-900 hover:bg-rose-50"
          >
            Not a conflict — dismiss
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-rose-900">
              Reason (recommended)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Different defendant; prior representation ended in 2019; informed consent obtained."
              className="w-full resize-y rounded-md border border-rose-300 bg-white px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
          {error ? (
            <p className="text-xs text-rose-700">{error}</p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setNote("");
                setError(null);
              }}
              disabled={busy}
              className="rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-medium text-rose-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              className="rounded-md bg-rose-700 px-3 py-1 text-[11px] font-medium text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {busy ? "Dismissing…" : "Dismiss flag"}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
