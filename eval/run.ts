/**
 * Measures the triage engine against the labelled vignettes and prints a report.
 *
 *   npm run eval            # table + pass/fail
 *   npm run eval -- --json  # machine-readable, for CI artefacts
 *
 * Exits non-zero when a threshold in `vignettes.ts` is breached, so a change that
 * makes the engine less safe fails the build rather than shipping quietly.
 *
 * The engine runs with the deterministic provider and no facility lookup: this
 * measures the safety rules, not a model and not a maps key. That is deliberate —
 * the rules are the part that must hold when everything else is unavailable.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConversationEngine, DeterministicProvider, newConversationMemory, type ConversationMemory } from '@sanjeevani/ai';
import { urgencyRank, type Urgency } from '@sanjeevani/types';
import { THRESHOLDS, VIGNETTES, type Vignette } from './vignettes';

interface Outcome {
  vignette: Vignette;
  firedEmergency: boolean;
  category: string | null;
  urgency: Urgency | null;
  /** Populated when the case failed, explaining how. */
  failure: string | null;
  /** Over-triage is recorded but never fails the run. */
  overTriaged: boolean;
}

const engine = new ConversationEngine({
  llm: new DeterministicProvider(),
  // No location and no provider: facilities are irrelevant to what is being measured.
  facilities: { find: async () => ({ facilities: [], status: 'not_needed' as const }) },
  aiTimeoutMs: 1000,
});

async function runOne(vignette: Vignette): Promise<Outcome> {
  let memory: ConversationMemory = newConversationMemory();
  let firedEmergency = false;
  let category: string | null = null;
  let urgency: Urgency | null = null;

  for (const text of vignette.turns) {
    const outcome = await engine.handleTurn(memory, {
      text,
      inputMode: 'text',
      languagePreference: 'auto',
      recentTurns: [],
    });
    memory = outcome.memory;
    // An emergency anywhere in the exchange counts: escalation on a later turn is
    // still a catch, and that is how the red-flag screens are meant to work.
    if (outcome.response.emergency) {
      firedEmergency = true;
      category = outcome.response.emergency.category;
    }
    if (outcome.response.triage) urgency = outcome.response.triage.urgency;
  }

  let failure: string | null = null;
  let overTriaged = false;

  if (vignette.expectEmergency && !firedEmergency) {
    failure = 'MISSED EMERGENCY — the circuit breaker did not fire';
  } else if (!vignette.expectEmergency && firedEmergency) {
    failure = `FALSE ALARM — fired as ${category}`;
  } else if (vignette.expectEmergency && vignette.expectCategory && category !== vignette.expectCategory) {
    // The right escalation filed under the wrong heading: the person is still sent to
    // help, but the instructions shown are the wrong ones, so it is a real failure.
    failure = `WRONG CATEGORY — expected ${vignette.expectCategory}, got ${category}`;
  }

  if (!failure && vignette.minUrgency && urgency && urgencyRank(urgency) < urgencyRank(vignette.minUrgency)) {
    failure = `UNDER-TRIAGE — expected at least ${vignette.minUrgency}, got ${urgency}`;
  }
  if (!failure && vignette.maxReasonableUrgency && urgency && urgencyRank(urgency) > urgencyRank(vignette.maxReasonableUrgency)) {
    overTriaged = true;
  }

  return { vignette, firedEmergency, category, urgency, failure, overTriaged };
}

