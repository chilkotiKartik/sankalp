'use client';

import type { RankedFacility } from '@sanjeevani/types';
import { Button, LinkButton, SectionLabel } from '@sanjeevani/ui';
import { Bookmark, BookmarkCheck, ExternalLink, Globe, MapPin, Navigation, Phone, RotateCcw, Share2, WifiOff } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/chrome';
import { PageBody, Skeleton } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { api } from '@/lib/api';
import { specialtyLabel, telHref } from '@/lib/present';
import { useResource } from '@/lib/use-resource';
import { ReasonPills, TravelLine } from './facility-card';

const FacilityMap = dynamic(() => import('./facility-map').then((m) => m.FacilityMap), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

export function FacilityDetails({ id }: { id: string }) {
  const { t, uiLanguage, location, toggleSaved, isSaved, prefs } = useApp();
  const toast = useToast();
  const params = useSearchParams();
  const specialty = params.get('specialty') ?? undefined;
  const { data, error, reload: load } = useResource(
    `facility:${id}:${location?.lat ?? ''}:${location?.lng ?? ''}:${uiLanguage}`,
    () => api.facility(id, { ...(location ? { lat: location.lat, lng: location.lng } : {}), language: uiLanguage }),
    t('somethingWrong'),
  );
  const facility: RankedFacility | null = data?.facility ?? null;

  const share = async () => {
    if (!facility) return;
    const text = t('shareText', { name: facility.name, address: facility.address });
    try {
      if (navigator.share) {
        await navigator.share({ title: facility.name, text, url: facility.mapsUrl });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${facility.mapsUrl}`);
      toast(t('copied'));
    } catch {
      /* share sheet dismissed */
    }
  };

  const saved = facility ? isSaved(facility.id) : false;
  const phone = facility?.emergencyPhone ?? facility?.phone ?? null;

  return (
    <PageShell title={facility?.name ?? t('details')} backHref="/care">
      <PageBody>
      {error && (
        <div role="alert" className="space-y-3 rounded-[var(--radius-lg)] bg-[var(--u-urgent-soft)] p-4">
          <p>{error}</p>
          <Button variant="secondary" onClick={load} icon={<RotateCcw className="size-4" aria-hidden />}>
            {t('retry')}
          </Button>
        </div>
      )}
      {!facility && !error && <div aria-busy="true" className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>}

      {facility && (
        <article className="space-y-6">
          <header className="space-y-2">
            <h2 className="font-display text-[2.05rem] leading-[1.1] tracking-[-0.02em] text-balance text-[var(--ink)]">{facility.name}</h2>
            {location && <TravelLine facility={facility} />}
            <ReasonPills facility={facility} {...(specialty ? { specialty } : {})} max={5} />
          </header>

          {/*
            Map tiles are the heaviest thing on this screen by far. In data saver the
            same information is given as text plus a link out, which costs nothing and
            still gets the person there.
          */}
          {prefs.dataSaver ? (
            <section className="sv-card rounded-[var(--radius-lg)] border border-[var(--line)] p-4">
              <p className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
                <WifiOff className="size-4 shrink-0" aria-hidden /> {t('dataSaverOn')}
              </p>
              <p className="mt-2 text-[var(--ink)]">{facility.address}</p>
              <a
                href={facility.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sv-press mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line)] px-4 font-semibold text-[var(--ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
              >
                <MapPin className="size-4" aria-hidden /> {t('openInMaps')}
              </a>
            </section>
          ) : (
            <>
              <FacilityMap
                facility={facility}
                origin={location}
                polyline={facility.travel.polyline}
                labels={{ you: t('yourLocation') }}
              />
              {location && !facility.travel.polyline && <p className="-mt-4 text-sm text-[var(--ink-faint)]">{t('routeApprox')}</p>}
            </>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <LinkButton href={facility.directionsUrl} target="_blank" rel="noopener noreferrer" size="lg" icon={<Navigation className="size-5" aria-hidden />} className="col-span-2">
              {t('directions')}
            </LinkButton>
            {phone ? (
              <LinkButton href={telHref(phone)} variant="secondary" size="lg" icon={<Phone className="size-5" aria-hidden />}>
                {t('call')}
              </LinkButton>
            ) : (
              <span />
            )}
            <Button variant="secondary" size="lg" onClick={share} icon={<Share2 className="size-5" aria-hidden />}>
              {t('share')}
            </Button>
          </div>

          <dl className="divide-y divide-[var(--line)] sv-card overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)]">
            <div className="flex gap-3 p-4">
              <MapPin className="mt-0.5 size-5 shrink-0 text-[var(--ink-faint)]" aria-hidden />
              <div>
                <dt className="text-sm text-[var(--ink-faint)]">{t('address')}</dt>
                <dd className="text-[var(--ink)]">{facility.address}</dd>
                {facility.coordinatesApproximate && <dd className="mt-1 text-sm text-[var(--ink-faint)]">{t('coordinatesApprox')}</dd>}
              </div>
            </div>
            {facility.phone && (
              <div className="flex gap-3 p-4">
                <Phone className="mt-0.5 size-5 shrink-0 text-[var(--ink-faint)]" aria-hidden />
                <div>
                  <dt className="text-sm text-[var(--ink-faint)]">{t('call')}</dt>
                  <dd>
                    <a href={telHref(facility.phone)} className="font-semibold text-[var(--ink)] underline-offset-4 hover:underline">
                      {facility.phone}
                    </a>
                    {facility.emergencyPhone && (
                      <>
                        {' · '}
                        <a href={telHref(facility.emergencyPhone)} className="font-semibold text-[var(--u-emergency)] underline-offset-4 hover:underline">
                          {t('callEmergencyLine')}: {facility.emergencyPhone}
                        </a>
                      </>
                    )}
                  </dd>
                </div>
              </div>
            )}
            {facility.website && (
              <div className="flex gap-3 p-4">
                <Globe className="mt-0.5 size-5 shrink-0 text-[var(--ink-faint)]" aria-hidden />
                <div>
                  <dt className="text-sm text-[var(--ink-faint)]">{t('website')}</dt>
                  <dd>
                    <a href={facility.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-[var(--sage)] underline-offset-4 hover:underline">
                      {new URL(facility.website).hostname.replace(/^www\./, '')} <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </dd>
                </div>
              </div>
            )}
          </dl>

          <section aria-labelledby="depts">
            <SectionLabel>
              <span id="depts">{t('departments')}</span>
            </SectionLabel>
            {facility.verifiedSpecialties.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {facility.verifiedSpecialties.map((s) => (
                  <li
                    key={s}
                    className={
                      'rounded-full px-3 py-1.5 text-sm font-medium ' +
                      (s === specialty ? 'bg-[var(--sage)] text-[var(--paper-raised)]' : 'bg-[var(--paper-sunk)] text-[var(--ink)]')
                    }
                  >
                    {specialtyLabel(s, uiLanguage)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[var(--ink-soft)]">{t('departmentsUnknown')}</p>
            )}
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 text-sm text-[var(--ink-faint)]">
            <p>
              {t('source')}:{' '}
              {facility.source.url ? (
                <a href={facility.source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {facility.source.label}
                </a>
              ) : (
                facility.source.label
              )}
              {facility.source.verifiedOn && ` · ${t('verifiedOn', { date: facility.source.verifiedOn })}`}
              {' · '}
              <a href={facility.mapsUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {t('openInMaps')}
              </a>
            </p>
            <button
              type="button"
              aria-pressed={saved}
              onClick={() => toast(toggleSaved(facility) ? t('saved') : t('removed'))}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--line)] px-4 font-semibold text-[var(--ink)] hover:border-[var(--line-strong)]"
            >
              {saved ? <BookmarkCheck className="size-4 text-[var(--sage)]" aria-hidden /> : <Bookmark className="size-4" aria-hidden />}
              {saved ? t('saved') : t('save')}
            </button>
          </div>
          <p className="text-sm text-[var(--ink-faint)]">
            {t('disclaimer')}{' '}
            <Link href="/emergency" className="underline underline-offset-2">
              {t('otherNumbers')}
            </Link>
          </p>
        </article>
      )}
      </PageBody>
    </PageShell>
  );
}
