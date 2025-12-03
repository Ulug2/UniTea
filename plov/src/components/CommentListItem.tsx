import { useState, memo } from 'react';
import { View, Text, Image, FlatList, Pressable, StyleSheet } from 'react-native';
import { Entypo, Octicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatDistanceToNowStrict } from 'date-fns';
import { useTheme } from '../context/ThemeContext';
import { Comment, User } from '../types/types';
import { getCommentScore } from '../utils/votes';
import nuLogo from '../../assets/images/nu-logo.png';

type CommentWithReplies = Comment & {
    replies?: CommentWithReplies[];
    user?: User;
};

type CommentListItemProps = {
    comment: CommentWithReplies;
    depth: number;
    handleReplyPress: (commentId: string) => void;
    parentUser?: User;
};

const CommentListItem = ({ comment, depth, handleReplyPress, parentUser }: CommentListItemProps) => {
    const { theme } = useTheme();
    const hasReplies = comment.replies && comment.replies.length > 0;
    const replyCount = comment.replies?.length || 0;

    // Auto-show replies if there are 3 or fewer
    const [showReplies, setShowReplies] = useState(replyCount <= 3 && replyCount > 0);

    const commentScore = getCommentScore(comment.id);

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.card,
                },
            ]}
        >
            {/* User Info */}
            <View style={styles.userRow}>
                <View style={styles.userInfo}>
                    <Image
                        source={
                            comment.user?.avatar_url
                                ? { uri: comment.user.avatar_url }
                                : nuLogo
                        }
                        style={styles.avatar}
                    />
                    <Text style={[styles.username, { color: theme.text }]}>
                        {comment.user?.username || 'Unknown'}
                    </Text>
                    {parentUser && (
                        <>
                            <MaterialCommunityIcons
                                name="play"
                                size={12}
                                color={theme.secondaryText}
                                style={{ marginLeft: 4 }}
                            />
                            <Text style={[styles.replyToUsername, { color: theme.secondaryText }]}>
                                {parentUser.username}
                            </Text>
                        </>
                    )}
                    <Text style={[styles.dot, { color: theme.secondaryText }]}>•</Text>
                    <Text style={[styles.time, { color: theme.secondaryText }]}>
                        {formatDistanceToNowStrict(new Date(comment.created_at))}
                    </Text>
                </View>
                <Entypo name="dots-three-horizontal" size={15} color={theme.secondaryText} />
            </View>

            {/* Comment Content */}
            <Text style={[styles.content, { color: theme.text }]}>{comment.content}</Text>

            {/* Comment Actions */}
            <View style={styles.actions}>
                <Pressable
                    onPress={() => handleReplyPress(comment.id)}
                    style={styles.actionButton}
                >
                    <Octicons name="reply" size={16} color={theme.secondaryText} />
                    <Text style={[styles.actionText, { color: theme.secondaryText }]}>Reply</Text>
                </Pressable>
                <View style={styles.votes}>
                    <MaterialCommunityIcons
                        name="arrow-up-bold-outline"
                        size={18}
                        color={theme.secondaryText}
                    />
                    <Text style={[styles.voteCount, { color: theme.secondaryText }]}>
                        {commentScore}
                    </Text>
                    <MaterialCommunityIcons
                        name="arrow-down-bold-outline"
                        size={18}
                        color={theme.secondaryText}
                    />
                </View>
            </View>

            {/* Show Replies Button - only show if more than 3 replies */}
            {hasReplies && !showReplies && replyCount > 3 && (
                <Pressable
                    onPress={() => setShowReplies(true)}
                    style={[styles.showRepliesButton, { backgroundColor: theme.background }]}
                >
                    <Text style={[styles.showRepliesText, { color: theme.secondaryText }]}>
                        Show {comment.replies!.length} {comment.replies!.length === 1 ? 'Reply' : 'Replies'}
                    </Text>
                </Pressable>
            )}

            {/* Nested Replies */}
            {showReplies && hasReplies && (
                <>
                    {/* Hide button only shows if more than 3 replies */}
                    {replyCount > 3 && (
                        <Pressable
                            onPress={() => setShowReplies(false)}
                            style={[styles.hideRepliesButton, { backgroundColor: theme.background }]}
                        >
                            <Text style={[styles.showRepliesText, { color: theme.secondaryText }]}>
                                Hide Replies
                            </Text>
                        </Pressable>
                    )}
                    <FlatList
                        data={comment.replies}
                        keyExtractor={(reply) => reply.id}
                        renderItem={({ item }) => (
                            <CommentListItem
                                comment={item}
                                depth={depth + 1}
                                handleReplyPress={handleReplyPress}
                                parentUser={comment.user}
                            />
                        )}
                        scrollEnabled={false}
                    />
                </>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 0,
        paddingHorizontal: 15,
        paddingVertical: 6,
        gap: 5,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 15,
        marginRight: 4,
    },
    username: {
        fontWeight: '600',
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
    },
    replyToUsername: {
        fontSize: 12,
        fontFamily: 'Poppins_400Regular',
        marginLeft: 2,
    },
    dot: {
        fontSize: 13,
    },
    time: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    content: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 22,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    actionText: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    votes: {
        flexDirection: 'row',
        gap: 5,
        alignItems: 'center',
    },
    voteCount: {
        fontWeight: '500',
        fontFamily: 'Poppins_500Medium',
    },
    showRepliesButton: {
        borderRadius: 6,
        paddingVertical: 6,
        alignItems: 'center',
        marginTop: 5,
    },
    hideRepliesButton: {
        borderRadius: 6,
        paddingVertical: 6,
        alignItems: 'center',
        marginTop: 5,
        marginBottom: 5,
    },
    showRepliesText: {
        fontSize: 12,
        letterSpacing: 0.5,
        fontWeight: '500',
        fontFamily: 'Poppins_500Medium',
    },
});

export default memo(CommentListItem);

