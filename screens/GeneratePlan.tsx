import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { WorkoutStackParamList } from '../App';
import { loadSettings } from '../utils/settingsStorage';
import { getLatestInBodySnapshot } from '../utils/inbodyStorage';
import { generateWorkoutPlan, getUserFacingErrorMessage } from '../utils/llmClient';
import EquipmentSelector, { FIXED_EQUIPMENT, parseCustomEquipment } from '../components/EquipmentSelector';

type GeneratePlanNavigationProp = StackNavigationProp<WorkoutStackParamList, 'GeneratePlan'>;

const SPLIT_OPTIONS = ['PPL', 'Upper-Lower', 'Full Body', 'Bro Split', 'Custom'];
const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function GeneratePlan() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const navigation = useNavigation<GeneratePlanNavigationProp>();

  const [goals, setGoals] = useState('');
  const [splitPreference, setSplitPreference] = useState(SPLIT_OPTIONS[0]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [timeWindow, setTimeWindow] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [otherEquipment, setOtherEquipment] = useState('');
  const [freeTextOverride, setFreeTextOverride] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Guards against setting state after this screen unmounts mid-request (the user
  // backs out during the wait for a response).
  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    const prefillEquipment = async () => {
      const settings = await loadSettings();
      if (!isMounted.current || !settings?.equipmentList) return;
      const storedList: string[] = settings.equipmentList;
      setSelectedEquipment(storedList.filter((item) => FIXED_EQUIPMENT.includes(item)));
      setOtherEquipment(storedList.filter((item) => !FIXED_EQUIPMENT.includes(item)).join(', '));
    };
    prefillEquipment();
  }, []);

  const toggleDay = (day: string) => {
    setSelectedDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  // Equipment toggles here are local-only - unlike CoachProfile's instance of this
  // same component, nothing here ever calls saveSettings(). Unchecking an item for
  // one generation shouldn't permanently edit the standing equipment profile.
  const toggleEquipment = (item: string) => {
    setSelectedEquipment((prev) => (prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const settings = await loadSettings();
      const latestSnapshot = await getLatestInBodySnapshot();

      const plan = await generateWorkoutPlan({
        goals: goals.trim() || 'General strength and fitness',
        availability: `${selectedDays.join(', ') || 'Not specified'}${timeWindow ? ` — ${timeWindow.trim()}` : ''}`,
        splitPreference,
        equipment: [...selectedEquipment, ...parseCustomEquipment(otherEquipment)],
        standingConstraints: settings?.standingConstraints || '',
        latestInBody: latestSnapshot,
        freeTextOverride: freeTextOverride.trim(),
      });

      if (!isMounted.current) return;
      setIsGenerating(false);
      navigation.navigate('WorkoutDetails', { mode: 'draft', draftWorkout: plan });
    } catch (error) {
      if (!isMounted.current) return;
      setIsGenerating(false);
      Alert.alert(t('generatePlanFailedTitle') || 'Generation Failed', getUserFacingErrorMessage(error));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>

        <Text style={[styles.title, { color: theme.text }]}>{t('generatePlanTitle') || 'Generate a Plan'}</Text>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('goalsLabel') || 'Goals / emphasis'}</Text>
          <TextInput
            style={[
              styles.input,
              styles.multilineInput,
              { color: theme.text, backgroundColor: theme.card, borderColor: theme.border },
            ]}
            placeholder={t('goalsPlaceholder') || 'e.g. build upper chest, general strength, prioritize legs'}
            placeholderTextColor={theme.text}
            value={goals}
            onChangeText={setGoals}
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('splitPreferenceLabel') || 'Split preference'}</Text>
          <View style={styles.buttonGroup}>
            {SPLIT_OPTIONS.map((option) => {
              const isActive = splitPreference === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.optionButton,
                    { borderColor: theme.border, backgroundColor: isActive ? theme.buttonBackground : theme.card },
                  ]}
                  onPress={() => setSplitPreference(option)}
                >
                  <Text style={[styles.optionButtonText, { color: isActive ? theme.buttonText : theme.text }]}>
                    {option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('availabilityLabel') || 'Available days'}</Text>
          <View style={styles.buttonGroup}>
            {DAYS_OF_WEEK.map((day) => {
              const isSelected = selectedDays.includes(day);
              return (
                <TouchableOpacity
                  key={day}
                  style={[
                    styles.dayButton,
                    { borderColor: theme.border, backgroundColor: isSelected ? theme.buttonBackground : theme.card },
                  ]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={[styles.optionButtonText, { color: isSelected ? theme.buttonText : theme.text }]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={[styles.input, { color: theme.text, backgroundColor: theme.card, borderColor: theme.border, marginTop: 10 }]}
            placeholder={t('timeWindowPlaceholder') || 'Time window, e.g. mornings before 8am'}
            placeholderTextColor={theme.text}
            value={timeWindow}
            onChangeText={setTimeWindow}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('equipmentTitle') || 'Equipment'}</Text>
          <EquipmentSelector
            selectedFixed={selectedEquipment}
            otherText={otherEquipment}
            onToggleFixed={toggleEquipment}
            onOtherTextChange={setOtherEquipment}
          />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('freeTextOverrideLabel') || 'Anything else the coach should know for this plan'}
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.multilineInput,
              { color: theme.text, backgroundColor: theme.card, borderColor: theme.border },
            ]}
            placeholder={t('freeTextOverridePlaceholder') || 'Free text — anything not covered above'}
            placeholderTextColor={theme.text}
            value={freeTextOverride}
            onChangeText={setFreeTextOverride}
            multiline
            numberOfLines={3}
          />
        </View>

        <TouchableOpacity
          style={[styles.generateButton, { backgroundColor: theme.buttonBackground }]}
          onPress={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color={theme.buttonText} />
          ) : (
            <>
              <Ionicons name="sparkles-outline" size={20} color={theme.buttonText} style={{ marginRight: 8 }} />
              <Text style={[styles.generateButtonText, { color: theme.buttonText }]}>
                {t('generateButton') || 'Generate'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 10,
    zIndex: 10,
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 25,
    textAlign: 'center',
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  optionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dayButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 10,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
