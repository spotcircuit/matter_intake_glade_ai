import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatterById } from "@/lib/domain/list-service";
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
          className="text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          ← Triage dashboard
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

      {matter.conflicts.length > 0 ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-900">
          <h2 className="font-semibold">
            ⚠ Conflict check — {matter.conflicts.length} flag
            {matter.conflicts.length === 1 ? "" : "s"} raised
          </h2>
          <ul className="mt-2 space-y-2 text-xs">
            {matter.conflicts.map((c, i) => (
              <li key={i}>
                <span className="font-medium">{c.matchedParty}:</span> {c.note}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-rose-800/80">
            Conflict flags are surfaced for human review only. The attorney
            decides whether prior representation precludes accepting this
            matter.
          </p>
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-600">
            AI suggestion
          </h2>
          <p className="text-[11px] text-slate-400">
            Advisory only — confirm or change as the attorney.
          </p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Pair
            label="Matter type"
            value={(matter.matterType as MatterType | null) ?? "Unclassified"}
          />
          <Pair
            label="Classification confidence"
            value={
              confidence != null
                ? `${(confidence * 100).toFixed(0)}%${
                    confidence < 0.6 ? " — verify" : ""
                  }`
                : "—"
            }
          />
          <Pair
            label="Urgency"
            value={`${matter.urgency} — ${matter.urgencyReason ?? "no reason given"}`}
          />
          <Pair label="Jurisdiction" value={matter.jurisdiction ?? "—"} />
        </dl>
        {matter.summary ? (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Summary
            </p>
            <p className="mt-1 leading-relaxed">{matter.summary}</p>
          </div>
        ) : (
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            No AI summary — the AI failed to triage this intake automatically.
            Read the raw description below and classify manually.
          </p>
        )}
      </section>

      {matter.facts.length > 0 ? (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-600">
            Extracted facts ({matter.facts.length})
          </h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {matter.facts.map((f, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="text-slate-500">{f.key}</span>
                <span className="text-right text-slate-800">{f.value}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-600">
          Raw client description
        </h2>
        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">
          {matter.rawDescription}
        </p>
      </section>

      {decisional ? (
        <DecisionPanel matterId={matter.id} />
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
          <p className="font-medium">
            This matter is{" "}
            <StatusBadge status={matter.status as MatterStatus} />.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Decisions on already-resolved matters aren&apos;t supported in this
            demo. See the audit log for the original transition.
          </p>
        </section>
      )}
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
