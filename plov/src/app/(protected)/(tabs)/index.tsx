import { View, FlatList, StyleSheet, Pressable } from "react-native";
import PostListItem from '../../../components/PostListItem';
import posts from '../../../../assets/data/posts.json';
import users from '../../../../assets/data/user.json';
import { Post, User } from '../../../types/types';
import comments from '../../../../assets/data/comments.json';
import { useTheme } from '../../../context/ThemeContext';
import { getPostScore } from '../../../utils/votes';
import { router } from 'expo-router';
import { AntDesign, FontAwesome } from '@expo/vector-icons';

export default function FeedScreen() {
    const { theme } = useTheme();

    // helper function to get user info from user_id
    const getUser = (user_id: string): User | undefined => {
        return users.find((user: { id: string; }) => user.id === user_id);
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <FlatList
                data={posts as Post[]}
                keyExtractor={(item) => item.id}
                renderItem={({ item }: { item: Post }) => {
                    const user = getUser(item.user_id); // find user object
                    const postScore = getPostScore(item.id);
                    return (
                        <PostListItem
                            post={{ ...item, upvotes: postScore } as any}
                            user={user}
                            commentCount={comments.filter(c => c.post_id === item.id).length}
                        />
                    );
                }}
            />
            {/* Floating Action Button */}
            <Pressable
                onPress={() => router.push('/create-post')}
                style={[styles.fab, { backgroundColor: theme.primary }]}
            >
                <FontAwesome name="plus" size={28} color="#fff" />
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    fab: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
    },
});