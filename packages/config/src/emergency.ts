import type { EmergencyContact } from '@sanjeevani/types';

/**
 * Verified Indian emergency and health helplines.
 * Every entry links to the official page it was verified against — do not add
 * numbers here without an official source.
 */
export const INDIA_EMERGENCY_CONTACTS: readonly EmergencyContact[] = [
  {
    number: '112',
    label: 'Emergency (ERSS 112)',
    description: 'Single national emergency number — police, fire and ambulance.',
    sourceUrl: 'https://112.gov.in/about',
    primary: true,
  },
  {
    number: '108',
    label: 'Ambulance (Haryana)',
    description: 'State ambulance helpline listed by the Government of Haryana.',
    sourceUrl: 'https://www.haryana.gov.in/helpline/',
    primary: false,
  },
  {
    number: '14416',
    label: 'Tele-MANAS',
    description: '24×7 national mental health support line (Ministry of Health).',
    sourceUrl: 'https://telemanas.mohfw.gov.in/',
    primary: false,
  },
] as const;

export const PRIMARY_EMERGENCY_NUMBER = '112';
export const MENTAL_HEALTH_HELPLINE = '14416';
