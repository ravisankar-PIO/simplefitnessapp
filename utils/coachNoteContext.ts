import { type SQLiteDatabase } from 'expo-sqlite';

// Query helpers for gathering coach's-note context (§6/§7 of the AI coaching spec).
// Kept separate from StartedWorkoutInterface.tsx since these are pure DB queries,
// not UI concerns.

const RECENCY_WINDOW_HOURS = 72;

export const isSameDayAsToday = (workoutDateUnix: number): boolean => {
  // workout_date is always stored as a midnight-normalized timestamp (see
  // LogWorkout.tsx's normalizeDate) - exact equality against today's own
  // midnight timestamp is safe, no day-truncation needed on either side.
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  return workoutDateUnix === todayStart;
};

export interface RecentSetRow {
  exercise_name: string;
  weight_logged: number;
  reps_logged: number;
  difficulty: string | null;
  comments: string | null;
  set_number: number;
}

// The most recent PAST session (workout_date < today's session) that logged any set
// tagged with this muscle group - scoped to only the rows tagged with that muscle
// group within that session, not every row logged that day. A mixed day (chest +
// shoulders + triceps) shouldn't leak shoulder/triceps sets into the "chest" context
// just because they happened to be logged the same day.
export const fetchMostRecentSessionForMuscleGroup = async (
  db: SQLiteDatabase,
  muscleGroup: string,
  beforeWorkoutDate: number,
  excludeWorkoutLogId: number
): Promise<RecentSetRow[]> => {
  try {
    return await db.getAllAsync<RecentSetRow>(
      `SELECT wl.exercise_name, wl.weight_logged, wl.reps_logged, wl.difficulty, wl.comments, wl.set_number
       FROM Weight_Log wl
       INNER JOIN Workout_Log wlog ON wl.workout_log_id = wlog.workout_log_id
       WHERE wl.muscle_group = ?
         AND wlog.workout_date = (
           SELECT MAX(wlog2.workout_date)
           FROM Weight_Log wl2
           INNER JOIN Workout_Log wlog2 ON wl2.workout_log_id = wlog2.workout_log_id
           WHERE wl2.muscle_group = ? AND wlog2.workout_date < ? AND wl2.workout_log_id != ?
         )
       ORDER BY wl.exercise_name, wl.set_number;`,
      [muscleGroup, muscleGroup, beforeWorkoutDate, excludeWorkoutLogId]
    );
  } catch (error) {
    console.error('Error fetching most recent session for muscle group:', muscleGroup, error);
    return [];
  }
};

export interface RecentAllLogRow {
  exercise_name: string;
  muscle_group: string | null;
  weight_logged: number;
  reps_logged: number;
  difficulty: string | null;
  comments: string | null;
  workout_date: number;
}

// All logs within RECENCY_WINDOW_HOURS before this session's own workout_date -
// regardless of muscle group, to catch general fatigue/soreness signals not tied to
// today's specific muscle groups. Relative to the workout's own date, not "now" at
// open-time, so early-browsing a future day never computes a window that's wrong by
// the time that day actually arrives (see the "no generation on a future preview"
// rule this pairs with).
export const fetchRecentAllLogs = async (
  db: SQLiteDatabase,
  workoutDate: number,
  excludeWorkoutLogId: number
): Promise<RecentAllLogRow[]> => {
  try {
    const windowStart = workoutDate - RECENCY_WINDOW_HOURS * 3600;
    return await db.getAllAsync<RecentAllLogRow>(
      `SELECT wl.exercise_name, wl.muscle_group, wl.weight_logged, wl.reps_logged, wl.difficulty, wl.comments, wlog.workout_date
       FROM Weight_Log wl
       INNER JOIN Workout_Log wlog ON wl.workout_log_id = wlog.workout_log_id
       WHERE wlog.workout_date >= ? AND wlog.workout_date < ?
         AND wl.workout_log_id != ?
       ORDER BY wlog.workout_date DESC;`,
      [windowStart, workoutDate, excludeWorkoutLogId]
    );
  } catch (error) {
    console.error('Error fetching recent all-logs window:', error);
    return [];
  }
};
