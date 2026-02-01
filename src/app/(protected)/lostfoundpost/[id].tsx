// COMMENTED OUT FOR NOW - Will be implemented later
/*
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    Text,
    View,
    Pressable,
    ScrollView,
    StyleSheet,
    Image,
} from 'react-native';
import posts from '../../../../assets/data/posts.json';
import users from '../../../../assets/data/user.json';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Ionicons, AntDesign } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { formatDistanceToNowStrict } from 'date-fns';
import nuLogo from "../../../../assets/images/nu-logo.png";
import { DEFAULT_AVATAR } from "../../../constants/images";

export default function LostFoundPostDetailed() {
    const { id } = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();
    const router = useRouter();

    const detailedPost = posts.find((post) => post.id === id);
    const postUser = detailedPost ? users.find((u) => u.id === detailedPost.user_id) : null;

    if (!detailedPost) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <Text style={[styles.errorText, { color: theme.text }]}>Post Not Found!</Text>
            </View>
        );
    }

    // Extract title from content (first line or use category + item name)
    const contentLines = detailedPost.content?.split('\n') || [];
    const title = contentLines[0] || '';
    const description = contentLines.slice(1).join('\n').trim() || detailedPost.content;

    // Get the category prefix
    const categoryPrefix = detailedPost.category === 'lost' ? 'Lost:' : 'Found:';
    const displayTitle = title.startsWith('Lost:') || title.startsWith('Found:')
        ? title
        : `${categoryPrefix} ${title}`;

    // Get user's first initial for avatar
    const getInitial = () => {
        if (!postUser?.username) return '?';
        return postUser.username.charAt(0).toUpperCase();
    };

    const handleChatPress = () => {
        console.log('Starting chat with user:', postUser?.id);
        // Navigate to chat screen
        // router.push(`/chat/${postUser?.id}?postId=${detailedPost.id}`);
    };

    const dynamicStyles = StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: theme.background,
        },
        scrollContent: {
            paddingBottom: insets.bottom + 80,
        },
        card: {
            backgroundColor: theme.card,
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
        },
        userInfo: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        avatar: {
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: '#5DBEBC',
            justifyContent: 'center',
            alignItems: 'center',
        },
        avatarText: {
            fontSize: 22,
            color: '#FFFFFF',
            fontFamily: 'Poppins_600SemiBold',
        },
        avatarImage: {
            width: 50,
            height: 50,
            borderRadius: 25,
        },
        userDetails: {
            gap: 2,
        },
        username: {
            fontSize: 16,
            color: theme.text,
            fontFamily: 'Poppins_600SemiBold',
        },
        time: {
            fontSize: 13,
            color: theme.secondaryText,
            fontFamily: 'Poppins_400Regular',
        },
        title: {
            fontSize: 24,
            fontFamily: 'Poppins_700Bold',
            color: theme.text,
            marginBottom: 12,
            lineHeight: 32,
        },
        categoryBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            backgroundColor: detailedPost.category === 'lost' ? '#FF6B6B' : '#51CF66',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
            marginBottom: 12,
        },
        categoryText: {
            color: '#FFFFFF',
            fontSize: 13,
            fontFamily: 'Poppins_600SemiBold',
            marginLeft: 4,
        },
        locationContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: theme.background,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 12,
            marginBottom: 16,
        },
        locationText: {
            fontSize: 15,
            color: theme.text,
            fontFamily: 'Poppins_500Medium',
            flex: 1,
        },
        imageContainer: {
            marginBottom: 16,
        },
        postImage: {
            width: '100%',
            aspectRatio: 4 / 3,
            borderRadius: 15,
        },
        descriptionContainer: {
            marginBottom: 16,
        },
        sectionTitle: {
            fontSize: 16,
            fontFamily: 'Poppins_600SemiBold',
            color: theme.text,
            marginBottom: 8,
        },
        description: {
            fontSize: 15,
            fontFamily: 'Poppins_400Regular',
            color: theme.text,
            lineHeight: 24,
        },
        infoSection: {
            backgroundColor: theme.background,
            padding: 16,
            borderRadius: 12,
            gap: 12,
        },
        infoRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        infoLabel: {
            fontSize: 14,
            fontFamily: 'Poppins_500Medium',
            color: theme.secondaryText,
            minWidth: 80,
        },
        infoValue: {
            fontSize: 14,
            fontFamily: 'Poppins_400Regular',
            color: theme.text,
            flex: 1,
        },
        chatButtonContainer: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: theme.card,
            borderTopWidth: 1,
            borderTopColor: theme.border,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: insets.bottom + 12,
            shadowColor: theme.text,
            shadowOffset: {
                width: 0,
                height: -3,
            },
            shadowOpacity: 0.1,
            shadowRadius: 3,
            elevation: 4,
        },
        chatButton: {
            backgroundColor: '#5DBEBC',
            paddingVertical: 14,
            paddingHorizontal: 20,
            borderRadius: 25,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
        },
        chatButtonText: {
            color: '#FFFFFF',
            fontSize: 17,
            fontFamily: 'Poppins_600SemiBold',
        },
        errorText: {
            fontSize: 16,
            fontFamily: 'Poppins_400Regular',
        },
    });

    return (
        <View style={dynamicStyles.container}>
            <ScrollView contentContainerStyle={dynamicStyles.scrollContent}>
                <View style={dynamicStyles.card}>
                    {// HEADER - COMMENTED OUT FOR NOW - Will be implemented later }
<View style={dynamicStyles.header}>
    <View style={dynamicStyles.userInfo}>
        {postUser?.avatar_url ? (
            postUser.avatar_url.startsWith('http') ? (
                <Image
                    source={{ uri: postUser.avatar_url }}
                    style={dynamicStyles.avatarImage}
                />
            ) : (
                <SupabaseImage
                    path={postUser.avatar_url}
                    bucket="avatars"
                    style={dynamicStyles.avatarImage}
                />
            )
        ) : (
            <Image source={DEFAULT_AVATAR} style={dynamicStyles.avatarImage} />
        )}
        <View style={dynamicStyles.userDetails}>
            <Text style={dynamicStyles.username}>{postUser?.username || 'Unknown'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <AntDesign name="clock-circle" size={11} color={theme.secondaryText} />
                <Text style={dynamicStyles.time}>
                    {formatDistanceToNowStrict(new Date(detailedPost.created_at))} ago
                </Text>
            </View>
        </View>
    </View>
</View>

{// CATEGORY BADGE - COMMENTED OUT FOR NOW - Will be implemented later }
<View style={dynamicStyles.categoryBadge}>
    <Ionicons
        name={detailedPost.category === 'lost' ? 'alert-circle' : 'checkmark-circle'}
        size={16}
        color="#FFFFFF"
    />
    <Text style={dynamicStyles.categoryText}>
        {detailedPost.category === 'lost' ? 'LOST' : 'FOUND'}
    </Text>
</View>

{// TITLE - COMMENTED OUT FOR NOW - Will be implemented later }
<Text style={dynamicStyles.title}>{displayTitle}</Text>

{// LOCATION - COMMENTED OUT FOR NOW - Will be implemented later }
{
    detailedPost.location && (
        <View style={dynamicStyles.locationContainer}>
            <Ionicons name="location" size={20} color="#5DBEBC" />
            <Text style={dynamicStyles.locationText}>{detailedPost.location}</Text>
        </View>
    )
}

{// IMAGE - COMMENTED OUT FOR NOW - Will be implemented later }
{
    detailedPost.image_url && (
        <View style={dynamicStyles.imageContainer}>
            <Image source={{ uri: detailedPost.image_url }} style={dynamicStyles.postImage} />
        </View>
    )
}

{// DESCRIPTION - COMMENTED OUT FOR NOW - Will be implemented later }
<View style={dynamicStyles.descriptionContainer}>
    <Text style={dynamicStyles.sectionTitle}>Description</Text>
    <Text style={dynamicStyles.description}>{description}</Text>
</View>

{// ADDITIONAL INFO - COMMENTED OUT FOR NOW - Will be implemented later }
<View style={dynamicStyles.infoSection}>
    <View style={dynamicStyles.infoRow}>
        <Text style={dynamicStyles.infoLabel}>Status:</Text>
        <Text style={dynamicStyles.infoValue}>
            {detailedPost.category === 'lost' ? 'Looking for item' : 'Item found'}
        </Text>
    </View>
    <View style={dynamicStyles.infoRow}>
        <Text style={dynamicStyles.infoLabel}>Posted:</Text>
        <Text style={dynamicStyles.infoValue}>
            {new Date(detailedPost.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            })}
        </Text>
    </View>
    <View style={dynamicStyles.infoRow}>
        <Text style={dynamicStyles.infoLabel}>Views:</Text>
        <Text style={dynamicStyles.infoValue}>{detailedPost.view_count}</Text>
    </View>
</View>
                </View >
            </ScrollView >

    {// CHAT BUTTON - COMMENTED OUT FOR NOW - Will be implemented later }
    < View style = { dynamicStyles.chatButtonContainer } >
        <Pressable style={dynamicStyles.chatButton} onPress={handleChatPress}>
            <MaterialCommunityIcons name="message-outline" size={22} color="#FFFFFF" />
            <Text style={dynamicStyles.chatButtonText}>
                Chat with {postUser?.username || 'User'}
            </Text>
        </Pressable>
            </View >
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
    },
});
*/

// Placeholder component for now
import { View, Text } from 'react-native';

export default function LostFoundPostDetailed() {
    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text>Lost & Found Detail - Coming Soon</Text>
        </View>
    );
}

