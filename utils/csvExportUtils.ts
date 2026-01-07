import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { type SQLiteDatabase } from 'expo-sqlite';

interface WorkoutLogEntry {
    workout_date: number;
    workout_name: string;
    day_name: string;
    exercise_name: string;
    set_number: number;
    weight_logged: number;
    reps_logged: number;
    difficulty: string | null;
}

/**
 * Formats a Unix timestamp to a date string based on user preference
 * @param timestamp Unix timestamp in seconds
 * @param dateFormat User's preferred date format ('dd-mm-yyyy' or 'mm-dd-yyyy')
 * @returns Formatted date string
 */
export const formatDateForCSV = (timestamp: number, dateFormat: string): string => {
    const date = new Date(timestamp * 1000);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    if (dateFormat === 'mm-dd-yyyy') {
        return `${month}-${day}-${year}`;
    } else {
        // Default to dd-mm-yyyy
        return `${day}-${month}-${year}`;
    }
};

/**
 * Escapes a CSV field if it contains special characters
 */
const escapeCsvField = (field: string | number | null): string => {
    if (field === null || field === undefined) {
        return '';
    }

    const stringField = String(field);

    // If field contains comma, quotes, or newline, wrap in quotes and escape existing quotes
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
        return `"${stringField.replace(/"/g, '""')}"`;
    }

    return stringField;
};

/**
 * Generates CSV content from workout log data
 */
const generateCSVContent = (logs: WorkoutLogEntry[], dateFormat: string): string => {
    // CSV Header
    const header = 'Date,Workout,Day,Exercise,Set,Weight,Reps,Difficulty\n';

    // CSV Rows
    const rows = logs.map(log => {
        const date = formatDateForCSV(log.workout_date, dateFormat);
        const difficulty = log.difficulty || 'Medium'; // Default to Medium for null values

        return [
            escapeCsvField(date),
            escapeCsvField(log.workout_name),
            escapeCsvField(log.day_name),
            escapeCsvField(log.exercise_name),
            escapeCsvField(log.set_number),
            escapeCsvField(log.weight_logged),
            escapeCsvField(log.reps_logged),
            escapeCsvField(difficulty)
        ].join(',');
    }).join('\n');

    return header + rows;
};

/**
 * Exports all workout logs to CSV and shares the file
 * @param db SQLite database instance
 * @param dateFormat User's preferred date format
 * @returns Promise that resolves when export is complete
 */
export const exportWorkoutLogsToCSV = async (
    db: SQLiteDatabase,
    dateFormat: string
): Promise<void> => {
    try {
        // Fetch all workout logs with their sets
        const logs = await db.getAllAsync<WorkoutLogEntry>(
            `SELECT
                wl.workout_date,
                wl.workout_name,
                wl.day_name,
                w.exercise_name,
                w.set_number,
                w.weight_logged,
                w.reps_logged,
                w.difficulty
            FROM Weight_Log w
            JOIN Workout_Log wl ON w.workout_log_id = wl.workout_log_id
            ORDER BY wl.workout_date DESC, w.logged_exercise_id ASC, w.set_number ASC`
        );

        if (logs.length === 0) {
            throw new Error('No workout logs found to export');
        }

        // Generate CSV content
        const csvContent = generateCSVContent(logs, dateFormat);

        // Create filename with current date
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const fileName = `workout_logs_${year}-${month}-${day}.csv`;
        const filePath = FileSystem.documentDirectory + fileName;

        // Write CSV to file
        await FileSystem.writeAsStringAsync(filePath, csvContent, {
            encoding: FileSystem.EncodingType.UTF8,
        });

        // Share the file
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(filePath, {
                mimeType: 'text/csv',
                dialogTitle: 'Export Workout Logs',
                UTI: 'public.comma-separated-values-text',
            });
        } else {
            throw new Error('Sharing is not available on this device');
        }

        console.log(`Successfully exported ${logs.length} workout log entries to ${fileName}`);
    } catch (error) {
        console.error('Error exporting workout logs:', error);
        throw error;
    }
};

/**
 * Gets a summary of exportable data
 */
export const getExportSummary = async (db: SQLiteDatabase): Promise<{
    totalWorkouts: number;
    totalSets: number;
    dateRange: { earliest: number; latest: number } | null;
}> => {
    try {
        const summary = await db.getFirstAsync<{
            totalWorkouts: number;
            totalSets: number;
            earliest: number | null;
            latest: number | null;
        }>(
            `SELECT
                COUNT(DISTINCT wl.workout_log_id) as totalWorkouts,
                COUNT(*) as totalSets,
                MIN(wl.workout_date) as earliest,
                MAX(wl.workout_date) as latest
            FROM Weight_Log w
            JOIN Workout_Log wl ON w.workout_log_id = wl.workout_log_id`
        );

        return {
            totalWorkouts: summary?.totalWorkouts || 0,
            totalSets: summary?.totalSets || 0,
            dateRange: (summary?.earliest && summary?.latest)
                ? { earliest: summary.earliest, latest: summary.latest }
                : null
        };
    } catch (error) {
        console.error('Error getting export summary:', error);
        return { totalWorkouts: 0, totalSets: 0, dateRange: null };
    }
};
