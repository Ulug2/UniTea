import { View, Text, Pressable, StyleSheet, Image } from "react-native";
import { Post } from "../types/types";
import { useTheme } from "../context/ThemeContext";
import { formatDistanceToNowStrict } from 'date-fns';
import { AntDesign, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from "expo-router";

type LostFoundListItemProps = {
    post: Post;
    user?: { username: string; avatar_url: string | null };
};

export default function LostFoundListItem({ post, user }: LostFoundListItemProps) {
    const { theme } = useTheme();

    // Get the category prefix
    const categoryPrefix = post.category === 'lost' ? 'Lost' : 'Found';

    const styles = StyleSheet.create({
        link: {
            textDecorationLine: 'none',
        },
        card: {
            paddingHorizontal: 15,
            paddingVertical: 12,
            backgroundColor: theme.card,
            borderBottomWidth: 0.5,
            borderBottomColor: theme.border,
            gap: 8,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        userInfo: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        avatar: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#5DBEBC',
            justifyContent: 'center',
            alignItems: 'center',
        },
        avatarText: {
            fontSize: 18,
            color: '#FFFFFF',
            fontFamily: 'Poppins_600SemiBold',
        },
        avatarImage: {
            width: 40,
            height: 40,
            borderRadius: 20,
        },
        username: {
            fontSize: 15,
            color: theme.text,
            fontFamily: 'Poppins_500Medium',
        },
        time: {
            fontSize: 13,
            color: theme.secondaryText,
            fontFamily: 'Poppins_400Regular',
        },
        title: {
            fontSize: 17,
            fontFamily: 'Poppins_700Bold',
            color: theme.text,
        },
        locationContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
        },
        locationText: {
            fontSize: 14,
            color: theme.secondaryText,
            fontFamily: 'Poppins_400Regular',
        },
        description: {
            fontSize: 15,
            fontFamily: 'Poppins_400Regular',
            color: theme.secondaryText,
            lineHeight: 22,
        },
        chatButton: {
            backgroundColor: '#5DBEBC',
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 25,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginTop: 4,
        },
        chatButtonText: {
            color: '#FFFFFF',
            fontSize: 16,
            fontFamily: 'Poppins_600SemiBold',
        },
    });

    // Get user's first initial for avatar
    const getInitial = () => {
        if (!user?.username) return '?';
        return user.username.charAt(0).toUpperCase();
    };

    return (
        // <Link href={`/lostfoundpost/${post.id}`} asChild style={styles.link}>
        <Pressable style={styles.card}>
            {/* HEADER */}
            <View style={styles.header}>
                <View style={styles.userInfo}>
                    {user?.avatar_url ? (
                        <Image
                            source={{ uri: user.avatar_url }}
                            style={styles.avatarImage}
                        />
                    ) : (
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{getInitial()}</Text>
                        </View>
                    )}
                    <Text style={styles.username}>{user?.username || 'Unknown'}</Text>
                </View>
                <Text style={styles.time}>
                    {formatDistanceToNowStrict(new Date(post.created_at))} ago
                </Text>
            </View>

            {/* CATEGORY AND LOCATION */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={styles.title}>{categoryPrefix}</Text>
                {post.location && (
                    <View style={styles.locationContainer}>
                        <Ionicons name="location-outline" size={14} color={theme.secondaryText} />
                        <Text style={styles.locationText}>{post.location}</Text>
                    </View>
                )}
            </View>

            {/* CONTENT */}
            <Text style={styles.description} numberOfLines={3}>
                {post.content}
            </Text>

            {/* CHAT BUTTON */}
            <Pressable
                style={styles.chatButton}
                onPress={(e) => {
                    e.preventDefault();
                    // Handle chat button press
                    router.push(`/chat/${post.id}`);
                }}
            >
                <MaterialCommunityIcons name="message-outline" size={20} color="#FFFFFF" />
                <Text style={styles.chatButtonText}>Chat</Text>
            </Pressable>
        </Pressable>
        // </Link>
    );
}