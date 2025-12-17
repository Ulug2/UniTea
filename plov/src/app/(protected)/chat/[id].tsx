import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import {
    View,
    Text,
    TextInput,
    Pressable,
    FlatList,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isYesterday } from 'date-fns';
import chats from '../../../../assets/data/chats.json';
import chatMessages from '../../../../assets/data/chat_messages.json';
import users from '../../../../assets/data/user.json';
import { Chat, ChatMessage, User } from '../../../types/types';

export default function ChatDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const [message, setMessage] = useState('');
    const currentUserId = 'user-1'; // Demo current user

    // Get chat data
    const chat = (chats as Chat[]).find(c => c.id === id);

    // Get other user
    const otherUserId = chat?.participant_1_id === currentUserId
        ? chat?.participant_2_id
        : chat?.participant_1_id;

    const isAnonymous = otherUserId?.startsWith('anonymous-');
    const otherUser = isAnonymous ? null : users.find(u => u.id === otherUserId);

    const otherUserName = isAnonymous
        ? `Anonymous User #${Math.floor(Math.random() * 9000) + 1000}`
        : otherUser?.username || 'Unknown User';

    const otherUserInitial = isAnonymous
        ? '?'
        : otherUser?.username?.charAt(0).toUpperCase() || '?';

    // Get messages for this chat
    const messages = (chatMessages as ChatMessage[])
        .filter(msg => msg.chat_id === id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const getMessageTime = (dateString: string) => {
        const date = new Date(dateString);
        return format(date, 'h:mm a');
    };

    const getDateDivider = (dateString: string) => {
        const date = new Date(dateString);
        if (isToday(date)) return 'Today';
        if (isYesterday(date)) return 'Yesterday';
        return format(date, 'MMMM d, yyyy');
    };

    const shouldShowDateDivider = (currentMsg: ChatMessage, previousMsg: ChatMessage | null) => {
        if (!previousMsg) return true;
        const currentDate = new Date(currentMsg.created_at).toDateString();
        const previousDate = new Date(previousMsg.created_at).toDateString();
        return currentDate !== previousDate;
    };

    const handleSend = () => {
        if (message.trim()) {
            console.log('Sending message:', message);
            // In production, this would send the message via API
            setMessage('');
        }
    };

    const renderMessage = ({ item, index }: { item: ChatMessage; index: number }) => {
        const isCurrentUser = item.user_id === currentUserId;
        const previousMsg = index > 0 ? messages[index - 1] : null;
        const showDateDivider = shouldShowDateDivider(item, previousMsg);

        return (
            <>
                {showDateDivider && (
                    <View style={styles.dateDividerContainer}>
                        <View style={[styles.dateDivider, { backgroundColor: theme.border }]}>
                            <Text style={[styles.dateDividerText, { color: theme.secondaryText }]}>
                                {getDateDivider(item.created_at)}
                            </Text>
                        </View>
                    </View>
                )}
                <View
                    style={[
                        styles.messageContainer,
                        isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage,
                    ]}
                >
                    <View
                        style={[
                            styles.messageBubble,
                            {
                                backgroundColor: isCurrentUser ? '#5DBEBC' : theme.card,
                                borderRadius: 20,
                            },
                        ]}
                    >
                        <Text
                            style={[
                                styles.messageText,
                                {
                                    color: isCurrentUser ? '#FFFFFF' : theme.text,
                                },
                            ]}
                        >
                            {item.content}
                        </Text>
                    </View>
                    <Text
                        style={[
                            styles.messageTime,
                            { color: theme.secondaryText },
                            isCurrentUser && styles.currentUserTime,
                        ]}
                    >
                        {getMessageTime(item.created_at)}
                    </Text>
                </View>
            </>
        );
    };

    const dynamicStyles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
            paddingTop: insets.top,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: theme.card,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
        },
        backButton: {
            padding: 4,
            marginRight: 12,
        },
        avatar: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#5DBEBC',
            justifyContent: 'center',
            alignItems: 'center',
            marginRight: 12,
        },
        avatarText: {
            fontSize: 18,
            color: '#FFFFFF',
            fontFamily: 'Poppins_600SemiBold',
        },
        userName: {
            flex: 1,
            fontSize: 18,
            fontFamily: 'Poppins_600SemiBold',
            color: theme.text,
        },
        menuButton: {
            padding: 4,
        },
        messagesList: {
            paddingHorizontal: 16,
            paddingVertical: 12,
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
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
            backgroundColor: theme.background,
            borderRadius: 24,
            paddingHorizontal: 18,
            paddingVertical: 12,
            fontSize: 15,
            fontFamily: 'Poppins_400Regular',
            color: theme.text,
            maxHeight: 100,
        },
        sendButton: {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#5DBEBC',
            justifyContent: 'center',
            alignItems: 'center',
        },
    });

    return (
        <View style={dynamicStyles.container}>
            {/* HEADER */}
            <View style={dynamicStyles.header}>
                <Pressable onPress={() => router.back()} style={dynamicStyles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={theme.text} />
                </Pressable>

                <View style={dynamicStyles.avatar}>
                    <Text style={dynamicStyles.avatarText}>{otherUserInitial}</Text>
                </View>

                <Text style={dynamicStyles.userName}>{otherUserName}</Text>

                <Pressable style={dynamicStyles.menuButton}>
                    <Ionicons name="ellipsis-vertical" size={24} color={theme.text} />
                </Pressable>
            </View>

            {/* MESSAGES LIST */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={0}
            >
                <FlatList
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={dynamicStyles.messagesList}
                    inverted={false}
                />

                {/* INPUT */}
                <View style={dynamicStyles.inputContainer}>
                    <TextInput
                        placeholder="Type a message..."
                        placeholderTextColor={theme.secondaryText}
                        value={message}
                        onChangeText={setMessage}
                        style={dynamicStyles.input}
                        multiline
                    />
                    <Pressable
                        onPress={handleSend}
                        style={dynamicStyles.sendButton}
                        disabled={!message.trim()}
                    >
                        <Ionicons name="send" size={20} color="#FFFFFF" />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    dateDividerContainer: {
        alignItems: 'center',
        marginVertical: 16,
    },
    dateDivider: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
    },
    dateDividerText: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    messageContainer: {
        marginBottom: 12,
        maxWidth: '75%',
    },
    currentUserMessage: {
        alignSelf: 'flex-end',
        alignItems: 'flex-end',
    },
    otherUserMessage: {
        alignSelf: 'flex-start',
        alignItems: 'flex-start',
    },
    messageBubble: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    messageText: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
    },
    messageTime: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginTop: 4,
        marginHorizontal: 4,
    },
    currentUserTime: {
        textAlign: 'right',
    },
});
