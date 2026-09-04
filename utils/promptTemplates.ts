// Every LLM call this app makes is one of these three, bounded, single-purpose
// exchanges - no open-ended chat. See utils/llmClient.ts for how these are used.

export const PLAN_SCHEMA_INSTRUCTION = `Return ONLY valid JSON matching this exact shape, no markdown fences, no prose before or after:
{
  "workout_name": string,
  "days": [
    {
      "day_name": string,
      "exercises": [
        {
          "exercise_name": string,
          "sets": number,
          "reps": number,
          "web_link": string | null,
          "muscle_group": one of "chest"|"back"|"shoulders"|"biceps"|"triceps"|"forearms"|"abs"|"legs"|"glutes"|"hamstrings"|"calves"|"quads"|null,
          "exercise_notes": string | null
        }
      ]
    }
  ]
}
Every day must have at least one exercise, and the plan must have at least one day.`;

export const buildGeneratePrompt = (context: {
  goals: string;
  availability: string;
  splitPreference: string;
  equipment: string[];
  standingConstraints: string;
  latestInBody: unknown;
  freeTextOverride: string;
}): string => `
You are a strength-training coach creating a workout plan.
Goals / emphasis: ${context.goals}
Available days & time windows: ${context.availability}
Split style preference: ${context.splitPreference}
Available equipment: ${context.equipment.join(', ')}
Standing constraints (injuries, scheduling limits, etc.): ${context.standingConstraints}
Latest body composition reading: ${JSON.stringify(context.latestInBody)}
Additional notes from the user: ${context.freeTextOverride}
${PLAN_SCHEMA_INSTRUCTION}
`;

export const buildRefinePrompt = (currentDraft: object, feedback: string): string => `
You previously proposed this workout plan:
${JSON.stringify(currentDraft)}
The user's feedback: ${feedback}
Revise the plan accordingly. Keep everything the user didn't ask to change.
${PLAN_SCHEMA_INSTRUCTION}
`;

export const buildCoachNotePrompt = (context: {
  todaysExercises: unknown;
  recentMuscleGroupLogs: unknown;
  recentAllLogs: unknown;
  latestInBody: unknown;
  standingConstraints: string;
}): string => `
You are a strength-training coach. Below is today's planned workout and the user's recent training data.
Today's planned exercises: ${JSON.stringify(context.todaysExercises)}
Most recent logged sets for today's muscle groups: ${JSON.stringify(context.recentMuscleGroupLogs)}
All logs from the last 48-72 hours (may cover unrelated muscle groups): ${JSON.stringify(context.recentAllLogs)}
Latest body composition reading: ${JSON.stringify(context.latestInBody)}
Standing constraints: ${context.standingConstraints}
If something in this data genuinely warrants a heads-up before today's session (soreness, a difficulty pattern, fatigue signal), write ONE short, specific note (1-3 sentences).
If nothing stands out, respond with exactly: NONE
Do not write a generic encouragement note. Silence is the correct output when there is nothing specific to flag.
`;
