import { type SQLiteDatabase } from 'expo-sqlite';

// This migration runs from App.tsx's SQLiteProvider onInit, NOT from a screen's
// mount effect like every other migration in this codebase (see exerciseDetailUtils.ts,
// addRecurringTable.ts). Coach_Notes has no single screen that "owns" it the way
// Recurring_Workouts belongs to RecurringWorkoutOptions — it's read by the today's-workout
// screen, which has no reason to run migrations. Centralizing here guarantees the table
// exists before any screen needs it. Don't refactor the existing ad-hoc migrations to
// match this — that's a wider change than this feature asked for.
export const addCoachNotesTable = async (db: SQLiteDatabase) => {
  try {
    await db.runAsync(`
      CREATE TABLE IF NOT EXISTS Coach_Notes (
        note_id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        workout_name TEXT NOT NULL,
        day_name TEXT NOT NULL,
        workout_date INTEGER NOT NULL,
        note_text TEXT,
        created_at INTEGER NOT NULL,
        UNIQUE(workout_name, day_name, workout_date)
      );
    `);
  } catch (error) {
    console.error('Error creating Coach_Notes table:', error);
  }
};

// note_text can legitimately be NULL — that's a cached "nothing worth flagging"
// result, not a missing row. Callers should treat a found row (even with a null
// note_text) as cache-hit and skip re-querying the LLM.
export const getCachedCoachNote = async (
  db: SQLiteDatabase,
  workoutName: string,
  dayName: string,
  workoutDate: number
): Promise<{ note_text: string | null } | null> => {
  try {
    return await db.getFirstAsync<{ note_text: string | null }>(
      `SELECT note_text FROM Coach_Notes WHERE workout_name = ? AND day_name = ? AND workout_date = ?`,
      [workoutName, dayName, workoutDate]
    );
  } catch (error) {
    console.error('Error fetching cached coach note:', error);
    return null;
  }
};

export const saveCoachNote = async (
  db: SQLiteDatabase,
  workoutName: string,
  dayName: string,
  workoutDate: number,
  noteText: string | null
): Promise<void> => {
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO Coach_Notes (workout_name, day_name, workout_date, note_text, created_at) VALUES (?, ?, ?, ?, ?)`,
      [workoutName, dayName, workoutDate, noteText, Math.floor(Date.now() / 1000)]
    );
  } catch (error) {
    console.error('Error saving coach note:', error);
  }
};
