import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../context/SettingsContext';

interface WeightSuggestionBadgeProps {
    suggestedWeight: number;
    onIncrementChange?: (increment: number) => void;
}

export default function WeightSuggestionBadge({
    suggestedWeight,
    onIncrementChange
}: WeightSuggestionBadgeProps) {
    const { theme } = useTheme();
    const { t } = useTranslation();
    const { weightFormat } = useSettings();
    const [showModal, setShowModal] = useState(false);
    const [increment, setIncrement] = useState('2.5');

    const handleApply = () => {
        const incrementValue = parseFloat(increment);
        if (isNaN(incrementValue) || incrementValue <= 0) {
            Alert.alert(
                t('errorTitle') || 'Error',
                t('invalidIncrement') || 'Please enter a valid weight increment'
            );
            return;
        }

        if (onIncrementChange) {
            onIncrementChange(incrementValue);
        }
        setShowModal(false);
    };

    return (
        <>
            <TouchableOpacity
                style={[styles.badge, { backgroundColor: theme.accent || '#4CAF50' }]}
                onPress={() => setShowModal(true)}
            >
                <Ionicons name="bulb" size={16} color="#FFFFFF" />
                <Text style={styles.badgeText}>
                    {t('suggested') || 'Suggested'}: {suggestedWeight} {weightFormat}
                </Text>
            </TouchableOpacity>

            <Modal
                visible={showModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowModal(false)}
            >
                <View style={styles.overlay}>
                    <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                        <Text style={[styles.title, { color: theme.text }]}>
                            {t('configureIncrement') || 'Configure Weight Increment'}
                        </Text>

                        <View style={styles.inputContainer}>
                            <Text style={[styles.label, { color: theme.text }]}>
                                {t('increaseBy') || 'Increase by'}:
                            </Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={[
                                        styles.input,
                                        {
                                            backgroundColor: theme.background,
                                            color: theme.text,
                                            borderColor: theme.border
                                        }
                                    ]}
                                    value={increment}
                                    onChangeText={setIncrement}
                                    keyboardType="numeric"
                                    placeholder="2.5"
                                    placeholderTextColor={theme.text + '80'}
                                />
                                <Text style={[styles.unit, { color: theme.text }]}>
                                    {weightFormat}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                style={[styles.button, styles.cancelButton, { borderColor: theme.border }]}
                                onPress={() => setShowModal(false)}
                            >
                                <Text style={[styles.buttonText, { color: theme.text }]}>
                                    {t('alertCancel') || 'Cancel'}
                                </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.button,
                                    styles.applyButton,
                                    { backgroundColor: theme.buttonBackground }
                                ]}
                                onPress={handleApply}
                            >
                                <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
                                    {t('apply') || 'Apply'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
        alignSelf: 'flex-start',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        width: '85%',
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    inputContainer: {
        marginBottom: 24,
    },
    label: {
        fontSize: 16,
        marginBottom: 8,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    input: {
        flex: 1,
        height: 50,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 15,
        fontSize: 18,
    },
    unit: {
        fontSize: 16,
        fontWeight: '600',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        borderWidth: 1,
    },
    applyButton: {
        // backgroundColor comes from theme
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
    },
});
