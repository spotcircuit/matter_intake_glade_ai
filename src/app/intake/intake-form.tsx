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

type FieldError = Partial<Record<"clientName" | "clientEmail" | "description" | "opposingParty", string>>;

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
        setError(json?.error?.message ?? `Request failed (${res.status}).`);
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

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <Field label="Your name" error={fieldErrors.clientName}>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="e.g. Sarah Chen"
          required
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
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </Field>

      <Field
        label="Opposing party"
        sublabel="(if any — e.g. employer, landlord, other driver, business)"
        error={fieldErrors.opposingParty}
      >
        <input
          type="text"
          value={opposingParty}
          onChange={(e) => setOpposingParty(e.target.value)}
          placeholder="Leave blank if none"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </Field>

      <Field
        label="Describe what happened"
        sublabel="Plain language is fine. Include dates, places, amounts, and other parties if you know them."
        error={fieldErrors.description}
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={9}
          placeholder="What happened, when, who's involved, what outcome are you looking for…"
          required
          minLength={20}
          className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
        <p className="mt-1 text-right text-[11px] text-slate-400">
          {description.trim().length} / 20 minimum
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

      <div className="flex items-center justify-between gap-4 pt-2">
        <p className="text-xs text-slate-500">
          AI assists with classification. An attorney reviews every matter.
        </p>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Submit intake"}
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
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-600">
        {label}
      </span>
      {sublabel ? (
        <span className="block text-[11px] font-normal normal-case text-slate-500">
          {sublabel}
        </span>
      ) : null}
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="text-xs text-rose-700">{error}</p>
      ) : null}
    </label>
  );
}

function SubmittedView({ submitted }: { submitted: Submitted }) {
  if (submitted.kind === "duplicate") {
    return (
      <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h2 className="text-lg font-semibold">This looked like a duplicate</h2>
        <p>
          An identical intake from this email was submitted in the last 5
          minutes. We&apos;ve kept the original matter and not created a new
          one.
        </p>
        <div className="flex gap-2">
          <Link
            href={`/matters/${submitted.matterId}`}
            className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white"
          >
            View the existing matter →
          </Link>
        </div>
      </div>
    );
  }

  const aiFailed = submitted.triage.ok === false;
  return (
    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
      <h2 className="text-lg font-semibold">Intake received</h2>
      <p>
        Your matter has been saved and queued for attorney review. You&apos;ll
        hear from the firm shortly.
      </p>
      <ul className="space-y-1 text-xs text-emerald-900/80">
        <li>
          {aiFailed
            ? "⚠ The AI couldn't structure the intake automatically — flagged for manual review by an attorney."
            : "✓ AI classification ran successfully and structured facts were extracted."}
        </li>
        {submitted.conflictCount > 0 ? (
          <li>
            {submitted.conflictCount} potential conflict flag{submitted.conflictCount === 1 ? "" : "s"} raised — an attorney will check before any representation is offered.
          </li>
        ) : (
          <li>No conflict flags raised.</li>
        )}
      </ul>
      <div className="flex gap-2">
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
