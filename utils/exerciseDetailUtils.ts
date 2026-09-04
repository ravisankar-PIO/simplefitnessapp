import { type SQLiteDatabase } from 'expo-sqlite';

// Migrations in this file run ad-hoc, invoked from whichever screen's mount effect
// owns the table being changed (see screens/Workouts.tsx). Coach_Notes is the one
// exception — it runs centrally from App.tsx's SQLiteProvider onInit instead, since
// it has no single owning screen (see utils/coachNotesUtils.ts). Both patterns are
// intentional; don't refactor one into the other.
export const addWebLinkColumn = async (db: SQLiteDatabase) => {
    const tables = ['Exercises', 'Logged_Exercises'];
    try {
        for (const table of tables) {
            const columns = await db.getAllAsync<any>(`PRAGMA table_info(${table});`);
            const columnExists = columns.some((col: any) => col.name === 'web_link');
            console.log("column check", columnExists);

            if (!columnExists) {
                await db.runAsync(`ALTER TABLE ${table} ADD COLUMN web_link TEXT;`);
                console.log(`'web_link' column added to '${table}' table.`);
            }
        }
    } catch (error) {
        console.error('Error adding web_link column:', error);
    }
};

export const addMuscleGroupColumn = async (db: SQLiteDatabase) => {
    const tables = ['Exercises', 'Logged_Exercises'];
    try {
        for (const table of tables) {
            const columns = await db.getAllAsync<any>(`PRAGMA table_info(${table});`);
            const columnExists = columns.some((col: any) => col.name === 'muscle_group');

            if (!columnExists) {
                await db.runAsync(`ALTER TABLE ${table} ADD COLUMN muscle_group TEXT;`);
                console.log(`'muscle_group' column added to '${table}' table.`);
            }
        }
    } catch (error) {
        console.error('Error adding muscle_group column:', error);
    }
};

export const addMuscleGroupToWeightLog = async (db: SQLiteDatabase) => {
    const table = 'Weight_Log';
    try {
        const columns = await db.getAllAsync<any>(`PRAGMA table_info(${table});`);
        const columnExists = columns.some((col: any) => col.name === 'muscle_group');

        if (!columnExists) {
            await db.runAsync(`ALTER TABLE ${table} ADD COLUMN muscle_group TEXT;`);
            console.log(`'muscle_group' column added to '${table}' table.`);
        }
    } catch (error) {
        console.error('Error adding muscle_group column to Weight_Log:', error);
    }
};

export const addExerciseNotesColumn = async (db: SQLiteDatabase) => {
    const tables = ['Exercises', 'Logged_Exercises'];
    try {
        for (const table of tables) {
            const columns = await db.getAllAsync<any>(`PRAGMA table_info(${table});`);
            const columnExists = columns.some((col: any) => col.name === 'exercise_notes');

            if (!columnExists) {
                await db.runAsync(`ALTER TABLE ${table} ADD COLUMN exercise_notes TEXT;`);
                console.log(`'exercise_notes' column added to '${table}' table.`);
            }
        }
    } catch (error) {
        console.error('Error adding exercise_notes column:', error);
    }
};

export const addDifficultyColumn = async (db: SQLiteDatabase) => {
    const table = 'Weight_Log';
    try {
        const columns = await db.getAllAsync<any>(`PRAGMA table_info(${table});`);
        const columnExists = columns.some((col: any) => col.name === 'difficulty');

        if (!columnExists) {
            await db.runAsync(`ALTER TABLE ${table} ADD COLUMN difficulty TEXT;`);
            console.log(`'difficulty' column added to '${table}' table.`);
        }
    } catch (error) {
        console.error('Error adding difficulty column:', error);
    }
};

export const addSuggestedWeightColumn = async (db: SQLiteDatabase) => {
    const table = 'Logged_Exercises';
    try {
        const columns = await db.getAllAsync<any>(`PRAGMA table_info(${table});`);
        const columnExists = columns.some((col: any) => col.name === 'suggested_weight');

        if (!columnExists) {
            await db.runAsync(`ALTER TABLE ${table} ADD COLUMN suggested_weight REAL;`);
            console.log(`'suggested_weight' column added to '${table}' table.`);
        }
    } catch (error) {
        console.error('Error adding suggested_weight column:', error);
    }
};

export const addCommentsColumn = async (db: SQLiteDatabase) => {
    const table = 'Weight_Log';
    try {
        const columns = await db.getAllAsync<any>(`PRAGMA table_info(${table});`);
        const columnExists = columns.some((col: any) => col.name === 'comments');

        if (!columnExists) {
            await db.runAsync(`ALTER TABLE ${table} ADD COLUMN comments TEXT;`);
            console.log(`'comments' column added to '${table}' table.`);
        }
    } catch (error) {
        console.error('Error adding comments column:', error);
    }
};