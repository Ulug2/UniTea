import { View, Text, Switch, StyleSheet, Pressable, FlatList, Modal, ScrollView } from "react-native";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { useState, useEffect } from "react";
import { router, useNavigation } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import posts from '../../../../assets/data/posts.json';
import users from '../../../../assets/data/user.json';
import { Post } from "../../../types/types";
import { getPostScore } from '../../../utils/votes';
import comments from '../../../../assets/data/comments.json';
import { useAuth } from '../../../context/AuthContext';

export default function ProfileScreen() {
    const { theme, isDark, toggleTheme } = useTheme();
    const { session } = useAuth();
    const navigation = useNavigation();
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [activeTab, setActiveTab] = useState<'all' | 'anonymous'>('all');

    // Get current user data
    const currentUserId = 'user-1'; // Demo user - in production would be session?.user?.id
    const currentUser = users.find(u => u.id === currentUserId);

    const userDisplayName = currentUser?.username || 'User';
    const userEmail = session?.user?.email || currentUser?.email || 'email@example.com';
    const userInitials = userDisplayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // Set up settings button handler
    useEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <Pressable onPress={() => setSettingsVisible(true)} style={{ paddingRight: 15 }}>
                    <Ionicons name="settings-outline" size={22} color={theme.text} />
                </Pressable>
            ),
        });
    }, [navigation, theme, setSettingsVisible]);

    // Get user's posts
    const userPosts = (posts as Post[]).filter(p => p.user_id === currentUserId && p.post_type === 'feed');
    const allPosts = activeTab === 'all' ? userPosts : userPosts.filter(p => p.is_anonymous);

    // Calculate total upvotes
    const totalUpvotes = userPosts.reduce((sum, post) => sum + getPostScore(post.id), 0);

    async function signOut() {
        setSettingsVisible(false);
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Sign out error:', error.message);
            return;
        }
        router.replace('/(auth)');
    }

    const renderPostItem = ({ item }: { item: Post }) => {
        const postScore = getPostScore(item.id);
        const commentCount = comments.filter(c => c.post_id === item.id).length;

        return (
            <Pressable
                style={[styles.postCard, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
                onPress={() => router.push(`/post/${item.id}`)}
            >
                <View style={styles.postHeader}>
                    <Text style={[styles.postLabel, { color: theme.secondaryText }]}>
                        Posted {item.is_anonymous ? 'anonymously' : 'publicly'}
                    </Text>
                    <Text style={[styles.postTime, { color: theme.secondaryText }]}>2d ago</Text>
                </View>
                <Text style={[styles.postContent, { color: theme.text }]} numberOfLines={2}>
                    {item.content}
                </Text>
                <View style={styles.postFooter}>
                    <View style={styles.postStat}>
                        <MaterialCommunityIcons name="arrow-up-bold" size={16} color="#51CF66" />
                        <Text style={[styles.postStatText, { color: theme.secondaryText }]}>{postScore}</Text>
                    </View>
                    <View style={styles.postStat}>
                        <MaterialCommunityIcons name="comment-outline" size={16} color={theme.secondaryText} />
                        <Text style={[styles.postStatText, { color: theme.secondaryText }]}>{commentCount}</Text>
                    </View>
                </View>
            </Pressable>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <FlatList
                ListHeaderComponent={
                    <>
                        {/* USER INFO CARD */}
                        <View style={[styles.userCard, { backgroundColor: theme.card }]}>
                            <View style={styles.avatarContainer}>
                                <View style={styles.avatar}>
                                    <Text style={styles.avatarText}>{userInitials}</Text>
                                </View>
                            </View>
                            <View style={styles.userInfo}>
                                <Text style={[styles.userName, { color: theme.text }]}>
                                    {userDisplayName}
                                </Text>
                                <Text style={[styles.userEmail, { color: theme.secondaryText }]}>
                                    {userEmail}
                                </Text>
                                <View style={styles.upvotesContainer}>
                                    <MaterialCommunityIcons name="arrow-up-bold" size={16} color="#51CF66" />
                                    <Text style={styles.upvotesText}>{totalUpvotes} total upvotes</Text>
                                </View>
                            </View>
                        </View>

                        {/* TABS */}
                        <View style={styles.tabsContainer}>
                            <Pressable
                                style={[
                                    styles.tab,
                                    activeTab === 'all' && styles.activeTab,
                                    { backgroundColor: activeTab === 'all' ? theme.card : 'transparent' }
                                ]}
                                onPress={() => setActiveTab('all')}
                            >
                                <Text style={[
                                    styles.tabText,
                                    { color: activeTab === 'all' ? theme.text : theme.secondaryText }
                                ]}>
                                    All Posts
                                </Text>
                            </Pressable>
                            <Pressable
                                style={[
                                    styles.tab,
                                    activeTab === 'anonymous' && styles.activeTab,
                                    { backgroundColor: activeTab === 'anonymous' ? theme.card : 'transparent' }
                                ]}
                                onPress={() => setActiveTab('anonymous')}
                            >
                                <Text style={[
                                    styles.tabText,
                                    { color: activeTab === 'anonymous' ? theme.text : theme.secondaryText }
                                ]}>
                                    Anonymous
                                </Text>
                            </Pressable>
                        </View>
                    </>
                }
                data={allPosts}
                renderItem={renderPostItem}
                keyExtractor={(item) => item.id}
            />

            {/* SETTINGS BOTTOM SHEET */}
            <Modal
                visible={settingsVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setSettingsVisible(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setSettingsVisible(false)}
                >
                    <View
                        style={[styles.modalContent, { backgroundColor: theme.card }]}
                        onStartShouldSetResponder={() => true}
                    >
                        <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
                        <Text style={[styles.modalTitle, { color: theme.text }]}>Settings</Text>

                        <ScrollView style={styles.settingsScroll}>
                            {/* Dark Mode Toggle */}
                            <Pressable style={[styles.settingRow, { borderBottomColor: theme.border }]}>
                                <View style={styles.settingLeft}>
                                    <Ionicons name="moon-outline" size={22} color={theme.text} />
                                    <Text style={[styles.settingLabel, { color: theme.text }]}>Dark Mode</Text>
                                </View>
                                <Switch
                                    value={isDark}
                                    onValueChange={toggleTheme}
                                    trackColor={{ false: theme.border, true: theme.primary }}
                                    thumbColor={isDark ? '#fff' : '#f4f3f4'}
                                />
                            </Pressable>

                            {/* Notifications */}
                            <Pressable style={[styles.settingRow, { borderBottomColor: theme.border }]}>
                                <View style={styles.settingLeft}>
                                    <Ionicons name="notifications-outline" size={22} color={theme.text} />
                                    <Text style={[styles.settingLabel, { color: theme.text }]}>Notifications</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
                            </Pressable>

                            {/* Terms of Service */}
                            <Pressable style={[styles.settingRow, { borderBottomColor: theme.border }]}>
                                <View style={styles.settingLeft}>
                                    <Ionicons name="document-text-outline" size={22} color={theme.text} />
                                    <Text style={[styles.settingLabel, { color: theme.text }]}>Terms of Service</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
                            </Pressable>

                            {/* Privacy Policy */}
                            <Pressable style={[styles.settingRow, { borderBottomColor: theme.border }]}>
                                <View style={styles.settingLeft}>
                                    <Ionicons name="shield-checkmark-outline" size={22} color={theme.text} />
                                    <Text style={[styles.settingLabel, { color: theme.text }]}>Privacy Policy</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={theme.secondaryText} />
                            </Pressable>

                            {/* Logout */}
                            <Pressable
                                style={[styles.settingRow, { borderBottomColor: theme.border }]}
                                onPress={signOut}
                            >
                                <View style={styles.settingLeft}>
                                    <Ionicons name="log-out-outline" size={22} color="#FF6B6B" />
                                    <Text style={[styles.settingLabel, { color: '#FF6B6B' }]}>Logout</Text>
                                </View>
                            </Pressable>

                            {/* Delete Account */}
                            <Pressable style={styles.settingRow}>
                                <View style={styles.settingLeft}>
                                    <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                                    <Text style={[styles.settingLabel, { color: '#FF6B6B' }]}>Delete Account</Text>
                                </View>
                            </Pressable>
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    userCard: {
        flexDirection: 'row',
        padding: 20,
        marginHorizontal: 16,
        marginVertical: 16,
        borderRadius: 16,
        gap: 16,
    },
    avatarContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#5DBEBC',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 32,
        fontFamily: 'Poppins_700Bold',
        color: '#FFFFFF',
    },
    userInfo: {
        flex: 1,
        justifyContent: 'center',
        gap: 4,
    },
    userName: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
    },
    userEmail: {
        fontSize: 14,
        fontFamily: 'Poppins_400Regular',
    },
    upvotesContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    upvotesText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
        color: '#51CF66',
    },
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 12,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    activeTab: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
    },
    postCard: {
        padding: 16,
        borderBottomWidth: 1,
        gap: 8,
    },
    postHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    postLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    postTime: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
    },
    postContent: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 22,
    },
    postFooter: {
        flexDirection: 'row',
        gap: 16,
        marginTop: 4,
    },
    postStat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    postStatText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingTop: 12,
        paddingBottom: 32,
        maxHeight: '60%',
    },
    modalHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        alignSelf: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 20,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: 16,
    },
    settingsScroll: {
        paddingHorizontal: 20,
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
    },
    settingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    settingLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
    },
});
