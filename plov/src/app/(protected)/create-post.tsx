import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
    ScrollView,
    Text,
    TextInput,
    View,
    KeyboardAvoidingView,
    Platform,
    Image,
    Pressable,
    StyleSheet,
    Switch,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { AntDesign, Feather, Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Database } from '../../types/database.types';
import { uploadImage, getImageUrl } from '../../utils/supabaseImages';
import { formatDistanceToNowStrict } from 'date-fns';
import nuLogo from '../../../assets/images/nu-logo.png';
import SupabaseImage from '../../components/SupabaseImage';

type PostInsert = Database['public']['Tables']['posts']['Insert'];

export default function CreatePostScreen() {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const { type, repostId } = useLocalSearchParams<{ type?: string; repostId?: string }>();
    const isLostFound = type === 'lost_found';
    const isRepost = !!repostId;
    const { session } = useAuth();
    const queryClient = useQueryClient();

    // Fetch original post if reposting
    const { data: originalPost, isLoading: isLoadingOriginal } = useQuery({
        queryKey: ['original-post', repostId],
        queryFn: async () => {
            if (!repostId) return null;
            const { data, error } = await supabase
                .from('posts_summary_view')
                .select('*')
                .eq('post_id', repostId)
                .single();
            if (error) throw error;
            return data;
        },
        enabled: !!repostId,
    });

    const [content, setContent] = useState<string>('');
    const [image, setImage] = useState<string | null>(null);
    const [isAnonymous, setIsAnonymous] = useState<boolean>(false);

    // Lost & Found specific states
    const [category, setCategory] = useState<'lost' | 'found'>('lost');
    const [location, setLocation] = useState<string>('');

    const goBack = () => {
        setContent('');
        setImage(null);
        setIsAnonymous(false);
        setCategory('lost');
        setLocation('');
        router.back();
    };

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            allowsEditing: true,
            quality: 0.8,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };


    // Create post mutation
    const createPostMutation = useMutation({
        mutationFn: async ({
            imagePath,
            postContent,
            postLocation,
            postIsAnonymous,
            postCategory,
        }: {
            imagePath: string | undefined;
            postContent: string;
            postLocation: string;
            postIsAnonymous: boolean;
            postCategory: 'lost' | 'found';
        }) => {
            if (!session?.user) {
                throw new Error('You must be logged in to create a post.');
            }

            // Content is required for regular posts, optional for reposts
            if (!repostId && !postContent.trim()) {
                throw new Error('Content is required');
            }

            if (isLostFound && !postLocation.trim()) {
                throw new Error('Location is required for lost & found posts');
            }

            // Prepare post data
            const postData: PostInsert = {
                user_id: session.user.id,
                content: postContent.trim() || '', // Allow empty content for reposts
                post_type: isLostFound ? 'lost_found' : 'feed',
                image_url: imagePath || null,
                is_anonymous: isLostFound ? false : postIsAnonymous, // Lost & Found posts are never anonymous
                ...(isLostFound && {
                    category: postCategory,
                    location: postLocation.trim(),
                }),
                ...(repostId && {
                    reposted_from_post_id: repostId,
                }),
            };

            const { data, error } = await supabase
                .from('posts')
                .insert(postData)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            // Invalidate posts query to refresh the feed
            queryClient.invalidateQueries({ queryKey: ['posts'] });
            goBack();
        },
        onError: (error: Error) => {
            console.error('Error creating post:', error);
            Alert.alert('Error', error.message || 'Failed to create post. Please try again.');
        },
    });

    const handlePost = async () => {
        let imagePath: string | undefined = undefined;

        // Upload image first if present
        if (image) {
            try {
                imagePath = await uploadImage(image, supabase);
            } catch (error: any) {
                console.error('Image upload error:', error);
                Alert.alert('Error', error.message || 'Failed to upload image. Please try again.');
                return;
            }
        }

        // Create post with all necessary data
        createPostMutation.mutate({
            imagePath,
            postContent: content,
            postLocation: location,
            postIsAnonymous: isAnonymous,
            postCategory: category,
        });
    };

    // Validation: For feed posts, just content. For L&F posts, content + location. For reposts, content is optional
    const isPostButtonDisabled = isRepost
        ? false // Reposts don't require content
        : isLostFound
            ? !content.trim() || !location.trim()
            : !content.trim();

    const isLoading = createPostMutation.isPending;

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: theme.background }]}
            edges={[]}
        >
            {/* HEADER */}
            <View style={[
                styles.header,
                {
                    borderBottomColor: theme.border,
                    paddingTop: Math.max(insets.top, 10) + 10
                }
            ]}>
                <Pressable onPress={goBack} style={styles.closeButton}>
                    <AntDesign name="close" size={28} color={theme.text} />
                </Pressable>
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                    {isRepost ? 'Repost' : isLostFound ? 'Post Lost/Found Item' : 'Create Post'}
                </Text>
                <Pressable
                    disabled={isPostButtonDisabled || isLoading}
                    onPress={handlePost}
                    style={[
                        styles.postButton,
                        {
                            backgroundColor: isPostButtonDisabled || isLoading ? theme.border : theme.primary,
                        },
                    ]}
                >
                    {isLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.postButtonText}>Post</Text>
                    )}
                </Pressable>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView
                    style={styles.scrollView}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* LOST & FOUND CATEGORY SELECTOR */}
                    {isLostFound && (
                        <View style={styles.categorySection}>
                            <Text style={[styles.sectionLabel, { color: theme.text }]}>Category *</Text>
                            <View style={styles.categoryButtons}>
                                <Pressable
                                    onPress={() => setCategory('lost')}
                                    style={[
                                        styles.categoryButton,
                                        {
                                            backgroundColor: category === 'lost' ? '#FF6B6B' : theme.background,
                                            borderColor: category === 'lost' ? '#FF6B6B' : theme.border,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name="alert-circle"
                                        size={20}
                                        color={category === 'lost' ? '#FFF' : theme.text}
                                    />
                                    <Text
                                        style={[
                                            styles.categoryButtonText,
                                            { color: category === 'lost' ? '#FFF' : theme.text },
                                        ]}
                                    >
                                        Lost
                                    </Text>
                                </Pressable>
                                <Pressable
                                    onPress={() => setCategory('found')}
                                    style={[
                                        styles.categoryButton,
                                        {
                                            backgroundColor: category === 'found' ? '#51CF66' : theme.background,
                                            borderColor: category === 'found' ? '#51CF66' : theme.border,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name="checkmark-circle"
                                        size={20}
                                        color={category === 'found' ? '#FFF' : theme.text}
                                    />
                                    <Text
                                        style={[
                                            styles.categoryButtonText,
                                            { color: category === 'found' ? '#FFF' : theme.text },
                                        ]}
                                    >
                                        Found
                                    </Text>
                                </Pressable>
                            </View>
                        </View>
                    )}

                    {/* LOCATION INPUT (Lost & Found only) */}
                    {isLostFound && (
                        <View style={styles.locationSection}>
                            <Text style={[styles.sectionLabel, { color: theme.text }]}>Location *</Text>
                            <View style={[styles.locationInputContainer, { backgroundColor: theme.background, borderColor: theme.border }]}>
                                <Ionicons name="location-outline" size={20} color={theme.secondaryText} />
                                <TextInput
                                    placeholder="e.g., Library, Block 10, Dining Hall"
                                    placeholderTextColor={theme.secondaryText}
                                    style={[styles.locationInput, { color: theme.text }]}
                                    onChangeText={setLocation}
                                    value={location}
                                />
                            </View>
                        </View>
                    )}

                    {/* CONTENT INPUT */}
                    <View style={styles.contentSection}>
                        {isLostFound && <Text style={[styles.sectionLabel, { color: theme.text }]}>Description *</Text>}
                        {isRepost && <Text style={[styles.sectionLabel, { color: theme.text }]}>Add your thoughts (optional)</Text>}
                        <TextInput
                            placeholder={isRepost ? "Say something about this..." : isLostFound ? "Describe the item..." : "What's on your mind?"}
                            placeholderTextColor={theme.secondaryText}
                            style={[styles.contentInput, { color: theme.text }]}
                            onChangeText={setContent}
                            value={content}
                            multiline
                            autoFocus={!isLostFound && !isRepost}
                            scrollEnabled={false}
                        />
                    </View>

                    {/* IMAGE PREVIEW */}
                    {image && (
                        <View style={styles.imageContainer}>
                            <Pressable onPress={() => setImage(null)} style={styles.removeImageButton}>
                                <AntDesign name="close" size={20} color="white" />
                            </Pressable>
                            <Image source={{ uri: image }} style={styles.imagePreview} />
                        </View>
                    )}

                    {/* ORIGINAL POST PREVIEW (for reposts) */}
                    {isRepost && originalPost && (
                        <View style={[styles.originalPostPreview, {
                            backgroundColor: theme.background,
                            borderColor: theme.border
                        }]}>
                            <Text style={[styles.originalPostLabel, { color: theme.secondaryText }]}>
                                Original post
                            </Text>
                            <View style={styles.originalPostHeader}>
                                {originalPost.is_anonymous ? (
                                    <Image source={nuLogo} style={styles.originalAvatar} />
                                ) : originalPost.avatar_url ? (
                                    originalPost.avatar_url.startsWith("http") ? (
                                        <Image
                                            source={{ uri: originalPost.avatar_url }}
                                            style={styles.originalAvatar}
                                        />
                                    ) : (
                                        <SupabaseImage
                                            path={originalPost.avatar_url}
                                            bucket="avatars"
                                            style={styles.originalAvatar}
                                        />
                                    )
                                ) : (
                                    <View style={[styles.originalAvatar, { backgroundColor: theme.border }]} />
                                )}
                                <View style={styles.originalPostHeaderText}>
                                    <Text style={[styles.originalAuthor, { color: theme.text }]}>
                                        {originalPost.is_anonymous ? 'Anonymous' : originalPost.username}
                                    </Text>
                                    <Text style={[styles.originalTime, { color: theme.secondaryText }]}>
                                        {formatDistanceToNowStrict(new Date(originalPost.created_at!))} ago
                                    </Text>
                                </View>
                            </View>
                            <Text style={[styles.originalContent, { color: theme.text }]} numberOfLines={6}>
                                {originalPost.content}
                            </Text>
                        </View>
                    )}
                </ScrollView>

                {/* FOOTER */}
                <View style={[
                    styles.footer,
                    {
                        backgroundColor: theme.card,
                        borderTopColor: theme.border,
                        paddingBottom: Math.max(insets.bottom, 15)
                    }
                ]}>
                    {/* ANONYMOUS TOGGLE (Feed posts only) */}
                    {!isLostFound && (
                        <View style={styles.anonymousFooterRow}>
                            <Text style={[styles.anonymousLabel, { color: theme.text }]}>
                                Anonymous
                            </Text>
                            <Switch
                                value={isAnonymous}
                                onValueChange={setIsAnonymous}
                                trackColor={{ false: theme.border, true: theme.primary }}
                                thumbColor={isAnonymous ? '#fff' : '#f4f3f4'}
                            />
                        </View>
                    )}
                    {isLostFound && <View />}
                    <Pressable onPress={pickImage} style={styles.footerButton}>
                        <Feather name="image" size={24} color={theme.text} />
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingBottom: 12,
        borderBottomWidth: 1,
    },
    closeButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_600SemiBold',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 10,
    },
    postButton: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 20,
    },
    postButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 15,
        fontFamily: 'Poppins_500Medium',
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: 15,
    },
    categorySection: {
        paddingTop: 20,
        paddingBottom: 10,
    },
    sectionLabel: {
        fontSize: 15,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 10,
    },
    categoryButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    categoryButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 2,
    },
    categoryButtonText: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
    },
    locationSection: {
        paddingTop: 15,
        paddingBottom: 10,
    },
    locationInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    locationInput: {
        flex: 1,
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
    },
    contentSection: {
        paddingTop: 15,
    },
    anonymousLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
    },
    contentInput: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        paddingVertical: 10,
        minHeight: 120,
        textAlignVertical: 'top',
    },
    imageContainer: {
        marginVertical: 15,
        position: 'relative',
    },
    removeImageButton: {
        position: 'absolute',
        zIndex: 1,
        right: 10,
        top: 10,
        padding: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 20,
    },
    imagePreview: {
        width: '100%',
        aspectRatio: 1,
        borderRadius: 12,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingTop: 15,
        borderTopWidth: 1,
    },
    anonymousFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    footerButton: {
        padding: 5,
    },
    originalPostPreview: {
        marginTop: 15,
        marginBottom: 15,
        padding: 15,
        borderRadius: 12,
        borderWidth: 1,
    },
    originalPostLabel: {
        fontSize: 13,
        fontFamily: 'Poppins_500Medium',
        marginBottom: 10,
    },
    originalPostHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    originalAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    originalPostHeaderText: {
        marginLeft: 10,
        flex: 1,
    },
    originalAuthor: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    originalTime: {
        fontSize: 12,
    },
    originalContent: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 22,
    },
});

