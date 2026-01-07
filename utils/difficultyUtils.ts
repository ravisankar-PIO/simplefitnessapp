import { type SQLiteDatabase } from 'expo-sqlite';

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | null;

/**
 * Analyzes the difficulty of all sets for a given exercise in the last workout
 * and determines if a weight increase should be suggested
 */
export const analyzeDifficultyAndSuggestWeight = async (
    db: SQLiteDatabase,
    workoutLogId: number,
    loggedExerciseId: number,
    weightIncrement: number
): Promise<number | null> => {
    try {
        // Get all sets for this exercise in this workout
        const sets = await db.getAllAsync<{ difficulty: string | null; weight_logged: number }>(
            `SELECT difficulty, weight_logged
             FROM Weight_Log
             WHERE workout_log_id = ? AND logged_exercise_id = ?
             ORDER BY set_number`,
            [workoutLogId, loggedExerciseId]
        );

        if (sets.length === 0) {
            return null;
        }

        // Check if ALL sets are Easy
        const allEasy = sets.every(set => {
            const difficulty = set.difficulty || 'Medium'; // Treat null as Medium
            return difficulty === 'Easy';
        });

        if (allEasy) {
            // Get the highest weight used in this workout
            const maxWeight = Math.max(...sets.map(s => s.weight_logged));
            return maxWeight + weightIncrement;
        }

        return null;
    } catch (error) {
        console.error('Error analyzing difficulty:', error);
        return null;
    }
};

/**
 * Saves the suggested weight for the next occurrence of this exercise
 */
export const saveSuggestedWeight = async (
    db: SQLiteDatabase,
    loggedExerciseId: number,
    suggestedWeight: number
): Promise<void> => {
    try {
        await db.runAsync(
            `UPDATE Logged_Exercises
             SET suggested_weight = ?
             WHERE logged_exercise_id = ?`,
            [suggestedWeight, loggedExerciseId]
        );
        console.log(`Suggested weight ${suggestedWeight} saved for exercise ${loggedExerciseId}`);
    } catch (error) {
        console.error('Error saving suggested weight:', error);
    }
};

/**
 * Gets the suggested weight for an exercise based on previous workout
 */
export const getSuggestedWeight = async (
    db: SQLiteDatabase,
    workoutName: string,
    dayName: string,
    exerciseName: string
): Promise<number | null> => {
    try {
        // Find the most recent completed workout with this exercise
        const result = await db.getFirstAsync<{ suggested_weight: number | null }>(
            `SELECT le.suggested_weight
             FROM Logged_Exercises le
             JOIN Workout_Log wl ON le.workout_log_id = wl.workout_log_id
             WHERE wl.workout_name = ?
             AND wl.day_name = ?
             AND le.exercise_name = ?
             AND le.suggested_weight IS NOT NULL
             ORDER BY wl.workout_date DESC
             LIMIT 1`,
            [workoutName, dayName, exerciseName]
        );

        return result?.suggested_weight || null;
    } catch (error) {
        console.error('Error getting suggested weight:', error);
        return null;
    }
};

/**
 * Stores the weight increment preference (can be extended to user settings)
 */
export const DEFAULT_WEIGHT_INCREMENT = 2.5;

/**
 * Gets the difficulty color for UI display
 */
export const getDifficultyColor = (difficulty: DifficultyLevel): string => {
    switch (difficulty) {
        case 'Easy':
            return '#4CAF50'; // Green
        case 'Medium':
            return '#FF9800'; // Orange
        case 'Hard':
            return '#F44336'; // Red
        default:
            return '#9E9E9E'; // Grey for null
    }
};

/**
 * Gets the difficulty emoji for UI display
 */
export const getDifficultyEmoji = (difficulty: DifficultyLevel): string => {
    switch (difficulty) {
        case 'Easy':
            return '😊';
        case 'Medium':
            return '😐';
        case 'Hard':
            return '😓';
        default:
            return '❓';
    }
};
