'use client';

import type { RankedFacility } from '@sanjeevani/types';
import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '@/components/providers/app-provider';
import { km, minutes, specialtyLabel } from '@/lib/present';

function Yes({ value }: { value: boolean | null }) {
  const { t } = useApp();
  if (value === true) return <Check className="size-5 text-[var(--sage)]" aria-label="Yes" />;
  if (value === false) return <Minus className="size-5 text-[var(--ink-faint)]" aria-label="No" />;
  return <span className="text-sm text-[var(--ink-faint)]">{t('hoursUnknown')}</span>;
}

/** Side-by-side comparison of up to three facilities, as a real table for screen readers. */
export function CompareTable({ facilities, specialty }: { facilities: RankedFacility[]; specialty?: string }) {
  const { t, uiLanguage } = useApp();
  const rows: { label: string; render: (f: RankedFacility) => ReactNode }[] = [
    {
      label: t('byRoad'),
      render: (f) => (
        <span className="tabular-nums">
          {km(f.travel.distanceMeters)} {t('km')} · {f.travel.estimated ? `${t('approx')} ` : ''}
          {minutes(f.travel.durationSeconds)} {t('min')}
        </span>
      ),
    },
    { label: t('emergency24x7'), render: (f) => <Yes value={f.emergency24x7} /> },
    { label: t('openNow'), render: (f) => <Yes value={f.openNow} /> },
    ...(specialty
      ? [
          {
            label: specialtyLabel(specialty, uiLanguage),
            render: (f: RankedFacility) => <Yes value={f.verifiedSpecialties.includes(specialty as never) ? true : f.verifiedSpecialties.length ? false : null} />,
          },
        ]
      : []),
    { label: t('government'), render: (f) => <Yes value={f.ownership === null ? null : f.ownership === 'government'} /> },
    { label: t('source'), render: (f) => <span className="text-sm">{f.source.label}</span> },
  ];

  return (
    <div className="overflow-x-auto sv-card rounded-[var(--radius-lg)] border border-[var(--line)]">
      <table className="w-full min-w-[32rem] border-collapse text-left">
        <caption className="sr-only">{t('compare')}</caption>
        <thead>
          <tr className="border-b border-[var(--line)]">
            <td className="p-3" />
            {facilities.map((f) => (
              <th key={f.id} scope="col" className="p-3 align-bottom text-[0.95rem] font-bold text-[var(--ink)]">
                {f.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-[var(--line)] last:border-0">
              <th scope="row" className="p-3 text-sm font-semibold text-[var(--ink-soft)]">
                {row.label}
              </th>
              {facilities.map((f) => (
                <td key={f.id} className="p-3 text-[0.95rem] text-[var(--ink)]">
                  {row.render(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
