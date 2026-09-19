import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--paper)] p-6 text-center">
      <p className="font-display text-[2rem] text-[var(--ink)]">This page doesn’t exist.</p>
      <p className="text-[var(--ink-soft)]" lang="hi">
        यह पेज मौजूद नहीं है।
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="inline-flex min-h-12 items-center rounded-full bg-[var(--sage)] px-6 font-semibold text-[var(--paper-raised)]">
          Go home
        </Link>
        <Link href="/emergency" className="inline-flex min-h-12 items-center rounded-full bg-[var(--sos)] px-6 font-semibold text-white">
          Emergency 112
        </Link>
      </div>
    </main>
  );
}
