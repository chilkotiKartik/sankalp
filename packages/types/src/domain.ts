import { z } from 'zod';
import {
  AGE_GROUPS,
  EMERGENCY_CATEGORIES,
  FACILITY_TYPES,
  LANGUAGES,
  SEVERITIES,
  SPECIALTIES,
  SYMPTOM_CODES,
  URGENCY_LEVELS,
} from './constants';

// Re-exported so server-side code can keep importing everything from one place.
export * from './constants';

/** Conversational languages. "hinglish" is Hindi written/spoken with Latin script and English mixing. */
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;

/** Ordered from least to most urgent — index comparison is meaningful. */
export const urgencySchema = z.enum(URGENCY_LEVELS);
export type Urgency = z.infer<typeof urgencySchema>;

export const facilityTypeSchema = z.enum(FACILITY_TYPES);
export type FacilityType = z.infer<typeof facilityTypeSchema>;

export const specialtySchema = z.enum(SPECIALTIES);
export type Specialty = z.infer<typeof specialtySchema>;

export const symptomCodeSchema = z.enum(SYMPTOM_CODES);
export type SymptomCode = z.infer<typeof symptomCodeSchema>;

export const severitySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

export const ageGroupSchema = z.enum(AGE_GROUPS);
export type AgeGroup = z.infer<typeof ageGroupSchema>;

export const emergencyCategorySchema = z.enum(EMERGENCY_CATEGORIES);
export type EmergencyCategory = z.infer<typeof emergencyCategorySchema>;

export const extractedSymptomSchema = z.object({
  code: symptomCodeSchema,
  severity: severitySchema.default('unknown'),
  /** Matched phrase in the user's own words — kept short, never stored raw in the DB. */
  evidence: z.string().max(80).optional(),
});
export type ExtractedSymptom = z.infer<typeof extractedSymptomSchema>;

export const durationSchema = z.object({
  hours: z.number().nonnegative().max(24 * 365 * 5).nullable(),
  text: z.string().max(60),
});
export type Duration = z.infer<typeof durationSchema>;

export const confidenceSchema = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof confidenceSchema>;

export const triageResultSchema = z.object({
  urgency: urgencySchema,
  emergency: z.boolean(),
  emergencyCategory: emergencyCategorySchema.nullable(),
  symptoms: z.array(extractedSymptomSchema),
  duration: durationSchema.nullable(),
  ageGroup: ageGroupSchema,
  language: languageSchema,
  recommendedAction: z.string(),
  requiredFacilityType: facilityTypeSchema,
  specialty: specialtySchema,
  followUpQuestions: z.array(z.string()),
  careAdvice: z.array(z.string()),
  warningSigns: z.array(z.string()),
  /** Machine-readable rule identifiers that contributed — shown in the "why" panel. */
  rationale: z.array(z.string()),
  /**
   * Red-flag screens that were asked and answered "no". Worth carrying because a
   * clinician reading the care card learns as much from what has been excluded as
   * from what was reported.
   *
   * Defaulted, because conversations stored before this field existed are still
   * read back and must parse rather than throw.
   */
  ruledOut: z.array(z.string()).default([]),
  confidence: confidenceSchema,
  source: z.enum(['rules', 'rules+ai']),
});
export type TriageResult = z.infer<typeof triageResultSchema>;

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

export const facilitySourceSchema = z.object({
  provider: z.enum(['google_places', 'curated_directory']),
  label: z.string(),
  url: z.string().url().optional(),
  verifiedOn: z.string().optional(),
});
export type FacilitySource = z.infer<typeof facilitySourceSchema>;

export const facilitySchema = z.object({
  id: z.string(),
  placeId: z.string().nullable(),
  name: z.string(),
  address: z.string(),
  location: geoPointSchema,
  coordinatesApproximate: z.boolean(),
  phone: z.string().nullable(),
  emergencyPhone: z.string().nullable(),
  types: z.array(facilityTypeSchema),
  /** Only specialties confirmed by the data source. Empty means "unknown", not "none". */
  verifiedSpecialties: z.array(specialtySchema),
  emergency24x7: z.boolean().nullable(),
  openNow: z.boolean().nullable(),
  ownership: z.enum(['government', 'private']).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  userRatingCount: z.number().int().nonnegative().nullable(),
  mapsUrl: z.string().url(),
  website: z.string().url().nullable(),
  source: facilitySourceSchema,
});
export type Facility = z.infer<typeof facilitySchema>;

export const travelEstimateSchema = z.object({
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  /** true when computed from straight-line distance rather than a routing engine. */
  estimated: z.boolean(),
  source: z.enum(['google_routes', 'haversine_estimate']),
  polyline: z.string().optional(),
});
export type TravelEstimate = z.infer<typeof travelEstimateSchema>;

export const rankingFactorsSchema = z.object({
  relevance: z.number().min(0).max(1),
  distance: z.number().min(0).max(1),
  operational: z.number().min(0).max(1),
  service: z.number().min(0).max(1),
});
export type RankingFactors = z.infer<typeof rankingFactorsSchema>;

export const reasonCodeSchema = z.enum([
  'has_24x7_emergency',
  'open_now',
  'closed_now',
  'hours_unknown',
  'specialty_verified',
  'specialty_unverified',
  'general_hospital',
  'government_hospital',
  'closest_option',
  'short_travel',
  'highly_rated',
]);
export type ReasonCode = z.infer<typeof reasonCodeSchema>;

export const rankedFacilitySchema = facilitySchema.extend({
  straightLineMeters: z.number().nonnegative(),
  travel: travelEstimateSchema,
  score: z.number(),
  factors: rankingFactorsSchema,
  reasons: z.array(reasonCodeSchema),
  directionsUrl: z.string().url(),
});
export type RankedFacility = z.infer<typeof rankedFacilitySchema>;

export const emergencyContactSchema = z.object({
  number: z.string(),
  label: z.string(),
  description: z.string(),
  sourceUrl: z.string().url(),
  primary: z.boolean(),
});
export type EmergencyContact = z.infer<typeof emergencyContactSchema>;
