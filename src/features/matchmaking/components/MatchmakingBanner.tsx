import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { moderateScale, scale, verticalScale } from '../../../utils/scaling';
import { useAuth } from '../../../context/AuthContext';
import { useEventConfig } from '../hooks/useEventConfig';
import { useMySubmission } from '../hooks/useMySubmission';
import { useMyMatch } from '../hooks/useMyMatch';
import { useMatchWindowStatus } from '../hooks/useMatchWindowStatus';
import MatchmakingFormModal from './MatchmakingFormModal';
import MatchRevealModal from './MatchRevealModal';

type MatchmakingBannerProps = {
  /**
   * Reports once — the first time this component's own eligibility logic
   * resolves whether it will render real content or nothing — so the
   * parent (the feed screen) can animate its reserved space into place
   * exactly when real content appears, instead of the space snapping open
   * instantly the moment this component's async data resolves (Phase 7.2).
   * Never called again after the first report, even if visibility changes
   * later (e.g. the user dismisses the banner) — that's a separate,
   * already-existing interaction this fix doesn't touch.
   */
  onVisibilityResolved?: (visible: boolean) => void;
};

export default function MatchmakingBanner({
  onVisibilityResolved,
}: MatchmakingBannerProps = {}) {
  const { theme } = useTheme();
  const { session, cachedProfile } = useAuth();
  const userId = session?.user?.id;

  const { data: phase } = useEventConfig(cachedProfile?.university_id ?? undefined);
  const { data: submission } = useMySubmission(userId);
  // React Query dedupes this against MatchRevealModal's own useMyMatch call
  // below (same query key) — no extra network request, just lets the
  // teaser text avoid promising a match that isn't there (see
  // isRevealedWithNoMatch, mirrors MatchRevealModal's own check).
  const { data: match, isLoading: matchLoading } = useMyMatch(userId);
  const windowStatus = useMatchWindowStatus(userId);

  const isRevealed = phase === 'revealed';
  // Avoids promising "your match is ready" to someone who, once they tap
  // in, will actually see MatchRevealModal's "No Match This Round" state —
  // odd-sized participant pools mean not everyone gets paired. Computed
  // here (before the early return below) since the dismiss-tracking hooks
  // below need it too.
  const isRevealedWithNoMatch = isRevealed && !matchLoading && !match;

  const [formVisible, setFormVisible] = useState(false);
  const [revealVisible, setRevealVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hasSeenNoMatch, setHasSeenNoMatch] = useState(false);

  // Round identifier for the dismiss-persistence key: prefer the
  // DB-persisted viewed_at (set once a real match is opened), falling back
  // to the submission timestamp when there's no match at all —
  // launch_event_message_windows requires a match_id (NOT NULL FK), so
  // there's no server row to key off of when the user wasn't matched. Both
  // are stable per event round and change automatically for next year's.
  const dismissRoundKey = windowStatus.viewed_at ?? submission?.submitted_at ?? null;
  const dismissKey = userId && dismissRoundKey
    ? `@mm_banner_dismissed_${userId}_${dismissRoundKey}`
    : null;
  // Separate persisted flag standing in for viewed_at specifically for the
  // no-match case — without it, canDismiss below would have no way to know
  // the user already opened the reveal and saw why they weren't matched.
  const noMatchSeenKey = userId && submission?.submitted_at
    ? `@mm_no_match_seen_${userId}_${submission.submitted_at}`
    : null;

  useEffect(() => {
    if (!dismissKey) return;
    AsyncStorage.getItem(dismissKey).then((val) => {
      if (val === 'true') setDismissed(true);
    });
  }, [dismissKey]);

  useEffect(() => {
    if (!noMatchSeenKey) return;
    AsyncStorage.getItem(noMatchSeenKey).then((val) => {
      if (val === 'true') setHasSeenNoMatch(true);
    });
  }, [noMatchSeenKey]);

  // Marks the no-match reveal as "seen" the moment the user opens it — the
  // no-match equivalent of viewed_at getting set for a real match — so the
  // dismiss (X) button can appear afterward instead of never at all.
  useEffect(() => {
    if (!revealVisible || !isRevealedWithNoMatch || !noMatchSeenKey || hasSeenNoMatch) return;
    AsyncStorage.setItem(noMatchSeenKey, 'true');
    setHasSeenNoMatch(true);
  }, [revealVisible, isRevealedWithNoMatch, noMatchSeenKey, hasSeenNoMatch]);

  const handleDismiss = useCallback(() => {
    if (!dismissKey) return;
    Alert.alert(
      'Remove match banner?',
      isRevealedWithNoMatch
        ? "You won't see this notification anymore."
        : "You won't see your match notification anymore. If you haven't messaged them yet, you'll lose the chance once the window closes.",
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Dismiss',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.setItem(dismissKey, 'true');
            setDismissed(true);
          },
        },
      ],
    );
  }, [dismissKey, isRevealedWithNoMatch]);

  // ── Visibility logic (matches the spec state machine exactly — same
  // conditions as before, restructured from early-returns into one
  // boolean so it can also drive the onVisibilityResolved report below) ──
  // In the revealed phase, only participants (who submitted) can see their
  // match. Non-participants and users whose 24h window has expired both
  // see nothing.
  const isEligibilityLoading = phase === undefined;
  const isVisible =
    !isEligibilityLoading &&
    phase !== 'inactive' &&
    phase !== 'locked' &&
    !(phase === 'accepting' && submission) &&
    !(phase === 'revealed' && !submission) &&
    !(phase === 'revealed' && windowStatus.isExpired) &&
    !(phase === 'revealed' && dismissed);

  const reportedVisibilityRef = useRef(false);
  useEffect(() => {
    if (isEligibilityLoading) return; // not determined yet — don't report
    if (reportedVisibilityRef.current) return;
    reportedVisibilityRef.current = true;
    onVisibilityResolved?.(isVisible);
  }, [isEligibilityLoading, isVisible, onVisibilityResolved]);

  if (!isVisible) return null;

  const isAccepting = phase === 'accepting';
  // Dismiss X shows once the user has viewed their match (viewed_at is
  // set) — or, when there wasn't one, once they've opened the reveal and
  // seen why (hasSeenNoMatch).
  const canDismiss =
    isRevealed && (!!windowStatus.viewed_at || (isRevealedWithNoMatch && hasSeenNoMatch));

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
            {isAccepting
              ? '✨ Find Your Perfect Match'
              : isRevealedWithNoMatch
                ? 'Results are in 💛'
                : 'Your match is ready 🔥'}
          </Text>
          <Text style={[styles.subtitle, { color: theme.secondaryText }]}>
            {isAccepting
              ? 'Join the Launch Week matchmaking — results in 14 days.'
              : isRevealedWithNoMatch
                ? "Tap to see what happened — it's not you, we promise!"
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

        {canDismiss && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            hitSlop={8}
            style={styles.dismissBtn}
          >
            <MaterialCommunityIcons
              name="close"
              size={moderateScale(18)}
              color={theme.secondaryText}
            />
          </Pressable>
        )}
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
  dismissBtn: {
    padding: scale(4),
    marginRight: scale(2),
    flexShrink: 0,
  },
});
