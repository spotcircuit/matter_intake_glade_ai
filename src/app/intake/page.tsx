import Link from "next/link";
import { IntakeForm } from "./intake-form";

export default function IntakePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-7 px-6 py-12">
      <header className="space-y-3">
        <Link
          href="/"
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 hover:text-slate-700"
        >
          ← Matter Intake &amp; Triage
        </Link>
        <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-slate-900">
          Tell us what&apos;s going on.
        </h1>
        <p className="max-w-xl text-slate-600">
          Plain language is fine. Mention dates, places, amounts, and other
          parties if you remember them. An attorney reads every intake — the AI
          just helps us organize what you send.
        </p>
      </header>
      <IntakeForm />
    </main>
  );
}
