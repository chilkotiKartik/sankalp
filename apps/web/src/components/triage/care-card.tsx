'use client';

import type { TriageResult } from '@sanjeevani/types';
import { Button } from '@sanjeevani/ui';
import { Printer, Share2 } from 'lucide-react';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { durationLabel, formatDate, ruledOutText, specialtyLabel, symptomLabel } from '@/lib/present';

/** One labelled line of the card. Declared outside the component so it keeps its identity. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-[var(--line)] py-2.5 last:border-b-0">
      <dt className="w-[42%] shrink-0 text-sm text-[var(--ink-faint)]">{label}</dt>
      <dd className="min-w-0 flex-1 font-semibold text-[var(--ink)]">{value}</dd>
    </div>
  );
}

/**
 * The care card — something to hand across a hospital desk.
 *
 * At a busy OPD the first exchange is always the same: what is wrong, since when,
 * for whom. Someone unwell, or speaking a second language, or holding a crying
 * child, does that badly. This card answers it on paper in a fixed order.
 *
 * Two things make it honest. It states in its own body that it is not a diagnosis
 * and asks the clinician to examine independently. And it lists what was already
 * *excluded* — the red-flag questions answered "no" — because that is the part a
 * clinician cannot recover from a summary and would otherwise have to re-ask.
 *
 * It prints in black on white via the `sv-print-card` rules in globals.css, so a
 * phone hooked to any printer produces something readable.
 */
export function CareCard({ triage, preparedAt }: { triage: TriageResult; preparedAt: string }) {
  const { t, uiLanguage } = useApp();
  const toast = useToast();

  const symptoms = triage.symptoms.map((s) => symptomLabel(s.code, uiLanguage)).join(', ');
  const duration = durationLabel(triage.duration?.hours, uiLanguage);
  const excluded = (triage.ruledOut ?? []).map((id) => ruledOutText(id, uiLanguage)).filter((x): x is string => Boolean(x));

  /** Plain text, so it survives WhatsApp, SMS and a paste into any records system. */
  const asText = [
    `${t('cardShareIntro')} — ${formatDate(preparedAt, uiLanguage)}`,
    `${t('careCardFor')}: ${t(`age_${triage.ageGroup}`)}`,
    `${t('careCardSymptoms')}: ${symptoms || '—'}`,
    duration ? `${t('careCardDuration')}: ${duration}` : null,
    `${t('careCardUrgency')}: ${t(`urgency_${triage.urgency}`)}`,
    `${t('careCardDepartment')}: ${specialtyLabel(triage.specialty, uiLanguage)}`,
    excluded.length ? `${t('careCardRuledOut')}: ${excluded.join('; ')}` : null,
    triage.warningSigns.length ? `${t('careCardWatch')}: ${triage.warningSigns.join('; ')}` : null,
    '',
    t('careCardNotDiagnosis'),
  ]
    .filter(Boolean)
    .join('\n');

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: t('careCard'), text: asText });
        return;
      }
      await navigator.clipboard.writeText(asText);
      toast(t('copied'));
    } catch {
      /* the share sheet was dismissed — nothing to report */
    }
  };

  return (
    <div className="space-y-4">
      <article className="sv-print-card sv-card rounded-[var(--radius-lg)] border border-[var(--line)] p-5">
        <header className="border-b-2 border-[var(--ink)] pb-3">
          <h2 className="font-display text-[1.6rem] leading-tight text-[var(--ink)]">{t('careCard')}</h2>
          <p className="text-[var(--ink-soft)]">{t('careCardSub')}</p>
        </header>

        <dl className="mt-3">
          <Row label={t('careCardWhen')} value={formatDate(preparedAt, uiLanguage)} />
          <Row label={t('careCardFor')} value={t(`age_${triage.ageGroup}`)} />
          <Row label={t('careCardSymptoms')} value={symptoms || '—'} />
          {duration && <Row label={t('careCardDuration')} value={duration} />}
          <Row label={t('careCardUrgency')} value={t(`urgency_${triage.urgency}`)} />
          <Row label={t('careCardDepartment')} value={specialtyLabel(triage.specialty, uiLanguage)} />
        </dl>

        {excluded.length > 0 && (
          <section className="mt-4">
            <h3 className="text-[0.78rem] font-bold tracking-[0.12em] text-[var(--ink-faint)] uppercase">{t('careCardRuledOut')}</h3>
            <ul className="mt-1.5 space-y-1">
              {excluded.map((item) => (
                <li key={item} className="text-[0.95rem] text-[var(--ink)]">
                  — {item}
                </li>
              ))}
            </ul>
          </section>
        )}

        {triage.warningSigns.length > 0 && (
          <section className="mt-4">
            <h3 className="text-[0.78rem] font-bold tracking-[0.12em] text-[var(--ink-faint)] uppercase">{t('careCardWatch')}</h3>
            <ul className="mt-1.5 space-y-1">
              {triage.warningSigns.map((sign) => (
                <li key={sign} className="text-[0.95rem] text-[var(--ink)]">
                  — {sign}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-4 border-t border-[var(--line)] pt-3 text-sm leading-relaxed text-[var(--ink-soft)]">{t('careCardNotDiagnosis')}</p>
      </article>

      {/* Actions are excluded from the printed sheet. */}
      <div className="sv-no-print grid grid-cols-2 gap-2">
        <Button onClick={() => window.print()} size="lg" icon={<Printer className="size-5" aria-hidden />}>
          {t('print')}
        </Button>
        <Button variant="secondary" size="lg" onClick={share} icon={<Share2 className="size-5" aria-hidden />}>
          {t('shareCard')}
        </Button>
      </div>
    </div>
  );
}
