import { View, Text, StyleSheet, FlatList, TextInput } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import ChatListItem from "../../../components/ChatListItem";
import chats from '../../../../assets/data/chats.json';
import chatMessages from '../../../../assets/data/chat_messages.json';
import users from '../../../../assets/data/user.json';
import { Chat, ChatMessage, User } from "../../../types/types";
import { Ionicons } from '@expo/vector-icons';

export default function ChatScreen() {
    const { theme } = useTheme();
    const currentUserId = 'user-1'; // Demo current user

    // Get last message for each chat
    const getLastMessage = (chatId: string): string => {
        const messages = (chatMessages as ChatMessage[])
            .filter(msg => msg.chat_id === chatId)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return messages[0]?.content || '';
    };

    // Get unread count for each chat
    const getUnreadCount = (chatId: string): number => {
        return (chatMessages as ChatMessage[])
            .filter(msg => msg.chat_id === chatId && !msg.is_read && msg.user_id !== currentUserId)
            .length;
    };

    const getOtherUser = (chat: Chat): { user: User | null; isAnonymous: boolean } => {
        const otherUserId = chat.participant_1_id === currentUserId
            ? chat.participant_2_id
            : chat.participant_1_id;

        const isAnonymous = otherUserId.startsWith('anonymous-');

        if (isAnonymous) {
            return { user: null, isAnonymous: true };
        }

        const user = users.find(u => u.id === otherUserId) || null;
        return { user, isAnonymous: false };
    };

    const styles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        header: {
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 10,
            backgroundColor: theme.background,
        },
        title: {
            fontSize: 32,
            fontFamily: 'Poppins_700Bold',
            color: theme.text,
            marginBottom: 16,
        },
        searchContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: theme.card,
            borderRadius: 12,
            paddingHorizontal: 14,
            paddingVertical: 12,
            gap: 10,
        },
        searchInput: {
            flex: 1,
            fontSize: 15,
            fontFamily: 'Poppins_400Regular',
            color: theme.text,
        },
    });

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.searchContainer}>
                    <Ionicons name="search" size={20} color={theme.secondaryText} />
                    <TextInput
                        placeholder="Search conversations..."
                        placeholderTextColor={theme.secondaryText}
                        style={styles.searchInput}
                    />
                </View>
            </View>

            <FlatList
                data={chats as Chat[]}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                    const { user, isAnonymous } = getOtherUser(item);
                    return (
                        <ChatListItem
                            chat={item}
                            otherUser={user}
                            lastMessage={getLastMessage(item.id)}
                            unreadCount={getUnreadCount(item.id)}
                            isAnonymous={isAnonymous}
                        />
                    );
                }}
            />
        </View>
    );
}