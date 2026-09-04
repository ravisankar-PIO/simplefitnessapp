import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

// Fixed vocabulary, matching the pattern used for muscle_group elsewhere in this app
// (see WeightLogDetail.tsx) - gives the LLM a consistent equipment list to reason
// over instead of free-text variants of the same thing ("dumbbells" vs "DBs").
export const FIXED_EQUIPMENT = [
  'Dumbbells',
  'Barbell',
  'Bench',
  'Squat Rack',
  'Pull-up Bar',
  'Cable Machine',
  'Resistance Bands',
  'Kettlebell',
  'Bodyweight Only',
];

// Plain controlled component - no internal read/write to settings storage. CoachProfile
// wires onToggleFixed/onOtherTextBlur to actually persist; GeneratePlan pre-fills from
// the same stored list but keeps its callbacks purely local, so unchecking an item for
// one generation doesn't permanently edit the standing equipment profile.
export interface EquipmentSelectorProps {
  selectedFixed: string[];
  otherText: string;
  onToggleFixed: (item: string) => void;
  onOtherTextChange: (text: string) => void;
  onOtherTextBlur?: () => void;
}

export default function EquipmentSelector({
  selectedFixed,
  otherText,
  onToggleFixed,
  onOtherTextChange,
  onOtherTextBlur,
}: EquipmentSelectorProps) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View>
      <Text style={[styles.subtitle, { color: theme.text }]}>{t('equipmentSubtitle') || 'Select all that apply'}</Text>
      <View style={styles.grid}>
        {FIXED_EQUIPMENT.map((item) => {
          const isSelected = selectedFixed.includes(item);
          return (
            <TouchableOpacity
              key={item}
              style={[
                styles.button,
                { borderColor: theme.border, backgroundColor: isSelected ? theme.buttonBackground : theme.card },
              ]}
              onPress={() => onToggleFixed(item)}
            >
              <Text style={[styles.buttonText, { color: isSelected ? theme.buttonText : theme.text }]}>{item}</Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={16} color={theme.buttonText} style={styles.checkmark} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.inputLabel, { color: theme.text, marginTop: 15 }]}>
        {t('otherEquipmentLabel') || 'Other (comma-separated)'}
      </Text>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border }]}
        placeholder={t('otherEquipmentPlaceholder') || 'e.g. TRX, foam roller'}
        placeholderTextColor={theme.text}
        value={otherText}
        onChangeText={onOtherTextChange}
        onBlur={onOtherTextBlur}
      />
    </View>
  );
}

// Splits the free-text "other" field into individual, trimmed, non-empty entries.
export const parseCustomEquipment = (text: string): string[] =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

const styles = StyleSheet.create({
  subtitle: {
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  checkmark: {
    marginLeft: 6,
  },
});