function pct(n: number, d: number): string {
  return d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`;
}

async function main() {
  const asJson = process.argv.includes('--json');
  const outcomes: Outcome[] = [];
  for (const vignette of VIGNETTES) outcomes.push(await runOne(vignette));

  const emergencies = outcomes.filter((o) => o.vignette.expectEmergency);
  const nonEmergencies = outcomes.filter((o) => !o.vignette.expectEmergency);

  const caught = emergencies.filter((o) => o.firedEmergency).length;
  const falseAlarms = nonEmergencies.filter((o) => o.firedEmergency).length;
  const wrongCategory = outcomes.filter((o) => o.failure?.startsWith('WRONG CATEGORY')).length;
  const underTriaged = outcomes.filter((o) => o.failure?.startsWith('UNDER-TRIAGE')).length;
  const overTriaged = outcomes.filter((o) => o.overTriaged).length;
  const failures = outcomes.filter((o) => o.failure);

  const recall = emergencies.length === 0 ? 1 : caught / emergencies.length;
  const falseAlarmRate = nonEmergencies.length === 0 ? 0 : falseAlarms / nonEmergencies.length;

  const report = {
    generatedAt: new Date().toISOString(),
    totals: { cases: outcomes.length, emergencies: emergencies.length, nonEmergencies: nonEmergencies.length },
    emergencyDetection: { caught, missed: emergencies.length - caught, recall, wrongCategory },
    falseAlarms: { count: falseAlarms, rate: falseAlarmRate },
    urgency: { underTriaged, overTriaged },
    byLanguage: (['en', 'hi', 'hinglish'] as const).map((language) => {
      const forLanguage = outcomes.filter((o) => o.vignette.language === language);
      return { language, cases: forLanguage.length, failures: forLanguage.filter((o) => o.failure).length };
    }),
    failures: failures.map((o) => ({ id: o.vignette.id, failure: o.failure })),
    thresholds: THRESHOLDS,
  };

  const breaches: string[] = [];
  if (recall < THRESHOLDS.minEmergencyRecall) {
    breaches.push(`emergency recall ${pct(caught, emergencies.length)} is below the required ${pct(THRESHOLDS.minEmergencyRecall, 1)}`);
  }
  if (falseAlarmRate > THRESHOLDS.maxFalseAlarmRate) {
    breaches.push(`false-alarm rate ${pct(falseAlarms, nonEmergencies.length)} exceeds the ceiling ${pct(THRESHOLDS.maxFalseAlarmRate, 1)}`);
  }
  if (underTriaged > THRESHOLDS.maxUnderTriage) {
    breaches.push(`${underTriaged} case(s) under-triaged; the limit is ${THRESHOLDS.maxUnderTriage}`);
  }
  if (wrongCategory > 0) breaches.push(`${wrongCategory} emergency case(s) filed under the wrong category`);

  writeFileSync(resolve(import.meta.dirname, 'report.json'), JSON.stringify({ ...report, breaches }, null, 2));

  if (asJson) {
    console.log(JSON.stringify({ ...report, breaches }, null, 2));
  } else {
    const bold = (s: string) => `\u001b[1m${s}\u001b[0m`;
    const green = (s: string) => `\u001b[32m${s}\u001b[0m`;
    const red = (s: string) => `\u001b[31m${s}\u001b[0m`;
    const yellow = (s: string) => `\u001b[33m${s}\u001b[0m`;
    const dim = (s: string) => `\u001b[2m${s}\u001b[0m`;

    console.log(bold('\n  Triage evaluation\n'));
    console.log(`  ${outcomes.length} cases — ${emergencies.length} emergencies, ${nonEmergencies.length} not\n`);

    console.log(bold('  Emergency detection'));
    console.log(`    caught              ${caught}/${emergencies.length}   ${pct(caught, emergencies.length)}`);
    console.log(`    ${emergencies.length - caught > 0 ? red('missed') : 'missed'}              ${emergencies.length - caught}`);
    console.log(`    wrong category      ${wrongCategory}\n`);

    console.log(bold('  False alarms'));
    console.log(`    fired wrongly       ${falseAlarms}/${nonEmergencies.length}   ${pct(falseAlarms, nonEmergencies.length)}\n`);

    console.log(bold('  Urgency'));
    console.log(`    ${underTriaged > 0 ? red('under-triaged') : 'under-triaged'}       ${underTriaged}   ${dim('(dangerous)')}`);
    console.log(`    ${overTriaged > 0 ? yellow('over-triaged') : 'over-triaged'}        ${overTriaged}   ${dim('(costly, tolerated)')}\n`);

    console.log(bold('  By language'));
    for (const row of report.byLanguage) {
      console.log(`    ${row.language.padEnd(9)} ${row.cases} cases, ${row.failures} failing`);
    }

    if (failures.length > 0) {
      console.log(bold(red('\n  Failures')));
      for (const o of failures) console.log(`    ${o.vignette.id}\n      ${o.failure}\n      ${dim(o.vignette.note)}`);
    }

    console.log();
    if (breaches.length === 0) {
      console.log(`  ${green('✓')} all thresholds met\n`);
    } else {
      console.log(`  ${red('✗')} thresholds breached:`);
      for (const b of breaches) console.log(`      ${b}`);
      console.log();
    }
    console.log(dim('  These are engineering regression cases, not a clinical gold standard.'));
    console.log(dim('  See eval/vignettes.ts for what that means.\n'));
  }

  process.exit(breaches.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error('Evaluation failed to run:', error);
  process.exit(1);
});
