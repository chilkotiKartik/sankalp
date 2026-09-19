'use client';

import { Button } from '@sanjeevani/ui';
import { LocateFixed, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from './providers/app-provider';

/** Inline, non-blocking permission request — explains why before the browser asks. */
export function LocationPrompt({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { t, requestLocation, applyDemoLocation, locationStatus, capabilities } = useApp();
  const demoLabel = capabilities?.region.demoLocationLabel ?? 'Gurugram';
  const requesting = locationStatus === 'requesting';

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      aria-labelledby="loc-title"
      className="sv-card rounded-[var(--radius-lg)] border border-[var(--line)] p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--sage-soft)] text-[var(--sage)]">
          <MapPin className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="loc-title" className="font-bold text-[var(--ink)]">
            {t('locationTitle')}
          </h2>
          {!compact && <p className="mt-0.5 text-sm text-[var(--ink-soft)]">{t('locationWhy')}</p>}
          {(locationStatus === 'denied' || locationStatus === 'unavailable') && (
            <p role="status" className="mt-1.5 text-sm font-medium text-[var(--u-urgent)]">
              {t('locationDenied')}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          icon={<LocateFixed className="size-4" aria-hidden />}
          disabled={requesting}
          onClick={async () => {
            const loc = await requestLocation();
            if (loc) onDone?.();
          }}
        >
          {requesting ? t('sharingLocation') : t('shareLocation')}
        </Button>
        {capabilities?.demoMode && (
          <Button
            variant="secondary"
            onClick={() => {
              if (applyDemoLocation()) onDone?.();
            }}
          >
            {t('useDemoLocation', { label: demoLabel })}
          </Button>
        )}
      </div>
    </motion.section>
  );
}
