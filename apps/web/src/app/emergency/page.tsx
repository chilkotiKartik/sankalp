import { INDIA_EMERGENCY_CONTACTS } from '@sanjeevani/config';
import type { Metadata } from 'next';
import Link from 'next/link';
import { OfflineEmergencyContact } from '@/components/emergency/offline-contact';

export const metadata: Metadata = { title: 'Emergency numbers — Sanjeevani' };
export const dynamic = 'force-static';

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;

/**
 * Offline-safe emergency page: static HTML, no data fetching, cached by the service worker.
 * Bilingual so it works regardless of saved preferences.
 */
export default function EmergencyPage() {
  const primary = INDIA_EMERGENCY_CONTACTS.find((c) => c.primary)!;
  const others = INDIA_EMERGENCY_CONTACTS.filter((c) => !c.primary);
  return (
    <main id="main" className="min-h-dvh bg-[var(--paper)]">
      <div className="bg-[var(--sos)] px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-8 text-white">
        <div className="mx-auto max-w-xl">
          <Link href="/" className="inline-flex min-h-11 items-center text-sm font-semibold text-white/90 underline underline-offset-4">
            ← Sanjeevani
          </Link>
          <h1 className="font-display mt-3 text-[2.1rem] leading-tight">
            Emergency help
            <span className="mt-1 block text-[1.5rem]" lang="hi">
              इमरजेंसी मदद
            </span>
          </h1>
          <a
            href={tel(primary.number)}
            className="mt-6 flex min-h-20 items-center justify-center rounded-[var(--radius-xl)] bg-white text-[1.8rem] font-extrabold text-[var(--sos)] shadow-[0_18px_40px_-16px_rgb(0_0_0/0.45)]"
          >
            Call {primary.number} · <span lang="hi">&nbsp;कॉल करें</span>
          </a>
          <p className="mt-2 text-center text-white/90">{primary.description}</p>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-6 px-5 py-6">
        <OfflineEmergencyContact />

        <section aria-labelledby="tell">
          <h2 id="tell" className="text-lg font-bold text-[var(--ink)]">
            When you call, tell them <span lang="hi" className="font-semibold text-[var(--ink-soft)]">/ कॉल पर बताएं</span>
          </h2>
          <ul className="mt-3 space-y-2 text-[1.05rem] text-[var(--ink)]">
            <li>1. Where you are — area, landmark. <span lang="hi">आप कहां हैं — इलाका, पास की पहचान।</span></li>
            <li>2. What happened, and how many people need help. <span lang="hi">क्या हुआ, और कितने लोगों को मदद चाहिए।</span></li>
            <li>3. Whether the person is awake and breathing. <span lang="hi">व्यक्ति होश में है और सांस ले रहा है या नहीं।</span></li>
            <li>4. Stay on the line and keep your phone free. <span lang="hi">लाइन पर बने रहें, फ़ोन व्यस्त न रखें।</span></li>
          </ul>
        </section>

        <section aria-labelledby="other">
          <h2 id="other" className="text-lg font-bold text-[var(--ink)]">
            Other helplines <span lang="hi" className="font-semibold text-[var(--ink-soft)]">/ अन्य हेल्पलाइन</span>
          </h2>
          <ul className="mt-3 divide-y divide-[var(--line)] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--paper-raised)]">
            {others.map((c) => (
              <li key={c.number}>
                <a href={tel(c.number)} className="flex min-h-16 items-center justify-between gap-3 px-4 py-2">
                  <span>
                    <span className="block font-semibold text-[var(--ink)]">{c.label}</span>
                    <span className="block text-sm text-[var(--ink-soft)]">{c.description}</span>
                  </span>
                  <span className="text-2xl font-bold text-[var(--ink)] tabular-nums">{c.number}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="text-sm text-[var(--ink-faint)]">
          <p>This page works offline. / यह पेज ऑफ़लाइन भी चलता है।</p>
          <p className="mt-2">
            Sources:{' '}
            {INDIA_EMERGENCY_CONTACTS.map((c, i) => (
              <span key={c.number}>
                {i > 0 && ' · '}
                <a href={c.sourceUrl} className="underline underline-offset-2" rel="noopener noreferrer" target="_blank">
                  {c.number}
                </a>
              </span>
            ))}
          </p>
        </section>
      </div>
    </main>
  );
}
