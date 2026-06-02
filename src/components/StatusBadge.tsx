import type { MatterStatus } from "@/lib/domain/types";

const STYLES: Record<MatterStatus, { label: string; tone: string }> = {
  intake_review: {
    label: "Intake review",
    tone: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300",
  },
  active: {
    label: "Active",
    tone: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300",
  },
  declined: {
    label: "Declined",
    tone: "bg-slate-100 text-slate-600 ring-1 ring-slate-300",
  },
  needs_manual_review: {
    label: "Needs manual review",
    tone: "bg-amber-100 text-amber-900 ring-1 ring-amber-300",
  },
};

export function StatusBadge({ status }: { status: MatterStatus }) {
  const s = STYLES[status];
  return (
    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${s.tone}`}>
      {s.label}
    </span>
  );
}
