import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { DifficultyLevel, getDifficultyColor, getDifficultyEmoji } from '../utils/difficultyUtils';

interface DifficultySelectorProps {
    visible: boolean;
    onSelect: (difficulty: DifficultyLevel) => void;
    onClose: () => void;
}

export default function DifficultySelector({ visible, onSelect, onClose }: DifficultySelectorProps) {
    const { theme } = useTheme();
    const { t } = useTranslation();

    const difficulties: Array<{ value: DifficultyLevel; label: string }> = [
        { value: 'Easy', label: t('difficultyEasy') || 'Easy' },
        { value: 'Medium', label: t('difficultyMedium') || 'Medium' },
        { value: 'Hard', label: t('difficultyHard') || 'Hard' },
    ];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
                    <Text style={[styles.title, { color: theme.text }]}>
                        {t('howWasThisSet') || 'How was this set?'}
                    </Text>

                    <View style={styles.buttonContainer}>
                        {difficulties.map((diff) => (
                            <TouchableOpacity
                                key={diff.value}
                                style={[
                                    styles.difficultyButton,
                                    {
                                        backgroundColor: getDifficultyColor(diff.value),
                                        borderColor: theme.border
                                    }
                                ]}
                                onPress={() => onSelect(diff.value)}
                            >
                                <Text style={styles.emoji}>
                                    {getDifficultyEmoji(diff.value)}
                                </Text>
                                <Text style={styles.buttonText}>{diff.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={[styles.cancelButton, { borderColor: theme.border }]}
                        onPress={onClose}
                    >
                        <Text style={[styles.cancelText, { color: theme.text }]}>
                            {t('alertCancel') || 'Cancel'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
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
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 24,
        textAlign: 'center',
    },
    buttonContainer: {
        width: '100%',
        gap: 12,
    },
    difficultyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        gap: 12,
    },
    emoji: {
        fontSize: 28,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    cancelButton: {
        marginTop: 16,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        borderWidth: 1,
    },
    cancelText: {
        fontSize: 16,
    },
});
