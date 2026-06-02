import { IntakeForm } from "./intake-form";
import Link from "next/link";

export default function IntakePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="space-y-2">
        <Link
          href="/"
          className="text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700"
        >
          ← Matter Intake &amp; Triage
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          New client intake
        </h1>
        <p className="text-sm text-slate-600">
          Describe the legal situation in plain language. The AI classifies the
          matter and pulls structured facts; an attorney reviews every intake
          before any next step.
        </p>
      </header>
      <IntakeForm />
    </main>
  );
}
