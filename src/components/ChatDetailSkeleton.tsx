import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

export default function ChatDetailSkeleton() {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
            paddingTop: insets.top,
        },
        // Header skeleton
        header: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: scale(16),
            paddingVertical: verticalScale(12),
            backgroundColor: theme.card,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            gap: moderateScale(12),
        },
        backButton: {
            width: scale(24),
            height: verticalScale(24),
            borderRadius: moderateScale(12),
            backgroundColor: theme.border,
        },
        avatar: {
            width: scale(40),
            height: verticalScale(40),
            borderRadius: moderateScale(20),
            backgroundColor: theme.border,
        },
        userName: {
            flex: 1,
            height: verticalScale(18),
            borderRadius: moderateScale(9),
            backgroundColor: theme.border,
            width: scale(120),
        },
        menuButton: {
            width: scale(24),
            height: verticalScale(24),
            borderRadius: moderateScale(12),
            backgroundColor: theme.border,
        },
        // Messages skeleton
        messagesContainer: {
            flex: 1,
            paddingHorizontal: scale(16),
            paddingVertical: verticalScale(12),
            gap: moderateScale(12),
        },
        messageRow: {
            marginBottom: verticalScale(12),
        },
        messageBubble: {
            borderRadius: moderateScale(20),
            paddingHorizontal: scale(16),
            paddingVertical: verticalScale(12),
            maxWidth: "80%",
            minWidth: scale(120),
        },
        otherUserBubble: {
            alignSelf: "flex-start",
            backgroundColor: theme.border,
        },
        currentUserBubble: {
            alignSelf: "flex-end",
            backgroundColor: theme.border,
        },
        messageLine: {
            height: verticalScale(14),
            borderRadius: moderateScale(7),
            backgroundColor: theme.card,
            marginBottom: verticalScale(4),
            width: "100%",
        },
        messageLineShort: {
            width: "70%",
        },
        messageLineLong: {
            width: "100%",
        },
        messageLineMedium: {
            width: "85%",
        },
        messageTime: {
            height: verticalScale(10),
            width: scale(50),
            borderRadius: moderateScale(5),
            backgroundColor: theme.border,
            marginTop: verticalScale(4),
        },
        currentUserTime: {
            alignSelf: "flex-end",
        },
        otherUserTime: {
            alignSelf: "flex-start",
        },
        // Input skeleton
        inputContainer: {
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: scale(16),
            paddingTop: verticalScale(12),
            paddingBottom: Math.max(insets.bottom, verticalScale(12)),
            backgroundColor: theme.card,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            gap: moderateScale(12),
        },
        input: {
            flex: 1,
            height: verticalScale(44),
            backgroundColor: theme.border,
            borderRadius: moderateScale(24),
        },
        sendButton: {
            width: scale(44),
            height: verticalScale(44),
            borderRadius: moderateScale(22),
            backgroundColor: theme.border,
        },
    });

    return (
        <View style={styles.container}>
            {/* Header Skeleton */}
            <View style={styles.header}>
                <View style={styles.backButton} />
                <View style={styles.avatar} />
                <View style={styles.userName} />
                <View style={styles.menuButton} />
            </View>

            {/* Messages Skeleton */}
            <View style={styles.messagesContainer}>
                {/* Other user message 1 */}
                <View style={styles.messageRow}>
                    <View style={[styles.messageBubble, styles.otherUserBubble]}>
                        <View style={[styles.messageLine, styles.messageLineLong]} />
                        <View style={[styles.messageLine, styles.messageLineShort]} />
                    </View>
                    <View style={[styles.messageTime, styles.otherUserTime]} />
                </View>

                {/* Other user message 2 */}
                <View style={styles.messageRow}>
                    <View style={[styles.messageBubble, styles.otherUserBubble]}>
                        <View style={[styles.messageLine, styles.messageLineShort]} />
                    </View>
                    <View style={[styles.messageTime, styles.otherUserTime]} />
                </View>

                {/* Current user message 1 */}
                <View style={styles.messageRow}>
                    <View style={[styles.messageBubble, styles.currentUserBubble]}>
                        <View style={[styles.messageLine, styles.messageLineLong]} />
                    </View>
                    <View style={[styles.messageTime, styles.currentUserTime]} />
                </View>

                {/* Other user message 3 */}
                <View style={styles.messageRow}>
                    <View style={[styles.messageBubble, styles.otherUserBubble]}>
                        <View style={[styles.messageLine, styles.messageLineMedium]} />
                        <View style={[styles.messageLine, styles.messageLineLong]} />
                        <View style={[styles.messageLine, styles.messageLineShort]} />
                    </View>
                    <View style={[styles.messageTime, styles.otherUserTime]} />
                </View>

                {/* Current user message 2 */}
                <View style={styles.messageRow}>
                    <View style={[styles.messageBubble, styles.currentUserBubble]}>
                        <View style={[styles.messageLine, styles.messageLineMedium]} />
                    </View>
                    <View style={[styles.messageTime, styles.currentUserTime]} />
                </View>
            </View>

            {/* Input Skeleton */}
            <View style={styles.inputContainer}>
                <View style={styles.input} />
                <View style={styles.sendButton} />
            </View>
        </View>
    );
}
