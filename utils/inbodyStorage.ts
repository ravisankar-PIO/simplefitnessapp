import * as FileSystem from 'expo-file-system';
import { InBodySnapshot, parseInBodyCSV, parseInBodyJSON, dedupeSnapshots } from './inbodyParser';

export type { InBodySnapshot };
export { parseInBodyCSV, parseInBodyJSON, dedupeSnapshots };

const INBODY_FILE = `${FileSystem.documentDirectory}inbodySnapshots.json`;

export const loadInBodySnapshots = async (): Promise<InBodySnapshot[]> => {
  try {
    const fileInfo = await FileSystem.getInfoAsync(INBODY_FILE);
    if (!fileInfo.exists) return [];
    const raw = await FileSystem.readAsStringAsync(INBODY_FILE);
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error loading InBody snapshots:', error);
    return [];
  }
};

export const saveInBodySnapshots = async (snapshots: InBodySnapshot[]): Promise<void> => {
  try {
    await FileSystem.writeAsStringAsync(INBODY_FILE, JSON.stringify(snapshots, null, 2));
  } catch (error) {
    console.error('Error saving InBody snapshots:', error);
  }
};

export const mergeAndSaveInBodySnapshots = async (
  newSnapshots: InBodySnapshot[]
): Promise<InBodySnapshot[]> => {
  const existing = await loadInBodySnapshots();
  const merged = dedupeSnapshots([...existing, ...newSnapshots]);
  await saveInBodySnapshots(merged);
  return merged;
};

export const getLatestInBodySnapshot = async (): Promise<InBodySnapshot | null> => {
  const snapshots = await loadInBodySnapshots();
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
};
