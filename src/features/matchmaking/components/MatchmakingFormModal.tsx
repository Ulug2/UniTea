import { useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { moderateScale, scale, verticalScale } from '../../../utils/scaling';
import { useAuth } from '../../../context/AuthContext';
import { useMyProfile } from '../../profile/hooks/useMyProfile';
import { useSubmitMatchmaking } from '../hooks/useSubmitMatchmaking';
import QuestionCard from './QuestionCard';
import { MATCHMAKING_QUESTIONS } from '../config/questions';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Gender = 'male' | 'female' | 'other';

const TOTAL_QUESTION_STEPS = MATCHMAKING_QUESTIONS.length;
// step 0 = demographics, steps 1..9 = questions, step 10 = confirm
const CONFIRM_STEP = TOTAL_QUESTION_STEPS + 1;

export default function MatchmakingFormModal({ visible, onClose }: Props) {
  const { theme, isDark } = useTheme();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { data: profile } = useMyProfile(userId);
  const submitMutation = useSubmitMatchmaking(userId);

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [major, setMajor] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const scrollRef = useRef<ScrollView>(null);

  function resetForm() {
    setStep(0);
    setDisplayName('');
    setMajor('');
    setGender(null);
    setAnswers({});
    submitMutation.reset();
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleBackPress() {
    if (step === 0) {
      handleClose();
      return;
    }
    // Confirm discard when navigating back past the demographics step
    if (step === 1) {
      Alert.alert(
        'Discard answers?',
        'Going back will clear your responses. Are you sure?',
        [
          { text: 'Stay', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              resetForm();
              onClose();
            },
          },
        ],
      );
      return;
    }
    setStep((s) => s - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function handleNext() {
    setStep((s) => s + 1);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function handleSelectAnswer(questionIndex: number, optionIndex: number) {
    const qId = MATCHMAKING_QUESTIONS[questionIndex].id;
    setAnswers((prev) => ({ ...prev, [qId]: optionIndex }));
  }

  async function handleSubmit() {
    if (!userId || !profile?.university_id || !gender) return;

    try {
      await submitMutation.mutateAsync({
        user_id: userId,
        university_id: profile.university_id,
        gender,
        display_name: displayName,
        major,
        answers,
      });
      handleClose();
    } catch {
      // Error is shown inline via submitMutation.error
    }
  }

  // ── Step-level helpers ──────────────────────────────────────
  const isDemographicsComplete =
    displayName.trim().length > 0 && major.trim().length > 0 && gender !== null;

  const currentQuestionIndex = step - 1; // step 1 → question index 0
  const currentQuestion =
    step >= 1 && step <= TOTAL_QUESTION_STEPS
      ? MATCHMAKING_QUESTIONS[currentQuestionIndex]
      : null;
  const currentAnswer =
    currentQuestion ? (answers[currentQuestion.id] ?? null) : null;
  const isQuestionAnswered = currentAnswer !== null;

  const keyboardAppearance = Platform.OS === 'ios' ? (isDark ? 'dark' : 'light') : undefined;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleBackPress}
    >
      <KeyboardAvoidingView
        style={[styles.root, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={handleBackPress} style={styles.headerBtn} hitSlop={8}>
            <Feather name="chevron-left" size={moderateScale(24)} color={theme.text} />
          </Pressable>

          {step > 0 && step <= TOTAL_QUESTION_STEPS ? (
            <Text style={[styles.progress, { color: theme.secondaryText }]}>
              {step} / {TOTAL_QUESTION_STEPS}
            </Text>
          ) : (
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                {step === 0 ? 'Your Profile' : '🎉 Almost There'}
              </Text>
            </View>
          )}

          <Pressable onPress={handleClose} style={styles.headerBtn} hitSlop={8}>
            <MaterialCommunityIcons
              name="close"
              size={moderateScale(22)}
              color={theme.secondaryText}
            />
          </Pressable>
        </View>

        {/* Progress bar */}
        {step > 0 && step <= TOTAL_QUESTION_STEPS && (
          <View style={[styles.progressBarBg, { backgroundColor: theme.border }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  backgroundColor: theme.primary,
                  width: `${(step / TOTAL_QUESTION_STEPS) * 100}%`,
                },
              ]}
            />
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 0: Demographics ── */}
          {step === 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Tell us a bit about you
              </Text>
              <Text style={[styles.sectionSubtitle, { color: theme.secondaryText }]}>
                This is shown only to your match — first name only, and it's deleted after the event.
              </Text>

              <Text style={[styles.inputLabel, { color: theme.text }]}>First name</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="e.g. Alex"
                placeholderTextColor={theme.secondaryText}
                value={displayName}
                onChangeText={setDisplayName}
                maxLength={50}
                autoCapitalize="words"
                keyboardAppearance={keyboardAppearance}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>Major</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
                ]}
                placeholder="e.g. Computer Science"
                placeholderTextColor={theme.secondaryText}
                value={major}
                onChangeText={setMajor}
                maxLength={100}
                autoCapitalize="words"
                keyboardAppearance={keyboardAppearance}
              />

              <Text style={[styles.inputLabel, { color: theme.text }]}>I am</Text>
              <View style={styles.genderRow}>
                {(['male', 'female', 'other'] as Gender[]).map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => setGender(g)}
                    style={[
                      styles.genderChip,
                      {
                        backgroundColor: gender === g ? theme.primary : theme.card,
                        borderColor: gender === g ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.genderChipText,
                        { color: gender === g ? '#FFFFFF' : theme.text },
                      ]}
                    >
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* ── Steps 1–9: Questions ── */}
          {currentQuestion && (
            <View style={styles.section}>
              <QuestionCard
                question={currentQuestion}
                selectedOption={currentAnswer}
                onSelect={(idx) => handleSelectAnswer(currentQuestionIndex, idx)}
              />
            </View>
          )}

          {/* ── Step 10: Confirm ── */}
          {step === CONFIRM_STEP && (
            <View style={styles.section}>
              <Text style={[styles.confirmEmoji]}>✨</Text>
              <Text style={[styles.confirmTitle, { color: theme.text }]}>
                You're all set!
              </Text>
              <Text style={[styles.confirmSubtitle, { color: theme.secondaryText }]}>
                Results drop on Day 14. Your match will be revealed right here in the app.
              </Text>
              {submitMutation.error && (
                <Text style={styles.errorText}>
                  {submitMutation.error.message}
                </Text>
              )}
            </View>
          )}
        </ScrollView>

        {/* Footer CTA */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          {step === 0 && (
            <Pressable
              style={[
                styles.ctaButton,
                { backgroundColor: isDemographicsComplete ? theme.primary : theme.border },
              ]}
              onPress={handleNext}
              disabled={!isDemographicsComplete}
            >
              <Text style={styles.ctaText}>Continue →</Text>
            </Pressable>
          )}

          {step >= 1 && step <= TOTAL_QUESTION_STEPS && (
            <Pressable
              style={[
                styles.ctaButton,
                { backgroundColor: isQuestionAnswered ? theme.primary : theme.border },
              ]}
              onPress={handleNext}
              disabled={!isQuestionAnswered}
            >
              <Text style={styles.ctaText}>
                {step === TOTAL_QUESTION_STEPS ? 'Review' : 'Next →'}
              </Text>
            </Pressable>
          )}

          {step === CONFIRM_STEP && (
            <Pressable
              style={[
                styles.ctaButton,
                {
                  backgroundColor: submitMutation.isPending ? theme.border : theme.primary,
                },
              ]}
              onPress={handleSubmit}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.ctaText}>Confirm & Submit</Text>
              )}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderBottomWidth: 1,
  },
  headerBtn: {
    width: scale(32),
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: moderateScale(17),
    fontFamily: 'Poppins_600SemiBold',
  },
  progress: {
    flex: 1,
    textAlign: 'center',
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_500Medium',
  },
  progressBarBg: {
    height: verticalScale(3),
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: moderateScale(2),
  },
  body: {
    flexGrow: 1,
    padding: scale(20),
    paddingBottom: verticalScale(32),
  },
  section: {
    gap: verticalScale(16),
  },
  sectionTitle: {
    fontSize: moderateScale(22),
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
    marginTop: verticalScale(8),
  },
  sectionSubtitle: {
    fontSize: moderateScale(13),
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: moderateScale(20),
    marginBottom: verticalScale(8),
  },
  inputLabel: {
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_500Medium',
    marginBottom: verticalScale(-8),
  },
  textInput: {
    borderWidth: 1,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(12),
    fontSize: moderateScale(15),
    fontFamily: 'Poppins_400Regular',
  },
  genderRow: {
    flexDirection: 'row',
    gap: scale(10),
  },
  genderChip: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: moderateScale(12),
    paddingVertical: verticalScale(12),
    alignItems: 'center',
  },
  genderChipText: {
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_500Medium',
  },
  confirmEmoji: {
    fontSize: moderateScale(52),
    textAlign: 'center',
    marginTop: verticalScale(20),
  },
  confirmTitle: {
    fontSize: moderateScale(24),
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  confirmSubtitle: {
    fontSize: moderateScale(15),
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: moderateScale(22),
    paddingHorizontal: scale(8),
  },
  errorText: {
    color: '#EF4444',
    fontSize: moderateScale(13),
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  footer: {
    borderTopWidth: 1,
    padding: scale(16),
    paddingBottom: Platform.OS === 'ios' ? verticalScale(28) : verticalScale(16),
  },
  ctaButton: {
    borderRadius: moderateScale(14),
    paddingVertical: verticalScale(15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: moderateScale(16),
    fontFamily: 'Poppins_600SemiBold',
  },
});
