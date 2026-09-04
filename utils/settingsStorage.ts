import * as FileSystem from 'expo-file-system';

// Make sure to use backticks here:
const SETTINGS_FILE = `${FileSystem.documentDirectory}userSettings.json`;

// Shallow merge onto whatever's already on disk, not a blind overwrite. Every
// caller here only knows its own slice of settings (SettingsContext's autosave
// only knows its 6 fields, the AI settings screens only know theirs) - a blind
// write from one caller would silently erase fields only another caller knows
// about. Not race-safe against two near-simultaneous callers (one screen's
// read-before-write could lose to another's write landing first), but this is
// a single-user app where only one screen is ever in view at a time, so that's
// an accepted, low-probability gap rather than something worth a locking
// mechanism for.
export const saveSettings = async (settings: object) => {
  try {
    const existing = (await loadSettings()) || {};
    const merged = { ...existing, ...settings };
    await FileSystem.writeAsStringAsync(SETTINGS_FILE, JSON.stringify(merged));
    console.log('Settings saved successfully.');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
};

export const loadSettings = async () => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(SETTINGS_FILE);
    if (!fileInfo.exists) {
      console.log("Settings file doesn't exist, using default settings.");
      return null;
    }

    const settings = await FileSystem.readAsStringAsync(SETTINGS_FILE);
    return JSON.parse(settings);
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
};
