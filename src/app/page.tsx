import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-10 px-6 py-14">
      <header className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          Matter Intake &amp; Triage
        </p>
        <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900">
          AI helps you triage.
          <br />
          <span className="text-slate-500">You decide every matter.</span>
        </h1>
        <p className="max-w-xl text-slate-600">
          Drop an intake in. We classify the matter, pull the dates and numbers,
          run the conflict check, and queue it by urgency. Then you accept or
          decline — one click, one note, full trail.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/intake"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm text-white">
            ✎
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            New intake
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Plain language. We&apos;ll structure it.
          </p>
          <p className="mt-5 text-sm font-medium text-slate-900 transition group-hover:translate-x-0.5">
            Start →
          </p>
        </Link>
        <Link
          href="/dashboard"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm text-white">
            ⊞
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Triage queue
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Sorted by urgency. Conflicts flagged. Clear it.
          </p>
          <p className="mt-5 text-sm font-medium text-slate-900 transition group-hover:translate-x-0.5">
            Open →
          </p>
        </Link>
      </div>

      <footer className="mt-auto border-t border-slate-200 pt-6 text-xs text-slate-400">
        Demo build · single seeded firm · no auth. Multi-tenant auth is the
        obvious production next step — see the README.
      </footer>
    </main>
  );
}
