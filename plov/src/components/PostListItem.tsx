import React from 'react';
import { Image, Pressable, Text, View, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNowStrict } from 'date-fns';
import { Link, router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import nuLogo from "../../assets/images/nu-logo.png";
import { useTheme } from '../context/ThemeContext';
import { useVote } from '../hooks/useVote';
import SupabaseImage from './SupabaseImage';

type PostListItemProps = {
    // Post data from view
    postId: string;
    userId: string;
    content: string;
    imageUrl: string | null;
    category: string | null;
    location: string | null;
    postType?: string;
    isAnonymous: boolean | null;
    isEdited: boolean | null;
    createdAt: string | null;
    updatedAt?: string | null;
    editedAt?: string | null;
    viewCount?: number | null;

    // User data from view
    username: string;
    avatarUrl: string | null;
    isVerified: boolean | null;

    // Aggregated data from view
    commentCount: number;
    voteScore: number;
    userVote: 'upvote' | 'downvote' | null;

    // Repost data from view
    repostCount?: number;
    repostedFromPostId?: string | null;
    repostComment?: string | null;
    originalContent?: string | null;
    originalAuthorUsername?: string | null;
    originalAuthorAvatar?: string | null;
    originalIsAnonymous?: boolean | null;
    originalCreatedAt?: string | null;

    // Optional props for detailed post view
    isDetailedPost?: boolean;
    isBookmarked?: boolean;
    onBookmarkPress?: () => void;
};

const PostListItem = React.memo(function PostListItem({
    postId,
    userId,
    content,
    imageUrl,
    isAnonymous,
    isEdited,
    createdAt,
    username,
    avatarUrl,
    isVerified,
    commentCount,
    voteScore,
    userVote: initialUserVote,
    repostCount = 0,
    repostedFromPostId,
    repostComment,
    originalContent,
    originalAuthorUsername,
    originalAuthorAvatar,
    originalIsAnonymous,
    originalCreatedAt,
    isDetailedPost = false,
    isBookmarked = false,
    onBookmarkPress,
}: PostListItemProps) {
    const { theme } = useTheme();

    // Check if this is a repost
    const isRepost = !!repostedFromPostId;

    // Use voting hook for optimistic updates (still handles local state)
    const { userVote, score: postScore, handleUpvote, handleDownvote, isVoting } = useVote({
        postId: postId,
        initialUserVote,
        initialScore: voteScore,
    });

    // Handle repost button click - navigate to create-post screen
    const handleRepostClick = (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        // Navigate to create-post with repost ID
        const originalPostId = isRepost ? repostedFromPostId : postId;
        router.push(`/create-post?repostId=${originalPostId}`);
    };

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
            gap: 1,
        },
        repostHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
        },
        repostText: {
            fontSize: 13,
            color: theme.secondaryText,
            fontFamily: 'Poppins_400Regular',
        },
        repostComment: {
            fontSize: 15,
            color: theme.text,
            fontFamily: 'Poppins_400Regular',
            marginBottom: 10,
        },
        originalPostCard: {
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 12,
            padding: 12,
            backgroundColor: theme.background,
            marginTop: 8,
        },
        originalAuthor: {
            fontSize: 14,
            color: theme.text,
            fontFamily: 'Poppins_500Medium',
            marginBottom: 6,
        },
        originalContent: {
            fontSize: 15,
            color: theme.text,
            fontFamily: 'Poppins_400Regular',
            marginBottom: 6,
        },
        originalDate: {
            fontSize: 12,
            color: theme.secondaryText,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
        },
        userInfo: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        avatar: {
            width: 35,
            height: 35,
            borderRadius: 20,
            backgroundColor: theme.border,
        },
        username: {
            fontSize: 15,
            color: theme.text,
            fontFamily: 'Poppins_500Medium',
        },
        time: {
            fontSize: 12,
            color: theme.secondaryText,
            marginLeft: 10,
        },
        postImage: {
            width: '100%',
            aspectRatio: 4 / 3,
            borderRadius: 15,
            marginTop: 8,
        },
        contentText: {
            fontSize: 16,
            marginTop: 6,
            fontFamily: 'Poppins_400Regular',
            color: theme.text,
        },
        footer: {
            flexDirection: 'row',
            marginTop: 10,
            alignItems: 'center',
        },
        footerLeft: {
            flexDirection: 'row',
            gap: 10,
        },
        footerRight: {
            marginLeft: 'auto',
            flexDirection: 'row',
            gap: 10,
        },
        iconBox: {
            flexDirection: 'row',
            alignItems: 'center',
            borderWidth: 0.5,
            borderColor: theme.border,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 20,
            backgroundColor: theme.background,
        },
        iconText: {
            fontWeight: '500',
            marginLeft: 5,
            fontFamily: 'Poppins_400Regular',
            color: theme.text,
        },
        divider: {
            width: 1,
            backgroundColor: theme.border,
            height: 14,
            marginHorizontal: 7,
            alignSelf: 'center',
        },
    });

    const postCreatedAt = createdAt ? new Date(createdAt) : new Date();

    return (
        <>
            <Link href={`/post/${postId}`} asChild style={styles.link}>
                <Pressable style={styles.card}>
                    {/* REPOST HEADER */}
                    {isRepost && (
                        <View style={styles.repostHeader}>
                            <Ionicons name="repeat" size={16} color={theme.secondaryText} />
                            <Text style={styles.repostText}>
                                {username} reposted
                            </Text>
                        </View>
                    )}

                    {/* HEADER */}
                    <View style={styles.header}>
                        <View style={styles.userInfo}>
                            {isRepost ? (
                                // Show original author for reposts
                                originalIsAnonymous ? (
                                    <Image source={nuLogo} style={styles.avatar} />
                                ) : originalAuthorAvatar ? (
                                    originalAuthorAvatar.startsWith("http") ? (
                                        <Image
                                            source={{ uri: originalAuthorAvatar }}
                                            style={styles.avatar}
                                        />
                                    ) : (
                                        <SupabaseImage
                                            path={originalAuthorAvatar}
                                            bucket="avatars"
                                            style={styles.avatar}
                                        />
                                    )
                                ) : (
                                    <View style={styles.avatar} />
                                )
                            ) : (
                                // Show regular post author
                                isAnonymous ? (
                                    <Image source={nuLogo} style={styles.avatar} />
                                ) : avatarUrl ? (
                                    avatarUrl.startsWith("http") ? (
                                        <Image
                                            source={{ uri: avatarUrl }}
                                            style={styles.avatar}
                                        />
                                    ) : (
                                        <SupabaseImage
                                            path={avatarUrl}
                                            bucket="avatars"
                                            style={styles.avatar}
                                        />
                                    )
                                ) : (
                                    <View style={styles.avatar} />
                                )
                            )}
                            <Text style={styles.username}>
                                {isRepost
                                    ? (originalIsAnonymous ? 'Anonymous' : originalAuthorUsername)
                                    : (isAnonymous ? 'Anonymous' : username)
                                }
                            </Text>
                        </View>
                        <Text style={styles.time}>
                            <AntDesign name="clock-circle" size={12} color={theme.secondaryText} />
                            <Text> {formatDistanceToNowStrict(postCreatedAt)}</Text>
                        </Text>
                    </View>

                    {/* REPOST USER'S CONTENT (if user added text when reposting) */}
                    {isRepost && content && (
                        <Text style={styles.repostComment}>{content}</Text>
                    )}

                    {/* CONTENT */}
                    <View style={{ marginTop: 1 }}>
                        {isRepost ? (
                            // Show original post content in a card
                            <View style={styles.originalPostCard}>
                                <Text numberOfLines={isDetailedPost ? undefined : 4} style={styles.originalContent}>
                                    {originalContent}
                                </Text>
                                {originalCreatedAt && (
                                    <Text style={styles.originalDate}>
                                        Original post: {formatDistanceToNowStrict(new Date(originalCreatedAt))} ago
                                    </Text>
                                )}
                            </View>
                        ) : (
                            // Regular post content
                            <>
                                {imageUrl && (
                                    <SupabaseImage path={imageUrl} bucket="post-images" style={styles.postImage} />
                                )}
                                {content && (
                                    <Text numberOfLines={isDetailedPost ? undefined : 4} style={styles.contentText}>
                                        {content}
                                    </Text>
                                )}
                            </>
                        )}
                    </View>

                    {/* FOOTER */}
                    <View style={styles.footer}>
                        <View style={styles.footerLeft}>
                            <View style={styles.iconBox}>
                                <Pressable
                                    onPress={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleUpvote();
                                    }}
                                    disabled={isVoting}
                                >
                                    <MaterialCommunityIcons
                                        name={userVote === 'upvote' ? 'arrow-up-bold' : 'arrow-up-bold-outline'}
                                        size={19}
                                        color={userVote === 'upvote' ? theme.primary : theme.text}
                                    />
                                </Pressable>
                                <Text style={styles.iconText}>{postScore}</Text>
                                <View style={styles.divider} />
                                <Pressable
                                    onPress={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDownvote();
                                    }}
                                    disabled={isVoting}
                                >
                                    <MaterialCommunityIcons
                                        name={userVote === 'downvote' ? 'arrow-down-bold' : 'arrow-down-bold-outline'}
                                        size={19}
                                        color={userVote === 'downvote' ? theme.primary : theme.text}
                                    />
                                </Pressable>
                            </View>
                            <View style={styles.iconBox}>
                                <MaterialCommunityIcons name="comment-outline" size={19} color={theme.text} />
                                <Text style={styles.iconText}>{commentCount || 0}</Text>
                            </View>
                            <Pressable
                                onPress={handleRepostClick}
                                style={styles.iconBox}
                            >
                                <Ionicons
                                    name="repeat-outline"
                                    size={19}
                                    color={theme.text}
                                />
                                <Text style={styles.iconText}>{repostCount}</Text>
                            </Pressable>
                            {isDetailedPost && onBookmarkPress && (
                                <Pressable
                                    onPress={(e) => {
                                        e.preventDefault();
                                        onBookmarkPress();
                                    }}
                                    style={styles.iconBox}
                                >
                                    <MaterialCommunityIcons
                                        name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
                                        size={19}
                                        color={theme.text}
                                    />
                                </Pressable>
                            )}
                        </View>
                        <View style={styles.footerRight}>
                            <MaterialCommunityIcons name="share-outline" size={19} color={theme.text} style={styles.iconBox} />
                        </View>
                    </View>
                </Pressable>
            </Link>
        </>
    );
});

export default PostListItem;