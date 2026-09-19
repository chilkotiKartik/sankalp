'use client';

import { MessageSquare, Phone, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DEFAULT_PREFERENCES, PREFS_KEY, readJson, type EmergencyContact, type Preferences } from '@/lib/storage';

const tel = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;

/**
 * The trusted contact on the offline emergency page.
 *
 * A small client island inside an otherwise static page: it reads the contact from
 * this browser after hydration, so the page itself stays pre-rendered, cacheable by
 * the service worker, and useful with no JavaScript at all — 112 is plain HTML and
 * never depends on this rendering.
 *
 * Bilingual labels, because this page must work whatever the saved language is.
 */
export function OfflineEmergencyContact() {
  const [contact, setContact] = useState<EmergencyContact | null>(null);

  // Hydrate after mount: reading storage during render would make the server-rendered
  // static markup and the client markup differ.
  useEffect(() => {
    const prefs = readJson<Preferences>('local', PREFS_KEY, DEFAULT_PREFERENCES);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from an external store
    setContact(prefs.emergencyContact ?? null);
  }, []);

  if (!contact) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] p-4 text-sm text-[var(--ink-soft)]">
        <p>
          No emergency contact saved. <span lang="hi">कोई इमरजेंसी संपर्क सेव नहीं है।</span>
        </p>
        <Link href="/settings/emergency-contact" className="mt-1 inline-block font-semibold text-[var(--sage)] underline underline-offset-4">
          Add one · <span lang="hi">जोड़ें</span>
        </Link>
      </section>
    );
  }

  // Composes an SMS; it never sends one. The person still presses send.
  const smsHref = `sms:${contact.phone}?&body=${encodeURIComponent('I need help. / मुझे मदद चाहिए।')}`;

  return (
    <section aria-labelledby="offline-contact" className="sv-card rounded-[var(--radius-lg)] border border-[var(--line)] p-4">
      <h2 id="offline-contact" className="flex items-center gap-2 text-lg font-bold text-[var(--ink)]">
        <UserRound className="size-5 text-[var(--sage)]" aria-hidden /> Your contact{' '}
        <span lang="hi" className="font-semibold text-[var(--ink-soft)]">/ आपका संपर्क</span>
      </h2>
      <p className="mt-1.5 text-lg font-bold text-[var(--ink)]">
        {contact.name}
        {contact.relation && <span className="font-normal text-[var(--ink-soft)]"> · {contact.relation}</span>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={tel(contact.phone)}
          className="sv-press inline-flex min-h-12 items-center gap-2 rounded-full bg-[var(--ink)] px-5 font-semibold text-[var(--paper)]"
        >
          <Phone className="size-4" aria-hidden /> Call {contact.name}
        </a>
        <a
          href={smsHref}
          className="sv-press inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--line)] px-5 font-semibold text-[var(--ink)]"
        >
          <MessageSquare className="size-4" aria-hidden /> Text
        </a>
      </div>
    </section>
  );
}
