import { Image, Pressable, Text, View, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Post } from '../types/types';
import { formatDistanceToNowStrict } from 'date-fns';
import { Link } from 'expo-router';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import nuLogo from "../../assets/images/nu-logo.png";
import { useTheme } from '../context/ThemeContext';


type PostListItemProps = {
    post: Post;
    isDetailedPost?: boolean; // optional
    user?: { username: string; avatar_url: string | null }; // pass user info for display
    commentCount?: number;
};

export default function PostListItem({ post, isDetailedPost, user, commentCount }: PostListItemProps) {
    const { theme } = useTheme();

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

    return (
        <Link href={`/post/${post.id}`} asChild style={styles.link}>
            <Pressable style={styles.card}>
                {/* HEADER */}
                <View style={styles.header}>
                    {user && (
                        <View style={styles.userInfo}>
                            <Image
                                source={post.is_anonymous ? nuLogo : { uri: user.avatar_url || undefined }}
                                style={styles.avatar}
                            />
                            {post.is_anonymous ? <Text style={styles.username}>Anonymous</Text> : <Text style={styles.username}>{user.username}</Text>}

                        </View>
                    )}
                    <Text style={styles.time}>
                        <AntDesign name="clock-circle" size={12} color={theme.secondaryText} />
                        <Text> {formatDistanceToNowStrict(new Date(post.created_at))}</Text>
                    </Text>
                </View>

                {/* CONTENT */}
                <View style={{ marginTop: 1 }}>
                    {post.image_url && (
                        <Image source={{ uri: post.image_url }} style={styles.postImage} />
                    )}
                    {post.content && (
                        <Text numberOfLines={isDetailedPost ? undefined : 4} style={styles.contentText}>
                            {post.content}
                        </Text>
                    )}
                </View>


                {/* FOOTER */}
                <View style={styles.footer}>
                    <View style={styles.footerLeft}>
                        <View style={styles.iconBox}>
                            <MaterialCommunityIcons name="arrow-up-bold-outline" size={19} color={theme.text} />
                            <Text style={styles.iconText}>{post.upvotes}</Text>
                            <View style={styles.divider} />
                            <MaterialCommunityIcons name="arrow-down-bold-outline" size={19} color={theme.text} />
                        </View>
                        <View style={styles.iconBox}>
                            <MaterialCommunityIcons name="comment-outline" size={19} color={theme.text} />
                            <Text style={styles.iconText}>{commentCount || 0}</Text>
                        </View>
                    </View>
                    <View style={styles.footerRight}>
                        <MaterialCommunityIcons name="share-outline" size={19} color={theme.text} style={styles.iconBox} />
                    </View>
                </View>
            </Pressable>
        </Link>
    );
}