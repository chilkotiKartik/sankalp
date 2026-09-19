import type {
  Facility,
  FacilityType,
  RankedFacility,
  RankingFactors,
  ReasonCode,
  Specialty,
  TravelEstimate,
  Urgency,
} from '@sanjeevani/types';

export interface RankingContext {
  facilityType: FacilityType;
  specialty: Specialty;
  urgency: Urgency;
}

type Weights = Record<keyof RankingFactors, number>;

/**
 * Published weights — shown in docs and used in the "why this hospital" panel.
 * In an emergency, getting to a capable emergency department quickly dominates.
 */
export const RANKING_WEIGHTS: Record<Urgency, Weights> = {
  emergency: { distance: 0.55, operational: 0.25, relevance: 0.15, service: 0.05 },
  urgent: { distance: 0.4, operational: 0.25, relevance: 0.2, service: 0.15 },
  routine: { distance: 0.35, operational: 0.15, relevance: 0.2, service: 0.3 },
  self_care: { distance: 0.5, operational: 0.2, relevance: 0.2, service: 0.1 },
};

const isHospital = (f: Facility) => f.types.includes('hospital') || f.types.includes('emergency_department');

function relevanceScore(f: Facility, ctx: RankingContext): number {
  switch (ctx.facilityType) {
    case 'emergency_department':
      if (f.emergency24x7 === true || f.types.includes('emergency_department')) return 1;
      return isHospital(f) ? 0.6 : 0.1;
    case 'hospital':
      return isHospital(f) ? 1 : f.types.includes('clinic') ? 0.5 : 0.1;
    case 'clinic':
      return f.types.includes('clinic') ? 1 : isHospital(f) ? 0.8 : 0.2;
    case 'pharmacy':
      return f.types.includes('pharmacy') ? 1 : 0.1;
    case 'diagnostic_lab':
      return f.types.includes('diagnostic_lab') ? 1 : isHospital(f) ? 0.6 : 0.1;
  }
}

function operationalScore(f: Facility, ctx: RankingContext): number {
  const acute = ctx.urgency === 'emergency' || ctx.urgency === 'urgent';
  if (f.emergency24x7 === true) return 1;
  if (f.openNow === true) return acute ? 0.6 : 0.9;
  if (f.openNow === false) return 0.05;
  return 0.45;
}

function serviceScore(f: Facility, ctx: RankingContext): number {
  if (f.verifiedSpecialties.includes(ctx.specialty)) return 1;
  if (f.verifiedSpecialties.length > 0) return 0.3; // specialties known, and this one isn't listed
  const generalist = ctx.specialty === 'general_medicine' || ctx.specialty === 'emergency_medicine';
  return generalist && isHospital(f) ? 0.6 : 0.4;
}

function distanceScore(travel: TravelEstimate): number {
  const minutes = travel.durationSeconds / 60;
  return 1 / (1 + minutes / 15);
}

function reasonsFor(f: Facility, factors: RankingFactors, travel: TravelEstimate, ctx: RankingContext): ReasonCode[] {
  const reasons: ReasonCode[] = [];
  if (f.emergency24x7) reasons.push('has_24x7_emergency');
  if (f.openNow === true && !f.emergency24x7) reasons.push('open_now');
  if (f.openNow === false) reasons.push('closed_now');
  if (f.openNow === null && f.emergency24x7 !== true) reasons.push('hours_unknown');
  if (f.verifiedSpecialties.includes(ctx.specialty)) reasons.push('specialty_verified');
  else if (ctx.specialty !== 'emergency_medicine') reasons.push('specialty_unverified');
  if (f.ownership === 'government') reasons.push('government_hospital');
  if (travel.durationSeconds <= 15 * 60) reasons.push('short_travel');
  if ((f.rating ?? 0) >= 4.3 && (f.userRatingCount ?? 0) >= 200) reasons.push('highly_rated');
  if (factors.relevance >= 1 && isHospital(f) && ctx.facilityType !== 'emergency_department' && !reasons.includes('specialty_verified')) {
    reasons.push('general_hospital');
  }
  return reasons;
}

/** Hard filters: never send someone in an emergency to a clinic or a closed facility. */
export function isEligible(f: Facility, ctx: RankingContext): boolean {
  if (ctx.urgency === 'emergency') {
    if (!isHospital(f)) return false;
    if (f.openNow === false && f.emergency24x7 !== true) return false;
  }
  if (ctx.urgency === 'urgent' && f.openNow === false && f.emergency24x7 !== true) return false;
  if ((ctx.facilityType === 'hospital' || ctx.facilityType === 'emergency_department') && f.types.every((t) => t === 'pharmacy')) {
    return false;
  }
  return true;
}

export function rankFacilities(
  facilities: readonly Facility[],
  travel: readonly TravelEstimate[],
  straightLine: readonly number[],
  ctx: RankingContext,
  directionsFor: (f: Facility) => string,
): RankedFacility[] {
  const weights = RANKING_WEIGHTS[ctx.urgency];
  const ranked: RankedFacility[] = [];
  facilities.forEach((f, i) => {
    const t = travel[i];
    if (!t || !isEligible(f, ctx)) return;
    const factors: RankingFactors = {
      relevance: relevanceScore(f, ctx),
      distance: distanceScore(t),
      operational: operationalScore(f, ctx),
      service: serviceScore(f, ctx),
    };
    const ratingBonus = f.rating !== null && (f.userRatingCount ?? 0) >= 50 ? 0.03 * ((f.rating - 3) / 2) : 0;
    const score =
      factors.relevance * weights.relevance +
      factors.distance * weights.distance +
      factors.operational * weights.operational +
      factors.service * weights.service +
      ratingBonus;
    ranked.push({
      ...f,
      straightLineMeters: Math.round(straightLine[i] ?? 0),
      travel: t,
      score: Math.round(score * 1000) / 1000,
      factors: {
        relevance: round2(factors.relevance),
        distance: round2(factors.distance),
        operational: round2(factors.operational),
        service: round2(factors.service),
      },
      reasons: reasonsFor(f, factors, t, ctx),
      directionsUrl: directionsFor(f),
    });
  });

  ranked.sort((a, b) => b.score - a.score || a.travel.durationSeconds - b.travel.durationSeconds);
  const closest = [...ranked].sort((a, b) => a.travel.durationSeconds - b.travel.durationSeconds)[0];
  if (closest && ranked.length > 1) closest.reasons = [...new Set<ReasonCode>(['closest_option', ...closest.reasons])];
  return ranked;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
