import { useState, useRef, useCallback, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
    Text,
    View,
    TextInput,
    Pressable,
    KeyboardAvoidingView,
    Platform,
    FlatList,
    StyleSheet,
} from 'react-native';
import posts from '../../../../assets/data/posts.json';
import comments from '../../../../assets/data/comments.json';
import users from '../../../../assets/data/user.json';
import bookmarks from '../../../../assets/data/bookmarks.json';
import PostListItem from '../../../components/PostListItem';
import CommentListItem from '../../../components/CommentListItem';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../../context/ThemeContext';
import { getPostScore } from '../../../utils/votes';
import { Comment, User } from '../../../types/types';

type CommentWithReplies = Comment & {
    replies?: CommentWithReplies[];
    user?: User;
};

export default function PostDetailed() {
    const { id } = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const { theme } = useTheme();

    const [comment, setComment] = useState<string>('');
    const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
    const inputRef = useRef<TextInput | null>(null);

    // For demo purposes, using user-1 as current user
    const currentUserId = 'user-1';

    const detailedPost = posts.find((post) => post.id === id);

    // Check if post is bookmarked by current user
    const initialBookmarkState = detailedPost
        ? bookmarks.some(b => b.user_id === currentUserId && b.post_id === detailedPost.id)
        : false;
    const [isBookmarked, setIsBookmarked] = useState(initialBookmarkState);

    // Get user for the post
    const postUser = detailedPost ? users.find((u) => u.id === detailedPost.user_id) : null;

    // Calculate vote counts for the post using utility function
    const postScore = detailedPost ? getPostScore(detailedPost.id) : 0;

    // Build nested comments structure
    const nestedComments = useMemo(() => {
        if (!detailedPost) return [];

        const allComments = comments.filter(
            (comment) => comment.post_id === detailedPost.id && !comment.is_deleted
        );

        // Add user info to comments
        const commentsWithUsers: CommentWithReplies[] = allComments.map(c => ({
            ...c,
            user: users.find(u => u.id === c.user_id),
            replies: [],
        }));


        // Build nested structure
        const commentMap = new Map<string, CommentWithReplies>();
        const topLevelComments: CommentWithReplies[] = [];

        // First pass: create map of all comments
        commentsWithUsers.forEach(comment => {
            commentMap.set(comment.id, comment);
        });

        // Second pass: build tree structure
        commentsWithUsers.forEach(comment => {
            if (comment.parent_comment_id) {
                const parent = commentMap.get(comment.parent_comment_id);
                if (parent) {
                    if (!parent.replies) parent.replies = [];
                    parent.replies.push(comment);
                }
            } else {
                topLevelComments.push(comment);
            }
        });

        return topLevelComments;
    }, [detailedPost?.id]);

    if (!detailedPost) {
        return (
            <View style={[styles.container, { backgroundColor: theme.background }]}>
                <Text style={[styles.errorText, { color: theme.text }]}>Post Not Found!</Text>
            </View>
        );
    }

    const toggleBookmark = () => {
        setIsBookmarked(!isBookmarked);
        console.log(isBookmarked ? 'Removed bookmark' : 'Added bookmark');
        // In production, this would make an API call to update the bookmarks table
    };

    // useCallback with memo inside CommentListItem prevents re-renders when replying to a comment
    const handleReplyPress = useCallback((commentId: string) => {
        console.log('Reply to comment:', commentId);
        inputRef.current?.focus();
    }, []);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1, backgroundColor: theme.background }}
            keyboardVerticalOffset={insets.top + 10}
        >
            <FlatList
                ListHeaderComponent={
                    <PostListItem
                        post={{ ...detailedPost, upvotes: postScore } as any}
                        isDetailedPost
                        user={postUser || undefined}
                        commentCount={nestedComments.length}
                        isBookmarked={isBookmarked}
                        onBookmarkPress={toggleBookmark}
                    />
                }
                data={nestedComments}
                renderItem={({ item }) => (
                    <CommentListItem
                        comment={item}
                        depth={0}
                        handleReplyPress={handleReplyPress}
                    />
                )}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 10 }}
            />
            {/* POST A COMMENT */}
            <View
                style={[
                    styles.inputContainer,
                    {
                        paddingBottom: insets.bottom,
                        backgroundColor: theme.card,
                        borderTopColor: theme.border,
                        shadowColor: theme.text,
                    },
                ]}
            >
                <View style={styles.inputRow}>
                    <TextInput
                        ref={inputRef}
                        placeholder="Comment..."
                        placeholderTextColor={theme.secondaryText}
                        value={comment}
                        onChangeText={(text) => setComment(text)}
                        style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
                        multiline
                        onFocus={() => setIsInputFocused(true)}
                        onBlur={() => setIsInputFocused(false)}
                    />
                    <Pressable
                        disabled={!comment}
                        onPress={() => console.log('Reply pressed')}
                        style={[
                            styles.replyButton,
                            {
                                backgroundColor: !comment ? theme.border : theme.primary,
                            },
                        ]}
                    >
                        <MaterialCommunityIcons
                            name="send"
                            size={20}
                            color="#fff"
                        />
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
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
    inputContainer: {
        borderTopWidth: 1,
        padding: 10,
        borderRadius: 10,
        shadowOffset: {
            width: 0,
            height: -3,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 4,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
    },
    input: {
        flex: 1,
        padding: 10,
        borderRadius: 20,
        fontFamily: 'Poppins_400Regular',
        fontSize: 15,
        minHeight: 40,
        maxHeight: 100,
    },
    replyButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
});