'use client';

import { FACILITY_TYPES, SPECIALTIES, URGENCY_LEVELS } from '@sanjeevani/types/constants';
import type { FacilityType, RankedFacility, Specialty, Urgency } from '@sanjeevani/types';
import { Button, Chip, SectionLabel } from '@sanjeevani/ui';
import { Info, RotateCcw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PageShell } from '@/components/chrome';
import { PageBody, Skeleton, Stagger, StaggerItem } from '@/components/motion/primitives';
import { LocationPrompt } from '@/components/location-prompt';
import { useApp } from '@/components/providers/app-provider';
import { api } from '@/lib/api';
import { specialtyLabel } from '@/lib/present';
import { useResource } from '@/lib/use-resource';
import { CompareTable } from './compare-table';
import { FacilityCard } from './facility-card';

type Status = 'idle' | 'loading' | 'ready' | 'error';

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const FILTERS: { type: FacilityType; specialty: Specialty; urgency: Urgency; key: 'hospital' | 'emergency' | 'pediatrics' | 'women' }[] = [
  { key: 'hospital', type: 'hospital', specialty: 'general_medicine', urgency: 'routine' },
  { key: 'emergency', type: 'emergency_department', specialty: 'emergency_medicine', urgency: 'emergency' },
  { key: 'pediatrics', type: 'hospital', specialty: 'pediatrics', urgency: 'routine' },
  { key: 'women', type: 'hospital', specialty: 'obstetrics_gynecology', urgency: 'routine' },
];

export function NearbyCare() {
  const params = useSearchParams();
  const { t, uiLanguage, location, capabilities, saved } = useApp();
  const [query, setQuery] = useState(() => ({
    type: pick<FacilityType>(params.get('type'), FACILITY_TYPES, 'hospital'),
    specialty: pick<Specialty>(params.get('specialty'), SPECIALTIES, 'general_medicine'),
    urgency: pick<Urgency>(params.get('urgency'), URGENCY_LEVELS, 'routine'),
  }));
  const [selected, setSelected] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);

  const resource = useResource(
    location ? JSON.stringify([location.lat, location.lng, query, uiLanguage]) : null,
    () =>
      api.facilities({
        lat: location!.lat,
        lng: location!.lng,
        type: query.type === 'clinic' ? 'hospital' : query.type,
        specialty: query.specialty,
        urgency: query.urgency,
        limit: 8,
        language: uiLanguage,
      }),
    t('mapsUnavailable'),
  );
  const load = resource.reload;
  const facilities: RankedFacility[] = resource.data?.facilities ?? [];
  const attribution = resource.data?.attribution ?? '';
  const status: Status = resource.loading ? 'loading' : resource.error ? 'error' : resource.data ? 'ready' : 'idle';
  const error = resource.error ?? (resource.data?.status === 'unavailable' ? t('mapsUnavailable') : null);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-3)));
  };
  const compared = facilities.filter((f) => selected.includes(f.id));
  const filterLabel: Record<(typeof FILTERS)[number]['key'], string> = {
    hospital: specialtyLabel('general_medicine', uiLanguage),
    emergency: t('emergency24x7'),
    pediatrics: specialtyLabel('pediatrics', uiLanguage),
    women: specialtyLabel('obstetrics_gynecology', uiLanguage),
  };

  return (
    <PageShell title={t('nearbyCare')} wide>
      <PageBody>
      {!location ? (
        <LocationPrompt />
      ) : (
        <div className="space-y-5">
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex gap-2" role="group" aria-label={t('nearbyCare')}>
              {FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  selected={query.type === f.type && query.specialty === f.specialty}
                  onClick={() => {
                    setSelected([]);
                    setComparing(false);
                    setQuery({ type: f.type, specialty: f.specialty, urgency: f.urgency });
                  }}
                  className="shrink-0"
                >
                  {filterLabel[f.key]}
                </Chip>
              ))}
            </div>
          </div>

          {location.origin === 'demo' && capabilities && (
            <p className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
              <Info className="size-4 shrink-0" aria-hidden /> {t('demoLocationNote', { label: capabilities.region.demoLocationLabel })}
            </p>
          )}

          {status === 'loading' && (
            <ul className="grid gap-3 md:grid-cols-2" aria-busy="true" aria-label={t('loading')}>
              {[0, 1, 2, 3].map((i) => (
                <li key={i}>
                  <Skeleton className="h-36" />
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--u-urgent-soft)] p-4 text-[var(--ink)]">
              <span>{error}</span>
              <Button variant="secondary" onClick={load} icon={<RotateCcw className="size-4" aria-hidden />}>
                {t('retry')}
              </Button>
            </div>
          )}

          {status === 'ready' && facilities.length === 0 && !error && (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] p-6 text-center text-[var(--ink-soft)]">{t('noResults')}</p>
          )}

          {status === 'ready' && facilities.length > 0 && (
            <>
              {selected.length >= 2 && (
                <div className="sticky top-16 z-10 flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--ink)] px-4 py-2 text-[var(--paper)] shadow-[var(--shadow-lift)]">
                  <span className="text-sm font-semibold">{t('compareSelected', { n: selected.length })}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSelected([])} className="min-h-11 px-3 text-sm underline">
                      {t('clearCompare')}
                    </button>
                    <button type="button" onClick={() => setComparing((c) => !c)} className="min-h-11 rounded-full bg-[var(--paper)] px-4 text-sm font-bold text-[var(--ink)]">
                      {t('compare')}
                    </button>
                  </div>
                </div>
              )}
              {comparing && compared.length >= 2 && <CompareTable facilities={compared} specialty={query.specialty} />}
              <Stagger as="ol" className="grid gap-3 md:grid-cols-2">
                {facilities.map((f, i) => (
                  <StaggerItem as="li" key={f.id}>
                    <FacilityCard
                      facility={f}
                      rank={i + 1}
                      specialty={query.specialty}
                      selectable
                      selected={selected.includes(f.id)}
                      onSelect={() => toggle(f.id)}
                    />
                  </StaggerItem>
                ))}
              </Stagger>
              <div className="space-y-1 text-sm text-[var(--ink-faint)]">
                <p>
                  <span className="font-semibold text-[var(--ink-soft)]">{t('howRanked')}:</span> {t('rankingExplainer')}
                </p>
                <p>{facilities.some((f) => f.travel.estimated) ? t('estimatedTravel') : t('liveTravel')}</p>
                {attribution && <p>{attribution}</p>}
              </div>
            </>
          )}
        </div>
      )}

      {saved.length > 0 && (
        <section className="mt-10" aria-labelledby="saved-title">
          <SectionLabel>
            <span id="saved-title">{t('savedPlaces')}</span>
          </SectionLabel>
          <ul className="mt-3 divide-y divide-[var(--line)] sv-card overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
            {saved.map((s) => (
              <li key={s.id}>
                <a href={`/care/${encodeURIComponent(s.id)}`} className="block min-h-14 px-4 py-3 hover:bg-[var(--paper-sunk)]">
                  <span className="block font-semibold text-[var(--ink)]">{s.name}</span>
                  <span className="block truncate text-sm text-[var(--ink-soft)]">{s.address}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      </PageBody>
    </PageShell>
  );
}
