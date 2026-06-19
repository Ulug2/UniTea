import { useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '../../../context/ThemeContext';
import { moderateScale, scale, verticalScale } from '../../../utils/scaling';
import { useAuth } from '../../../context/AuthContext';
import { useMyMatch } from '../hooks/useMyMatch';
import { useRecordMatchView } from '../hooks/useRecordMatchView';
import { useMatchWindowStatus } from '../hooks/useMatchWindowStatus';
import { useInitiateMatchChat } from '../hooks/useInitiateMatchChat';
import { MAX_COMPATIBILITY_SCORE } from '../config/questions';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function MatchRevealModal({ visible, onClose }: Props) {
  const { theme } = useTheme();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const { data: match, isLoading: matchLoading } = useMyMatch(userId);
  const recordView = useRecordMatchView(userId);
  const windowStatus = useMatchWindowStatus(userId);
  const initiateChat = useInitiateMatchChat();

  // Record first view on mount (no-ops if already recorded)
  useEffect(() => {
    if (!visible || !match?.id || windowStatus.viewed_at) return;
    recordView.mutate({ matchId: match.id });
  }, [visible, match?.id]);

  function handleSendMessage() {
    if (!match?.partner?.user_id) return;

    initiateChat.mutate(
      { partnerUserId: match.partner.user_id },
      {
        onSuccess: ({ chatId }) => {
          onClose();
          router.push(`/chat/${chatId}`);
        },
        onError: (err) => {
          Alert.alert('Error', err.message || 'Could not start chat. Please try again.');
        },
      },
    );
  }

  const compatibilityPct = match
    ? Math.round((match.compatibility_score / MAX_COMPATIBILITY_SCORE) * 100)
    : 0;

  const matchTypeLabel =
    match?.match_type === 'wingman' ? 'Your Ultimate Wingman' : 'Your Perfect Match';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.card }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <MaterialCommunityIcons
              name="close"
              size={moderateScale(22)}
              color={theme.secondaryText}
            />
          </Pressable>

          {matchLoading && (
            <ActivityIndicator color={theme.primary} size="large" style={styles.loader} />
          )}

          {!matchLoading && !match && (
            <View style={styles.centerContent}>
              <Text style={[styles.noMatchTitle, { color: theme.text }]}>
                No match yet
              </Text>
              <Text style={[styles.noMatchSub, { color: theme.secondaryText }]}>
                Check back after Day 14.
              </Text>
            </View>
          )}

          {!matchLoading && match && windowStatus.isExpired && (
            <View style={styles.centerContent}>
              <Text style={styles.expiredEmoji}>⏰</Text>
              <Text style={[styles.expiredTitle, { color: theme.text }]}>
                Window closed
              </Text>
              <Text style={[styles.expiredSub, { color: theme.secondaryText }]}>
                Your 24-hour message window has passed.
              </Text>
            </View>
          )}

          {!matchLoading && match && !windowStatus.isExpired && (
            <View style={styles.content}>
              <Text style={styles.sparkle}>✨</Text>

              <Text style={[styles.matchTypeLabel, { color: theme.primary }]}>
                {matchTypeLabel}
              </Text>

              <Text style={[styles.partnerName, { color: theme.text }]}>
                {match.partner.display_name}
              </Text>

              <Text style={[styles.partnerMajor, { color: theme.secondaryText }]}>
                {match.partner.major}
              </Text>

              <View style={[styles.scoreBadge, { backgroundColor: theme.primary + '22' }]}>
                <Text style={[styles.scoreText, { color: theme.primary }]}>
                  {compatibilityPct}% compatibility
                </Text>
              </View>

              {/* Countdown */}
              {windowStatus.window_expires_at && (
                <View style={styles.countdownContainer}>
                  <MaterialCommunityIcons
                    name="timer-outline"
                    size={moderateScale(16)}
                    color={theme.secondaryText}
                  />
                  <Text style={[styles.countdownText, { color: theme.secondaryText }]}>
                    {formatCountdown(windowStatus.msRemaining)} left to message
                  </Text>
                </View>
              )}

              <Pressable
                style={[styles.sendBtn, { backgroundColor: theme.primary }]}
                onPress={handleSendMessage}
                disabled={initiateChat.isPending}
              >
                {initiateChat.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name="message-text-outline"
                      size={moderateScale(18)}
                      color="#FFFFFF"
                    />
                    <Text style={styles.sendBtnText}>Send Message</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(20),
  },
  card: {
    width: '100%',
    borderRadius: moderateScale(20),
    padding: scale(24),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(4) },
    shadowOpacity: 0.3,
    shadowRadius: moderateScale(8),
    elevation: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: scale(14),
    right: scale(14),
    padding: scale(4),
    zIndex: 1,
  },
  loader: {
    marginVertical: verticalScale(40),
  },
  centerContent: {
    alignItems: 'center',
    paddingVertical: verticalScale(32),
    gap: verticalScale(8),
  },
  noMatchTitle: {
    fontSize: moderateScale(18),
    fontFamily: 'Poppins_600SemiBold',
  },
  noMatchSub: {
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  expiredEmoji: {
    fontSize: moderateScale(44),
    textAlign: 'center',
  },
  expiredTitle: {
    fontSize: moderateScale(20),
    fontFamily: 'Poppins_600SemiBold',
  },
  expiredSub: {
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  content: {
    alignItems: 'center',
    gap: verticalScale(12),
    paddingTop: verticalScale(8),
  },
  sparkle: {
    fontSize: moderateScale(44),
  },
  matchTypeLabel: {
    fontSize: moderateScale(13),
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  partnerName: {
    fontSize: moderateScale(28),
    fontFamily: 'Poppins_600SemiBold',
    textAlign: 'center',
  },
  partnerMajor: {
    fontSize: moderateScale(15),
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
  },
  scoreBadge: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(6),
    borderRadius: moderateScale(20),
  },
  scoreText: {
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_600SemiBold',
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
  },
  countdownText: {
    fontSize: moderateScale(13),
    fontFamily: 'Poppins_400Regular',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    width: '100%',
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(14),
    marginTop: verticalScale(4),
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: moderateScale(16),
    fontFamily: 'Poppins_600SemiBold',
  },
});
