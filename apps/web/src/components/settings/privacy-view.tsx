'use client';

import { INDIA_EMERGENCY_CONTACTS } from '@sanjeevani/config';
import { Button, SectionLabel } from '@sanjeevani/ui';
import { Check, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageShell } from '@/components/chrome';
import { PageBody } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { ApiError, api } from '@/lib/api';
import { removeKey, SAVED_KEY } from '@/lib/storage';

const FACILITY_SOURCES = [
  { label: 'Medanta', url: 'https://www.medanta.org/hospitals-near-me/gurugram-hospital' },
  { label: 'Artemis', url: 'https://www.artemishospitals.com/contact-us' },
  { label: 'Fortis FMRI', url: 'https://www.fortishealthcare.com/location/fortis-memorial-research-institute-gurgaon' },
  { label: 'Max Hospital', url: 'https://www.maxhealthcare.in/hospital-network/max-hospital-gurgaon' },
  { label: 'Paras Health', url: 'https://www.parashospitals.com/gurugram' },
  { label: 'NHSRC — District Civil Hospital', url: 'https://nhsrcindia.org/node/1291' },
];

export function PrivacyView() {
  const { t, capabilities, clearLocation } = useApp();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const days = capabilities?.retentionDays ?? 7;

  const points = [t('privacyAnon'), t('privacyEncrypted'), t('privacyRetention', { days }), t('privacyLocation'), t('privacyAudio'), t('privacyLogs')];

  const deleteAll = async () => {
    if (!window.confirm(t('deleteAllConfirm'))) return;
    setBusy(true);
    try {
      await api.deleteAllData();
      clearLocation();
      removeKey('local', SAVED_KEY);
      toast(t('deleteAllDone'));
      router.push('/');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t('somethingWrong'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title={t('privacyTitle')}>
      <PageBody>
      <div className="space-y-8">
        <p className="font-display text-[1.5rem] leading-snug text-[var(--ink)]">{t('privacyIntro')}</p>
        <ul className="space-y-3">
          {points.map((p) => (
            <li key={p} className="flex gap-3 text-[1.02rem] text-[var(--ink)]">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--sage-soft)] text-[var(--sage)]">
                <Check className="size-4" aria-hidden />
              </span>
              {p}
            </li>
          ))}
        </ul>

        <section aria-labelledby="ai-h" className="sv-card rounded-[var(--radius-lg)] border border-[var(--line)] p-4">
          <h2 id="ai-h" className="font-bold text-[var(--ink)]">
            {t('privacyAi')}
          </h2>
          <p className="mt-1.5 text-[var(--ink-soft)]">{t('privacyAiText')}</p>
          <p className="mt-3 text-sm font-semibold text-[var(--ink)]">{t('disclaimer')}</p>
        </section>

        <Button variant="danger" size="lg" block disabled={busy} onClick={deleteAll} icon={<Trash2 className="size-5" aria-hidden />}>
          {t('deleteAll')}
        </Button>

        <section aria-labelledby="src-h" className="space-y-2 text-sm text-[var(--ink-soft)]">
          <SectionLabel>
            <span id="src-h">{t('sources')}</span>
          </SectionLabel>
          <ul className="space-y-1">
            {INDIA_EMERGENCY_CONTACTS.map((c) => (
              <li key={c.number}>
                {c.label} ({c.number}) —{' '}
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {new URL(c.sourceUrl).hostname}
                </a>
              </li>
            ))}
            {FACILITY_SOURCES.map((s) => (
              <li key={s.url}>
                {s.label} —{' '}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {new URL(s.url).hostname}
                </a>
              </li>
            ))}
            <li>Map tiles © OpenStreetMap contributors. Nearby places (when enabled) © Google Maps.</li>
          </ul>
        </section>
      </div>
      </PageBody>
    </PageShell>
  );
}
