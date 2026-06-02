import Link from "next/link";

/**
 * Landing — two entry points. Public intake form, and the internal
 * triage dashboard. M5 wires the real screens; M1 ships the shell so
 * Next builds end-to-end.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Matter Intake &amp; Triage
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          AI-assisted client intake.
        </h1>
        <p className="text-slate-600">
          AI suggests a matter type, extracts facts, and flags conflicts.{" "}
          <span className="font-medium text-slate-900">
            An attorney accepts or declines every matter.
          </span>
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/intake"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-slate-900">New intake</h2>
          <p className="mt-1 text-sm text-slate-600">
            Describe the legal situation in plain language. The AI fills in the
            rest.
          </p>
          <p className="mt-4 text-sm font-medium text-slate-900">Start →</p>
        </Link>
        <Link
          href="/dashboard"
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-slate-900">
            Triage dashboard
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Review pending matters sorted by urgency. Accept, decline, or send
            back for manual review.
          </p>
          <p className="mt-4 text-sm font-medium text-slate-900">Open →</p>
        </Link>
      </div>

      <footer className="mt-auto pt-8 text-xs text-slate-400">
        Demo build — no auth, single seeded firm. Multi-tenant auth is the
        obvious production next step (see README).
      </footer>
    </main>
  );
}
