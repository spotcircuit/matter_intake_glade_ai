"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";

type Submitted =
  | { kind: "duplicate"; matterId: string }
  | {
      kind: "created";
      matterId: string;
      triage: { ok: boolean; reason: string | null; message: string | null };
      conflictCount: number;
    };

type FieldError = Partial<
  Record<"clientName" | "clientEmail" | "description" | "opposingParty", string>
>;

export function IntakeForm() {
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [opposingParty, setOpposingParty] = useState("");
  const [description, setDescription] = useState("");

  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError>({});

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      const res = await fetch("/api/matters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientEmail,
          opposingParty: opposingParty.trim() || undefined,
          description,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json?.error?.details && Array.isArray(json.error.details)) {
          const fe: FieldError = {};
          for (const d of json.error.details) {
            if (d.path === "clientName") fe.clientName = d.message;
            else if (d.path === "clientEmail") fe.clientEmail = d.message;
            else if (d.path === "description") fe.description = d.message;
            else if (d.path === "opposingParty") fe.opposingParty = d.message;
          }
          setFieldErrors(fe);
        }
        setError(json?.error?.message ?? `Couldn't reach the server (${res.status}).`);
        return;
      }
      setSubmitted(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (submitted) return <SubmittedView submitted={submitted} />;

  const remaining = Math.max(0, 20 - description.trim().length);

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <Field label="Your name" error={fieldErrors.clientName}>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="Full name"
          required
          autoComplete="name"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </Field>

      <Field label="Email" error={fieldErrors.clientEmail}>
        <input
          type="email"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </Field>

      <Field
        label="The other side"
        sublabel="Employer, landlord, other driver, business — whoever this involves. Leave blank if it's just you."
        error={fieldErrors.opposingParty}
      >
        <input
          type="text"
          value={opposingParty}
          onChange={(e) => setOpposingParty(e.target.value)}
          placeholder="Optional"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </Field>

      <Field
        label="Walk us through what happened"
        sublabel="Plain language. Include dates, places, and amounts when you can — those are the things we have to chase down anyway."
        error={fieldErrors.description}
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={10}
          placeholder="What happened, when, who's involved, what you're hoping a lawyer can do…"
          required
          minLength={20}
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <p className="mt-1 text-right text-[11px] text-slate-400">
          {remaining > 0
            ? `${remaining} more character${remaining === 1 ? "" : "s"} to go`
            : `${description.trim().length} characters`}
        </p>
      </Field>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500">
          AI helps us structure what you wrote. An attorney decides every
          matter.
        </p>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send for review"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  sublabel,
  error,
  children,
}: {
  label: string;
  sublabel?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-700">
        {label}
      </span>
      {sublabel ? (
        <span className="block text-xs font-normal normal-case text-slate-500">
          {sublabel}
        </span>
      ) : null}
      <div className="mt-1.5">{children}</div>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </label>
  );
}

function SubmittedView({ submitted }: { submitted: Submitted }) {
  if (submitted.kind === "duplicate") {
    return (
      <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h2 className="text-lg font-semibold">Looks like we already have this</h2>
        <p>
          An identical intake from this email landed within the last 5 minutes,
          so we kept the original instead of creating a duplicate. Nothing to
          do.
        </p>
        <div className="flex gap-2">
          <Link
            href={`/matters/${submitted.matterId}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white"
          >
            See the existing matter →
          </Link>
        </div>
      </div>
    );
  }

  const aiFailed = submitted.triage.ok === false;
  return (
    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
      <h2 className="text-lg font-semibold">Got it. Thanks.</h2>
      <p>
        Your intake is in the queue. An attorney will review and reach out
        within one business day.
      </p>
      <ul className="space-y-1.5 text-xs text-emerald-900/80">
        <li className="flex items-start gap-2">
          <span aria-hidden>{aiFailed ? "⚠" : "✓"}</span>
          <span>
            {aiFailed
              ? "The AI couldn't structure your intake automatically — it's been flagged for an attorney to read end-to-end. Nothing about that affects how seriously we'll treat it."
              : "AI organized your intake — matter type, key dates, jurisdiction. The attorney will double-check everything."}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span aria-hidden>{submitted.conflictCount > 0 ? "⚠" : "✓"}</span>
          <span>
            {submitted.conflictCount > 0
              ? `${submitted.conflictCount} name match${submitted.conflictCount === 1 ? "" : "es"} flagged for the attorney to verify before any next step.`
              : "No conflicts found in our system."}
          </span>
        </li>
      </ul>
      <div className="flex gap-2 pt-1">
        <Link
          href={`/matters/${submitted.matterId}`}
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white"
        >
          View this matter →
        </Link>
        <Link
          href="/intake"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
        >
          Submit another
        </Link>
      </div>
    </div>
  );
}
