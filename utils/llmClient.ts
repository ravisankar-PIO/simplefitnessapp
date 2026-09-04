import { getApiKey } from './secureSettings';
import { loadSettings } from './settingsStorage';
import { buildGeneratePrompt, buildRefinePrompt, buildCoachNotePrompt } from './promptTemplates';
import { ExportedWorkout } from './workoutSharingUtils';

const PROVIDER_ENDPOINTS: Record<string, string> = {
  groq: 'https://api.groq.com/openai/v1/chat/completions',
};

const DEFAULT_MODEL: Record<string, string> = {
  groq: 'llama-3.3-70b-versatile',
};

// Settings screens should derive their provider dropdown from Object.keys(PROVIDER_ENDPOINTS)
// rather than hand-maintaining a separate list, so the two can't drift out of sync.
export const SUPPORTED_PROVIDERS = Object.keys(PROVIDER_ENDPOINTS);

const REQUEST_TIMEOUT_MS = 30000;

export class LLMAuthError extends Error {
  constructor(message = "Groq rejected your API key — check it in Settings.") {
    super(message);
    this.name = 'LLMAuthError';
  }
}

export class LLMRateLimitError extends Error {
  retryAfterSeconds: number | null;
  constructor(retryAfterSeconds: number | null = null) {
    super(
      retryAfterSeconds
        ? `Groq's free-tier rate limit was hit — try again in ${retryAfterSeconds}s.`
        : "Groq's free-tier rate limit was hit — try again in a bit."
    );
    this.name = 'LLMRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class LLMNetworkError extends Error {
  constructor(message = "Couldn't reach the AI service — check your connection and try again.") {
    super(message);
    this.name = 'LLMNetworkError';
  }
}

export class LLMSchemaError extends Error {
  constructor(message = "The AI's response wasn't a usable workout plan, even after retrying — try again, or adjust your request.") {
    super(message);
    this.name = 'LLMSchemaError';
  }
}

export type LLMError = LLMAuthError | LLMRateLimitError | LLMNetworkError | LLMSchemaError;

// Plain function, not a hook — this codebase has no shared error/toast pattern
// anywhere else, every screen calls Alert.alert (or similar) directly. Screens call
// this to get copy, then display it however that screen already displays errors.
export const getUserFacingErrorMessage = (error: unknown): string => {
  if (
    error instanceof LLMAuthError ||
    error instanceof LLMRateLimitError ||
    error instanceof LLMNetworkError ||
    error instanceof LLMSchemaError
  ) {
    return error.message;
  }
  return "Something went wrong talking to the AI service — try again.";
};

const callLLM = async (prompt: string): Promise<string> => {
  const settings = await loadSettings();
  const provider = settings?.aiProvider || 'groq';
  const model = settings?.aiModel || DEFAULT_MODEL[provider];
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('No API key configured. Add one in Settings.');

  const endpoint = PROVIDER_ENDPOINTS[provider];
  if (!endpoint) throw new Error(`Unsupported provider: ${provider}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.4 }),
      signal: controller.signal,
    });
  } catch (error: any) {
    // A timeout abort is a distinct signal from "the connection is dead right now" -
    // both surface as LLMNetworkError to the user, but neither should trigger the
    // retry-once-on-malformed-JSON behavior in generateAndValidatePlan (that retry is
    // for "got a response, it was badly shaped", not "never got a response at all").
    throw new LLMNetworkError();
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new LLMAuthError();
    }
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : null;
      throw new LLMRateLimitError(Number.isNaN(retryAfterSeconds as number) ? null : retryAfterSeconds);
    }
    if (response.status === 400) {
      // A well-formed request from correct client code shouldn't produce a 400 -
      // if one shows up it means our own request-building has a bug, not a routine
      // connectivity issue. Flag it loudly for testing rather than blending it into
      // the generic network-error message the user sees.
      const body = await response.text().catch(() => '<unreadable body>');
      console.error(`LLM request returned 400 (this should not happen): ${body}`);
    }
    throw new LLMNetworkError();
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
};

const extractJSON = (text: string): any | null => {
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
};

const ALLOWED_MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'abs', 'legs', 'glutes', 'hamstrings', 'calves', 'quads',
];

// Off-enum drift (e.g. "core" instead of "abs") is a stylistic tendency of a given
// model, not a one-off glitch — a retry would likely just reproduce it, so this
// normalizes instead of failing validation. muscle_group is more than cosmetic: it's
// the join key the coach's-note context query uses to match logs to today's plan, so
// a silently wrong value would make an exercise permanently invisible to that
// matching — hence the warning log, so drift is visible during testing.
const normalizeMuscleGroups = (plan: any): void => {
  for (const day of plan.days) {
    for (const exercise of day.exercises) {
      const raw = exercise.muscle_group;
      if (raw === null || raw === undefined) continue;
      const normalized = String(raw).trim().toLowerCase();
      if (ALLOWED_MUSCLE_GROUPS.includes(normalized)) {
        exercise.muscle_group = normalized;
      } else {
        console.warn(
          `LLM returned an off-enum muscle_group "${raw}" for exercise "${exercise.exercise_name}" — coercing to null.`
        );
        exercise.muscle_group = null;
      }
    }
  }
};

// Structural validity only: correct types, and no empty plan/day (an empty days[] or
// exercises[] is never a legitimate plan, so it's treated the same as malformed JSON
// and routed through the same retry-once path below). Numeric plausibility (e.g. an
// implausible "50 sets") is deliberately NOT checked here - that's a Batch 4 concern,
// surfaced to the user as a highlight in the draft-preview screen, not a backend
// validation failure. A human reviewing the draft before saving is the actual design
// intent, not a heuristic guess at what's "too high" to be real.
const validatePlanShape = (obj: any): boolean =>
  typeof obj?.workout_name === 'string' &&
  Array.isArray(obj?.days) &&
  obj.days.length > 0 &&
  obj.days.every(
    (day: any) =>
      typeof day.day_name === 'string' &&
      Array.isArray(day.exercises) &&
      day.exercises.length > 0 &&
      day.exercises.every(
        (ex: any) =>
          typeof ex.exercise_name === 'string' && typeof ex.sets === 'number' && typeof ex.reps === 'number'
      )
  );

const generateAndValidatePlan = async (prompt: string): Promise<ExportedWorkout> => {
  // callLLM can throw LLMAuthError/LLMRateLimitError/LLMNetworkError - those propagate
  // immediately, uncaught here. Only a malformed/empty response triggers the retry.
  let text = await callLLM(prompt);
  let parsed = extractJSON(text);

  if (!parsed || !validatePlanShape(parsed)) {
    text = await callLLM(prompt + '\n\nYour previous response was not valid JSON, or was missing exercises. Return ONLY the JSON object, nothing else, and make sure every day has at least one exercise.');
    parsed = extractJSON(text);
    if (!parsed || !validatePlanShape(parsed)) {
      throw new LLMSchemaError();
    }
  }

  normalizeMuscleGroups(parsed);
  return parsed;
};

export const generateWorkoutPlan = (context: Parameters<typeof buildGeneratePrompt>[0]): Promise<ExportedWorkout> =>
  generateAndValidatePlan(buildGeneratePrompt(context));

export const refinePlan = (
  currentDraft: ExportedWorkout,
  feedback: string,
  context: Parameters<typeof buildRefinePrompt>[2]
): Promise<ExportedWorkout> => generateAndValidatePlan(buildRefinePrompt(currentDraft, feedback, context));

export const generateCoachNote = async (
  context: Parameters<typeof buildCoachNotePrompt>[0]
): Promise<string | null> => {
  const text = (await callLLM(buildCoachNotePrompt(context))).trim();
  return text === 'NONE' || text === '' ? null : text;
};

// For the Settings "test connection" button. Deliberately calls callLLM directly
// rather than generateWorkoutPlan/generateAndValidatePlan - this is a connectivity
// check, not a plan generation, so it has no reason to run the schema-validation/
// retry-on-malformed-JSON path built for that. Throws the same typed errors as every
// other call site, so callers can reuse getUserFacingErrorMessage rather than writing
// new copy for this one button.
export const testConnection = async (): Promise<void> => {
  await callLLM('Respond with the word OK.');
};
