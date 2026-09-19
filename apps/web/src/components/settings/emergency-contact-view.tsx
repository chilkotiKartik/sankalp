'use client';

import { Button, SectionLabel } from '@sanjeevani/ui';
import { Lock, Trash2, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageShell } from '@/components/chrome';
import { PageBody, Stagger, StaggerItem } from '@/components/motion/primitives';
import { useApp } from '@/components/providers/app-provider';
import { useToast } from '@/components/providers/toast-provider';
import { normalisePhone } from '@/lib/storage';

const FIELD =
  'mt-1.5 min-h-12 w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--paper-raised)] px-3.5 text-[1.05rem] text-[var(--ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]';

/**
 * The one person to reach when something goes wrong.
 *
 * Deliberately device-local: a phone number is precisely the kind of detail that
 * should not travel to a server just to power a button. Nothing here is uploaded,
 * which also means it survives no account and syncs to no other device — a trade
 * the screen states plainly rather than hiding.
 */
export function EmergencyContactView() {
  const { t, prefs, updatePrefs } = useApp();
  const toast = useToast();
  const existing = prefs.emergencyContact;

  const [name, setName] = useState(existing?.name ?? '');
  const [relation, setRelation] = useState(existing?.relation ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('emergencyContactNameRequired'));
      return;
    }
    const normalised = normalisePhone(phone);
    if (!normalised) {
      setError(t('emergencyContactInvalid'));
      return;
    }
    setError(null);
    updatePrefs({
      emergencyContact: {
        name: trimmedName.slice(0, 60),
        phone: normalised,
        ...(relation.trim() ? { relation: relation.trim().slice(0, 40) } : {}),
      },
    });
    toast(t('emergencyContactSaved'));
  };

  const remove = () => {
    updatePrefs({ emergencyContact: null });
    setName('');
    setRelation('');
    setPhone('');
    setError(null);
    toast(t('emergencyContactRemoved'));
  };

  return (
    <PageShell title={t('emergencyContactTitle')}>
      <PageBody>
        <Stagger className="space-y-8">
          <StaggerItem>
            <p className="leading-relaxed text-[var(--ink-soft)]">{t('emergencyContactIntro')}</p>
          </StaggerItem>

          <StaggerItem as="section">
            <form onSubmit={save} className="space-y-4" noValidate>
              <div>
                <label htmlFor="ec-name" className="font-semibold text-[var(--ink)]">
                  {t('emergencyContactName')}
                </label>
                <input
                  id="ec-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={60}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor="ec-relation" className="font-semibold text-[var(--ink)]">
                  {t('emergencyContactRelation')}
                </label>
                <input
                  id="ec-relation"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value)}
                  maxLength={40}
                  className={FIELD}
                />
              </div>

              <div>
                <label htmlFor="ec-phone" className="font-semibold text-[var(--ink)]">
                  {t('emergencyContactPhone')}
                </label>
                <input
                  id="ec-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={24}
                  aria-describedby={error ? 'ec-error' : undefined}
                  aria-invalid={Boolean(error)}
                  className={FIELD}
                />
              </div>

              {error && (
                <p id="ec-error" role="alert" className="text-[var(--u-emergency)]">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" icon={<UserRound className="size-5" aria-hidden />} className="w-full">
                {t('emergencyContactSave')}
              </Button>
            </form>
          </StaggerItem>

          {existing && (
            <StaggerItem as="section">
              <SectionLabel>
                <span>{t('emergencyContactTitle')}</span>
              </SectionLabel>
              <div className="sv-card mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--line)] p-4">
                <div className="min-w-0">
                  <p className="font-bold text-[var(--ink)]">
                    {existing.name}
                    {existing.relation && <span className="font-normal text-[var(--ink-soft)]"> · {existing.relation}</span>}
                  </p>
                  <p className="text-[var(--ink-soft)] tabular-nums">{existing.phone}</p>
                </div>
                <button
                  type="button"
                  onClick={remove}
                  className="sv-press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 font-semibold text-[var(--u-emergency)] hover:bg-[var(--u-emergency-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus)]"
                >
                  <Trash2 className="size-4" aria-hidden /> {t('emergencyContactRemove')}
                </button>
              </div>
            </StaggerItem>
          )}

          <StaggerItem>
            <p className="flex gap-2.5 text-sm leading-relaxed text-[var(--ink-faint)]">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('contactPrivacyNote')}
            </p>
          </StaggerItem>
        </Stagger>
      </PageBody>
    </PageShell>
  );
}
