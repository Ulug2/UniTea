import { View, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: theme.card,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            gap: 12,
        },
        backButton: {
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: theme.border,
        },
        avatar: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.border,
        },
        userName: {
            flex: 1,
            height: 18,
            borderRadius: 9,
            backgroundColor: theme.border,
            width: 120,
        },
        menuButton: {
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: theme.border,
        },
        // Messages skeleton
        messagesContainer: {
            flex: 1,
            paddingHorizontal: 16,
            paddingVertical: 12,
            gap: 12,
        },
        messageRow: {
            marginBottom: 12,
        },
        messageBubble: {
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 12,
            maxWidth: "80%",
            minWidth: 120,
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
            height: 14,
            borderRadius: 7,
            backgroundColor: theme.card,
            marginBottom: 4,
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
            height: 10,
            width: 50,
            borderRadius: 5,
            backgroundColor: theme.border,
            marginTop: 4,
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
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: theme.card,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            gap: 12,
        },
        input: {
            flex: 1,
            height: 44,
            backgroundColor: theme.border,
            borderRadius: 24,
        },
        sendButton: {
            width: 44,
            height: 44,
            borderRadius: 22,
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

