import type { ClinicalState } from '@sanjeevani/medical-safety';
import type {
  ClientLocation,
  ConversationPhase,
  EmergencyCategory,
  ExtractedSymptom,
  FacilitiesStatus,
  FacilityType,
  GeoPoint,
  Language,
  LanguagePreference,
  RankedFacility,
  Specialty,
  TraceStage,
  TriageResult,
  TurnResponse,
  Urgency,
} from '@sanjeevani/types';

export interface FacilityQuery {
  location: GeoPoint;
  facilityType: FacilityType;
  specialty: Specialty;
  urgency: Urgency;
  language: Language;
  limit: number;
}

export interface FacilityFinder {
  find(query: FacilityQuery): Promise<{ facilities: RankedFacility[]; status: FacilitiesStatus }>;
}

/** Everything the engine needs to remember between turns. Persisted encrypted. */
export interface ConversationMemory {
  language: Language | null;
  phase: ConversationPhase;
  clinical: ClinicalState;
  lastTriage: TriageResult | null;
  lastFacilities: RankedFacility[];
  lastEmergency: { category: EmergencyCategory; ruleIds: string[] } | null;
  turnCount: number;
}

export interface TurnInput {
  text: string;
  inputMode: 'voice' | 'text' | 'quick_reply';
  sttLanguage?: string;
  languagePreference: LanguagePreference;
  location?: ClientLocation;
  recentTurns: { role: 'user' | 'assistant'; text: string }[];
}

export type EngineResponse = Omit<TurnResponse, 'conversationId' | 'turnId'>;

export interface TurnOutcome {
  response: EngineResponse;
  memory: ConversationMemory;
  events: {
    emergency: { category: EmergencyCategory; ruleIds: string[] } | null;
    /** All symptoms known after this turn (rules + validated AI). */
    symptoms: ExtractedSymptom[];
    triage: TriageResult | null;
  };
  telemetry: {
    aiUnderstandingUsed: boolean;
    aiPhrasingUsed: boolean;
    aiError: string | null;
    guardViolations: string[];
    durationMs: number;
    /** Per-stage record of this turn, safe to show to the user. */
    trace: TraceStage[];
  };
}
