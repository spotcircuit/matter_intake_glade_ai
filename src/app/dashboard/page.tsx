import Link from "next/link";
import { listMatters } from "@/lib/domain/list-service";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { StatusBadge } from "@/components/StatusBadge";
import type { Urgency, MatterType, MatterStatus } from "@/lib/domain/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{ filter?: string }>;

const TABS: Array<{ key: string; label: string; statuses: MatterStatus[] | null }> = [
  { key: "queue", label: "Triage queue", statuses: ["intake_review", "needs_manual_review"] },
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "declined", label: "Declined", statuses: ["declined"] },
  { key: "all", label: "All", statuses: null },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const activeTab = TABS.find((t) => t.key === params.filter) ?? TABS[0];
  const matters = await listMatters(
    activeTab.statuses ? { statuses: activeTab.statuses } : undefined,
  );

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="space-y-2">
        <Link
          href="/"
          className="text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          ← Matter Intake &amp; Triage
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Triage dashboard
        </h1>
        <p className="text-sm text-slate-600">
          Sorted by urgency, then newest. AI-suggested fields are advisory —
          the attorney&apos;s decision is the source of truth.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((t) => {
          const isActive = t.key === activeTab.key;
          return (
            <Link
              key={t.key}
              href={t.key === "queue" ? "/dashboard" : `/dashboard?filter=${t.key}`}
              className={`-mb-px rounded-t-md border-x border-t px-3 py-1.5 text-xs font-medium ${
                isActive
                  ? "border-slate-200 bg-white text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <section className="space-y-3">
        {matters.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            <p>No matters in this view.</p>
            <p className="mt-1 text-xs text-slate-400">
              Try the <Link href="/intake" className="underline">intake form</Link>{" "}
              to add one, or check another tab.
            </p>
          </div>
        ) : (
          matters.map((m) => (
            <Link
              key={m.id}
              href={`/matters/${m.id}`}
              className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-900">
                      {m.client.name}
                    </h3>
                    <span className="text-xs text-slate-500">{m.client.email}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {(m.matterType as MatterType | null) ?? "Unclassified"}
                    {m.jurisdiction ? ` · ${m.jurisdiction}` : ""}
                    {m.opposingParty ? ` · vs ${m.opposingParty}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <UrgencyBadge urgency={m.urgency as Urgency} />
                  <StatusBadge status={m.status as MatterStatus} />
                  {m.conflicts.length > 0 ? (
                    <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 ring-1 ring-rose-300">
                      ⚠ {m.conflicts.length} conflict
                      {m.conflicts.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {m.classificationConfidence != null &&
                  Number(m.classificationConfidence) < 0.6 ? (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-300">
                      Low confidence
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-slate-700">
                {m.summary ??
                  "No AI summary — view the raw description in the matter detail."}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Urgency reason: {m.urgencyReason ?? "—"}
              </p>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
