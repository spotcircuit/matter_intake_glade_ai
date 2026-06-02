import type { Urgency } from "@/lib/domain/types";

const STYLES: Record<Urgency, string> = {
  High: "bg-rose-100 text-rose-800 ring-1 ring-rose-300",
  Medium: "bg-amber-100 text-amber-800 ring-1 ring-amber-300",
  Low: "bg-slate-100 text-slate-700 ring-1 ring-slate-300",
};

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${STYLES[urgency]}`}
    >
      {urgency} urgency
    </span>
  );
}
