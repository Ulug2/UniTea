import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { moderateScale, scale, verticalScale } from '../../../utils/scaling';
import { useAuth } from '../../../context/AuthContext';
import { useEventConfig } from '../hooks/useEventConfig';
import { useMySubmission } from '../hooks/useMySubmission';
import { useMatchWindowStatus } from '../hooks/useMatchWindowStatus';
import MatchmakingFormModal from './MatchmakingFormModal';
import MatchRevealModal from './MatchRevealModal';

export default function MatchmakingBanner() {
  const { theme } = useTheme();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const { data: phase } = useEventConfig();
  const { data: submission } = useMySubmission(userId);
  const windowStatus = useMatchWindowStatus(userId);

  const [formVisible, setFormVisible] = useState(false);
  const [revealVisible, setRevealVisible] = useState(false);

  // ── Visibility logic ────────────────────────────────────────
  if (!phase || phase === 'inactive' || phase === 'locked') return null;
  if (phase === 'accepting' && submission) return null;
  if (phase === 'revealed' && windowStatus.isExpired) return null;
  // Only show the revealed banner once the window has been set up
  // (i.e. user has already recorded their view). Before first view,
  // always show it so they can open the reveal.

  const isAccepting = phase === 'accepting';
  const isRevealed = phase === 'revealed';

  return (
    <>
      <Pressable
        style={[styles.banner, { backgroundColor: theme.card }]}
        onPress={() => {
          if (isAccepting) setFormVisible(true);
          if (isRevealed) setRevealVisible(true);
        }}
        android_ripple={{ color: theme.primary + '22' }}
      >
        {/* Accent bar */}
        <View style={[styles.accentBar, { backgroundColor: theme.primary }]} />

        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: theme.text }]}>
            {isAccepting ? '✨ Find Your Perfect Match' : 'Your match is ready 🔥'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            {isAccepting
              ? 'Join the Launch Week matchmaking — results in 14 days.'
              : 'See who you were matched with before your window closes.'}
          </Text>
        </View>

        <View style={[styles.ctaChip, { backgroundColor: theme.primary }]}>
          <Text style={styles.ctaText}>{isAccepting ? 'Join' : 'See'}</Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={moderateScale(16)}
            color="#FFFFFF"
          />
        </View>
      </Pressable>

      <MatchmakingFormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
      />
      <MatchRevealModal
        visible={revealVisible}
        onClose={() => setRevealVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: scale(12),
    marginBottom: verticalScale(8),
    borderRadius: moderateScale(14),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: verticalScale(2) },
    shadowOpacity: 0.08,
    shadowRadius: moderateScale(4),
    elevation: 3,
    gap: scale(12),
    paddingRight: scale(12),
    paddingVertical: verticalScale(12),
  },
  accentBar: {
    width: scale(4),
    alignSelf: 'stretch',
    borderRadius: moderateScale(4),
    marginLeft: scale(4),
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    gap: verticalScale(2),
  },
  title: {
    fontSize: moderateScale(14),
    fontFamily: 'Poppins_600SemiBold',
  },
  subtitle: {
    fontSize: moderateScale(12),
    fontFamily: 'Poppins_400Regular',
    lineHeight: moderateScale(17),
  },
  ctaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: moderateScale(20),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(10),
    gap: scale(2),
    flexShrink: 0,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: moderateScale(13),
    fontFamily: 'Poppins_600SemiBold',
  },
});
