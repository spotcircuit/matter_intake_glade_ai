import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getMatterById,
  listAuditForMatter,
  type AuditEntry,
} from "@/lib/domain/list-service";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { DecisionPanel } from "./decision-panel";
import type { MatterStatus, MatterType, Urgency } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function MatterDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const matter = await getMatterById(id);
  if (!matter) notFound();

  const audit = await listAuditForMatter(id);

  const decisional =
    matter.status === "intake_review" || matter.status === "needs_manual_review";

  const confidence =
    matter.classificationConfidence != null
      ? Number(matter.classificationConfidence)
      : null;

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="space-y-2">
        <Link
          href="/dashboard"
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 hover:text-slate-700"
        >
          ← Triage queue
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {matter.client.name}
          </h1>
          <UrgencyBadge urgency={matter.urgency as Urgency} />
          <StatusBadge status={matter.status as MatterStatus} />
        </div>
        <p className="text-xs text-slate-500">
          {matter.client.email}
          {matter.opposingParty ? ` · vs ${matter.opposingParty}` : ""}
          {matter.jurisdiction ? ` · ${matter.jurisdiction}` : ""}
        </p>
      </header>

      {/* DECISION FIRST — the human decision is the point of the page */}
      {decisional ? (
        <DecisionPanel matterId={matter.id} hasConflicts={matter.conflicts.length > 0} />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-700">
          <p>
            <span className="font-medium">This matter is decided.</span>{" "}
            Reopening isn&apos;t supported in this demo — see the trail at the
            bottom for the original transition.
          </p>
        </section>
      )}

      {matter.conflicts.length > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-900">
            Conflict check — {matter.conflicts.length} match
            {matter.conflicts.length === 1 ? "" : "es"} to verify
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {matter.conflicts.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.matchedParty}:</span> {c.note}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-rose-200/60 pt-2 text-xs text-rose-800/80">
            Flags are surfaced for human review only. The AI doesn&apos;t know
            whether prior representation precludes this matter — you do.
          </p>
        </section>
      ) : null}

      {/* AI suggestion — visually subordinate, clearly labeled as suggestion */}
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            AI suggestion · advisory only
          </h2>
          {confidence != null ? (
            <span
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                confidence < 0.6
                  ? "bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                  : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
              }`}
            >
              {Math.round(confidence * 100)}% confidence
              {confidence < 0.6 ? " — verify" : ""}
            </span>
          ) : null}
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Pair
            label="Matter type"
            value={(matter.matterType as MatterType | null) ?? "Unclassified"}
          />
          <Pair label="Urgency" value={matter.urgency} />
          <Pair
            label="Jurisdiction"
            value={matter.jurisdiction ?? "—"}
          />
          <Pair
            label="Why this urgency"
            value={matter.urgencyReason ?? "—"}
          />
        </dl>
        {matter.summary ? (
          <div className="rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
            {matter.summary}
          </div>
        ) : (
          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            AI couldn&apos;t structure this intake automatically. Read the raw
            description below and classify by hand.
          </div>
        )}
      </section>

      {matter.facts.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Extracted facts · {matter.facts.length}
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {matter.facts.map((f, i) => (
              <li
                key={i}
                className="flex flex-wrap items-baseline justify-between gap-2 py-1.5"
              >
                <span className="font-mono text-xs text-slate-500">{f.key}</span>
                <span className="text-right text-slate-800">{f.value}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
          What the client wrote
        </h2>
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
          {matter.rawDescription}
        </p>
      </section>

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
          Trail · {audit.length} {audit.length === 1 ? "event" : "events"}
        </h2>
        <ol className="space-y-2 text-sm">
          {audit.map((e) => (
            <AuditRow key={e.id} entry={e} />
          ))}
        </ol>
      </section>
    </main>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  created: "Intake submitted",
  ai_triage_applied: "AI structured the intake",
  ai_failure_flagged_for_manual_review: "AI failed — flagged for manual review",
  conflict_flag_raised: "Conflict flag raised",
  accepted: "Accepted by attorney",
  declined: "Declined by attorney",
};

function AuditRow({ entry }: { entry: AuditEntry }) {
  const label = ACTION_LABEL[entry.action] ?? entry.action;
  const tone =
    entry.action === "accepted"
      ? "bg-emerald-500"
      : entry.action === "declined"
        ? "bg-slate-500"
        : entry.action === "conflict_flag_raised" ||
            entry.action === "ai_failure_flagged_for_manual_review"
          ? "bg-rose-500"
          : entry.action === "ai_triage_applied"
            ? "bg-indigo-500"
            : "bg-slate-300";

  return (
    <li className="flex gap-3">
      <span
        className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${tone}`}
        aria-hidden
      />
      <div className="flex-1 space-y-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="font-medium text-slate-900">{label}</p>
          <p className="text-[11px] text-slate-400">
            {formatTrailDate(entry.createdAt)} · {entry.actor}
          </p>
        </div>
        {entry.note ? (
          <p className="text-xs leading-relaxed text-slate-600">{entry.note}</p>
        ) : null}
      </div>
    </li>
  );
}

function formatTrailDate(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
