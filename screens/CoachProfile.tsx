import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { loadSettings, saveSettings } from '../utils/settingsStorage';
import {
  parseInBodyCSV,
  parseInBodyJSON,
  mergeAndSaveInBodySnapshots,
  getLatestInBodySnapshot,
  loadInBodySnapshots,
  InBodySnapshot,
} from '../utils/inbodyStorage';
import EquipmentSelector, { FIXED_EQUIPMENT, parseCustomEquipment } from '../components/EquipmentSelector';

export default function CoachProfile() {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [otherEquipment, setOtherEquipment] = useState('');
  const [standingConstraints, setStandingConstraints] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  const [latestSnapshot, setLatestSnapshot] = useState<InBodySnapshot | null>(null);
  const [previousSnapshot, setPreviousSnapshot] = useState<InBodySnapshot | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Guards against setting state after the screen has unmounted mid-upload -
  // the upload flow awaits a file pick + parse + merge, any of which could
  // outlive the screen if the user backs out.
  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const settings = await loadSettings();
      if (settings) {
        const storedEquipmentList: string[] = settings.equipmentList || [];
        const fixedSelections = storedEquipmentList.filter((item) => FIXED_EQUIPMENT.includes(item));
        const customEntries = storedEquipmentList.filter((item) => !FIXED_EQUIPMENT.includes(item));
        setSelectedEquipment(fixedSelections);
        setOtherEquipment(customEntries.join(', '));
        setStandingConstraints(settings.standingConstraints || '');
      }
      await refreshSnapshots();
      if (isMounted.current) setIsInitialized(true);
    };
    initialize();
  }, []);

  const refreshSnapshots = async () => {
    const all = await loadInBodySnapshots();
    if (!isMounted.current) return;
    setLatestSnapshot(all.length > 0 ? all[all.length - 1] : null);
    setPreviousSnapshot(all.length > 1 ? all[all.length - 2] : null);
  };

  // Persisted individually per field, on blur/change, rather than batched behind a
  // single "Save" button - matches how the rest of this app's settings screens work
  // (see SettingsContext's autosave). saveSettings() merges onto disk (see
  // utils/settingsStorage.ts), so this only ever touches its own fields.
  const persistEquipment = async (fixedSelections: string[], customText: string) => {
    await saveSettings({ equipmentList: [...fixedSelections, ...parseCustomEquipment(customText)] });
  };

  const handleToggleEquipment = (item: string) => {
    const next = selectedEquipment.includes(item)
      ? selectedEquipment.filter((i) => i !== item)
      : [...selectedEquipment, item];
    setSelectedEquipment(next);
    persistEquipment(next, otherEquipment);
  };

  const handleOtherEquipmentBlur = () => {
    persistEquipment(selectedEquipment, otherEquipment);
  };

  const handleConstraintsBlur = () => {
    saveSettings({ standingConstraints });
  };

  const formatUploadSummary = (stats: {
    addedCount: number;
    exactDuplicateCount: number;
    sameDayCollapsedCount: number;
    enrichedCount: number;
  }): string => {
    const parts: string[] = [];
    if (stats.addedCount > 0) parts.push(`${stats.addedCount} new scan${stats.addedCount === 1 ? '' : 's'} added`);
    if (stats.enrichedCount > 0) parts.push(`${stats.enrichedCount} scan${stats.enrichedCount === 1 ? '' : 's'} enriched with notes`);
    if (stats.exactDuplicateCount > 0) parts.push(`${stats.exactDuplicateCount} already in your history`);
    if (stats.sameDayCollapsedCount > 0) parts.push(`${stats.sameDayCollapsedCount} same-day duplicate scan${stats.sameDayCollapsedCount === 1 ? '' : 's'} collapsed`);
    return parts.length > 0 ? parts.join(', ') : 'No new data found in this file.';
  };

  const handleUploadInBody = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/json', 'text/comma-separated-values', 'application/vnd.ms-excel'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name || '';
      setIsUploading(true);

      const fileText = await FileSystem.readAsStringAsync(fileUri);

      let parsed: InBodySnapshot[];
      if (fileName.toLowerCase().endsWith('.json')) {
        parsed = parseInBodyJSON(fileText);
      } else {
        parsed = parseInBodyCSV(fileText);
      }

      if (parsed.length === 0) {
        if (isMounted.current) setIsUploading(false);
        Alert.alert('No data found', 'This file did not contain any recognizable InBody scans.');
        return;
      }

      const { stats } = await mergeAndSaveInBodySnapshots(parsed);
      await refreshSnapshots();

      if (!isMounted.current) return;
      setIsUploading(false);
      Alert.alert('Import complete', formatUploadSummary(stats));
    } catch (error: any) {
      console.error('Error uploading InBody file:', error);
      if (isMounted.current) setIsUploading(false);
      Alert.alert('Import failed', error?.message || 'Could not read or parse this file.');
    }
  };

  const formatSnapshotSummary = (snapshot: InBodySnapshot | null): string => {
    if (!snapshot) return 'No InBody data yet.';
    const date = snapshot.scan_date.slice(0, 10);
    const weight = snapshot.weight_kg !== null ? `${snapshot.weight_kg}kg` : '—';
    const bodyFat = snapshot.percent_body_fat !== null ? `${snapshot.percent_body_fat}% BF` : '—';
    return `${date} — ${weight}, ${bodyFat}`;
  };

  const formatDelta = (): string | null => {
    if (!latestSnapshot || !previousSnapshot) return null;
    if (latestSnapshot.weight_kg === null || previousSnapshot.weight_kg === null) return null;
    const delta = Math.round((latestSnapshot.weight_kg - previousSnapshot.weight_kg) * 10) / 10;
    if (delta === 0) return 'No change since last scan';
    return `${delta > 0 ? '+' : ''}${delta}kg since last scan`;
  };

  if (!isInitialized) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.text} />
      </View>
    );
  }

  const delta = formatDelta();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: theme.text }]}>{t('coachProfileTitle') || 'Coach Profile'}</Text>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('equipmentTitle') || 'Equipment'}</Text>
          <EquipmentSelector
            selectedFixed={selectedEquipment}
            otherText={otherEquipment}
            onToggleFixed={handleToggleEquipment}
            onOtherTextChange={setOtherEquipment}
            onOtherTextBlur={handleOtherEquipmentBlur}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('standingConstraintsTitle') || 'Standing Constraints'}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: theme.text }]}>
            {t('standingConstraintsSubtitle') || 'Injuries, scheduling limits, or anything else the coach should always keep in mind'}
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.multilineInput,
              { color: theme.text, backgroundColor: theme.card, borderColor: theme.border },
            ]}
            placeholder={t('standingConstraintsPlaceholder') || 'e.g. bad left knee, only free before 7am on weekdays'}
            placeholderTextColor={theme.text}
            value={standingConstraints}
            onChangeText={setStandingConstraints}
            onBlur={handleConstraintsBlur}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('inbodyDataTitle') || 'InBody Data'}</Text>
          <View style={[styles.snapshotCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.snapshotText, { color: theme.text }]}>
              {t('lastSynced') || 'Last synced'}: {formatSnapshotSummary(latestSnapshot)}
            </Text>
            {delta && <Text style={[styles.snapshotDelta, { color: theme.text }]}>{delta}</Text>}
          </View>
          <TouchableOpacity
            style={[styles.uploadButton, { backgroundColor: theme.buttonBackground, borderColor: theme.border }]}
            onPress={handleUploadInBody}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={theme.buttonText} />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color={theme.buttonText} style={styles.uploadIcon} />
                <Text style={[styles.uploadButtonText, { color: theme.buttonText }]}>
                  {t('uploadInBodyFile') || 'Upload InBody File (CSV or JSON)'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    marginBottom: 25,
    textAlign: 'center',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 5,
  },
  sectionSubtitle: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  multilineInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  snapshotCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  snapshotText: {
    fontSize: 15,
    fontWeight: '600',
  },
  snapshotDelta: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 4,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
  },
  uploadIcon: {
    marginRight: 8,
  },
  uploadButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
