import React, { useState } from 'react';
import { router } from 'expo-router';
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
} from 'react-native';
import { AntDesign, Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';

export default function CreatePostScreen() {
    const { theme } = useTheme();
    const [content, setContent] = useState<string>('');
    const [image, setImage] = useState<string | null>(null);
    const [isAnonymous, setIsAnonymous] = useState<boolean>(false);

    const goBack = () => {
        setContent('');
        setImage(null);
        setIsAnonymous(false);
        router.back();
    };

    const pickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 1,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };

    const handlePost = () => {
        // In production, this would make an API call to create the post
        console.log('Creating post:', {
            content,
            image,
            isAnonymous,
            postType: 'feed',
        });
        goBack();
    };

    const isPostButtonDisabled = !content.trim();

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: theme.background }]}
            edges={['top', 'left', 'right']}
        >
            {/* HEADER */}
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
                <Pressable onPress={goBack} style={styles.closeButton}>
                    <AntDesign name="close" size={28} color={theme.text} />
                </Pressable>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Create Post</Text>
                <Pressable
                    disabled={isPostButtonDisabled}
                    onPress={handlePost}
                    style={[
                        styles.postButton,
                        {
                            backgroundColor: isPostButtonDisabled ? theme.border : theme.primary,
                        },
                    ]}
                >
                    <Text style={styles.postButtonText}>Post</Text>
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
                    {/* CONTENT INPUT */}
                    <TextInput
                        placeholder="What's on your mind?"
                        placeholderTextColor={theme.secondaryText}
                        style={[styles.contentInput, { color: theme.text }]}
                        onChangeText={setContent}
                        value={content}
                        multiline
                        autoFocus
                        scrollEnabled={false}
                    />

                    {/* IMAGE PREVIEW */}
                    {image && (
                        <View style={styles.imageContainer}>
                            <Pressable onPress={() => setImage(null)} style={styles.removeImageButton}>
                                <AntDesign name="close" size={20} color="white" />
                            </Pressable>
                            <Image source={{ uri: image }} style={styles.imagePreview} />
                        </View>
                    )}
                </ScrollView>

                {/* FOOTER */}
                <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
                    {/* ANONYMOUS TOGGLE */}
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
        paddingVertical: 12,
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
    anonymousLabel: {
        fontSize: 16,
        fontFamily: 'Poppins_500Medium',
    },
    contentInput: {
        fontSize: 16,
        fontFamily: 'Poppins_400Regular',
        paddingVertical: 20,
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
        padding: 15,
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
});

