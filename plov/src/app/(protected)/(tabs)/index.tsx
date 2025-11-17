import { View, FlatList, StyleSheet } from "react-native";
import PostListItem from '../../../components/PostListItem';
import posts from '../../../../assets/data/posts.json';
import users from '../../../../assets/data/user.json';
import { Post, User } from '../../../types/types';
import comments from '../../../../assets/data/comments.json';
import { useTheme } from '../../../context/ThemeContext';

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
                    return <PostListItem post={item} user={user} commentCount={comments.filter(c => c.post_id === item.id).length} />;
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});