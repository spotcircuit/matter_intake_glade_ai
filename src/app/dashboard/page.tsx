import Link from "next/link";
import { listMatters, type MatterSummary } from "@/lib/domain/list-service";
import { UrgencyBadge } from "@/components/UrgencyBadge";
import { StatusBadge } from "@/components/StatusBadge";
import type { Urgency, MatterType, MatterStatus } from "@/lib/domain/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{ filter?: string }>;

const TABS: Array<{ key: string; label: string; statuses: MatterStatus[] | null }> = [
  { key: "queue", label: "Queue", statuses: ["intake_review", "needs_manual_review"] },
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

  // Snapshot computed from the queue tab specifically — even when the
  // user is looking at another tab, the snapshot reflects what needs them.
  const queueForSnapshot =
    activeTab.key === "queue"
      ? matters
      : await listMatters({ statuses: ["intake_review", "needs_manual_review"] });

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-7 px-6 py-10">
      <header className="space-y-2">
        <Link
          href="/"
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 hover:text-slate-700"
        >
          ← Matter Intake &amp; Triage
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Triage queue
        </h1>
        <p className="text-sm text-slate-600">
          Sorted by urgency, then newest. AI fills the structure; you make the
          call.
        </p>
      </header>

      <SnapshotStrip matters={queueForSnapshot} />

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
          <EmptyState tab={activeTab.key} />
        ) : (
          matters.map((m) => <MatterCard key={m.id} m={m} />)
        )}
      </section>
    </main>
  );
}

function SnapshotStrip({ matters }: { matters: MatterSummary[] }) {
  const newToday = matters.filter((m) => isToday(m.createdAt)).length;
  const highUrgency = matters.filter((m) => m.urgency === "High").length;
  const withConflicts = matters.filter((m) => m.conflicts.length > 0).length;
  const needsReview = matters.filter(
    (m) => m.status === "needs_manual_review",
  ).length;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <SnapshotCard
        label="New today"
        value={newToday}
        tone={newToday > 0 ? "neutral" : "muted"}
      />
      <SnapshotCard
        label="High urgency"
        value={highUrgency}
        tone={highUrgency > 0 ? "rose" : "muted"}
      />
      <SnapshotCard
        label="Conflicts to verify"
        value={withConflicts}
        tone={withConflicts > 0 ? "amber" : "muted"}
      />
      <SnapshotCard
        label="Needs your eye"
        value={needsReview}
        tone={needsReview > 0 ? "indigo" : "muted"}
      />
    </div>
  );
}

function SnapshotCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "muted" | "rose" | "amber" | "indigo";
}) {
  const valueClass = {
    neutral: "text-slate-900",
    muted: "text-slate-400",
    rose: "text-rose-700",
    amber: "text-amber-700",
    indigo: "text-indigo-700",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function MatterCard({ m }: { m: MatterSummary }) {
  const confidence =
    m.classificationConfidence != null ? Number(m.classificationConfidence) : null;
  const lowConfidence = confidence != null && confidence < 0.6;
  return (
    <Link
      href={`/matters/${m.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
        <div className="flex flex-wrap items-center gap-1.5">
          <UrgencyBadge urgency={m.urgency as Urgency} />
          <StatusBadge status={m.status as MatterStatus} />
          {m.conflicts.length > 0 ? (
            <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 ring-1 ring-rose-300">
              ⚠ {m.conflicts.length} conflict
              {m.conflicts.length === 1 ? "" : "s"}
            </span>
          ) : null}
          {lowConfidence ? (
            <span
              className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-300"
              title="AI classification confidence below 60%"
            >
              Verify
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-slate-700">
        {m.summary ?? "No AI summary yet — open to read the raw description."}
      </p>
      {m.urgencyReason ? (
        <p className="mt-2 text-xs text-slate-400">{m.urgencyReason}</p>
      ) : null}
    </Link>
  );
}

function EmptyState({ tab }: { tab: string }) {
  const copy: Record<string, { title: string; sub: string }> = {
    queue: {
      title: "Queue is clear.",
      sub: "Nothing waiting on you. Submit an intake to see it land here.",
    },
    active: {
      title: "No active matters yet.",
      sub: "Accepted intakes show up here.",
    },
    declined: {
      title: "No declined matters.",
      sub: "Declined intakes — with the note you wrote — show up here.",
    },
    all: {
      title: "No matters at all.",
      sub: "Submit an intake to get started.",
    },
  };
  const c = copy[tab] ?? copy.queue;
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-base font-medium text-slate-700">{c.title}</p>
      <p className="mt-1 text-sm text-slate-500">{c.sub}</p>
      <Link
        href="/intake"
        className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white"
      >
        New intake →
      </Link>
    </div>
  );
}

function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
