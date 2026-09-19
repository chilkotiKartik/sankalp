'use client';

import Link from 'next/link';

/** Route-level error boundary. No technical details are shown to the user. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--paper)] p-6 text-center">
      <p className="font-display text-[1.8rem] text-[var(--ink)]">Something went wrong.</p>
      <p className="max-w-sm text-[var(--ink-soft)]">Please try again. If this is an emergency, call 112 now.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="inline-flex min-h-12 items-center rounded-full bg-[var(--sage)] px-6 font-semibold text-[var(--paper-raised)]">
          Try again
        </button>
        <a href="tel:112" className="inline-flex min-h-12 items-center rounded-full bg-[var(--sos)] px-6 font-semibold text-white">
          Call 112
        </a>
        <Link href="/" className="inline-flex min-h-12 items-center rounded-full border border-[var(--line)] px-6 font-semibold text-[var(--ink)]">
          Home
        </Link>
      </div>
    </main>
  );
}
