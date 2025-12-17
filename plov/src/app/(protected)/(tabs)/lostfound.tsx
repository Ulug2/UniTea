import { View, Text, StyleSheet, FlatList, Pressable } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import LostFoundListItem from "../../../components/LostFoundListItem";
import posts from '../../../../assets/data/posts.json';
import users from '../../../../assets/data/user.json';
import { Post } from "../../../types/types";
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

export default function LostFoundScreen() {
    const { theme } = useTheme();

    // Filter only lost_found posts
    const lostFoundPosts = (posts as Post[]).filter(post => post.post_type === 'lost_found');

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <FlatList
                data={lostFoundPosts}
                keyExtractor={(item) => item.id}
                renderItem={({ item }: { item: Post }) => {
                    const user = users.find(u => u.id === item.user_id);
                    return <LostFoundListItem post={item} user={user} />;
                }}
            />
            {/* Floating Action Button */}
            <Pressable
                onPress={() => router.push('/create-post?type=lost_found')}
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
    text: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
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