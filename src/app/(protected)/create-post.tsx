import React from "react";
import { router, useLocalSearchParams } from "expo-router";
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
} from "react-native";
import { AntDesign, Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useTheme } from "../../context/ThemeContext";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { Database } from "../../types/database.types";
import { uploadImage, getImageUrl } from "../../utils/supabaseImages";
import { formatDistanceToNowStrict } from "date-fns";
import nuLogo from "../../../assets/images/nu-logo.png";
import SupabaseImage from "../../components/SupabaseImage";
import { DEFAULT_AVATAR } from "../../constants/images";
import { logger } from "../../utils/logger";
import { useOriginalPostForRepost } from "../../hooks/useOriginalPostForRepost";
import { useImagePipeline } from "../../hooks/useImagePipeline";
import { useCreatePostFormState } from "../../hooks/useCreatePostFormState";
import { useCreatePostMutation } from "../../hooks/useCreatePostMutation";

type PostInsert = Database["public"]["Tables"]["posts"]["Insert"];

export default function CreatePostScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { type, repostId } = useLocalSearchParams<{
    type?: string;
    repostId?: string;
  }>();
  const { session } = useAuth();

  const {
    originalPost,
    isLoadingOriginal,
  } = useOriginalPostForRepost(repostId);

  const {
    isLostFound,
    isRepost,
    content,
    setContent,
    image,
    setImage,
    isAnonymous,
    setIsAnonymous,
    isSubmitting,
    setIsSubmitting,
    isPoll,
    setIsPoll,
    pollOptions,
    setPollOptions,
    category,
    setCategory,
    location,
    setLocation,
    reset,
    canSubmit,
  } = useCreatePostFormState({ type, repostId });

  const { pickAndPrepareImage } = useImagePipeline();

  const goBack = () => {
    reset();
    // Return to the tab the user came from so they stay in context
    if (isLostFound) {
      router.replace("/(protected)/(tabs)/lostfound");
    } else {
      router.replace("/(protected)/(tabs)");
    }
  };

  const pickImage = async () => {
    const uri = await pickAndPrepareImage();
    if (uri) {
      setImage(uri);
    }
  };

  // Create post mutation with optimistic UI updates (like Instagram/X)
  const createPostMutation = useCreatePostMutation({
    isLostFound,
    repostId,
    currentUserId: session?.user?.id,
  });

  const handlePost = async () => {
    // Prevent multiple submissions
    if (isSubmitting || createPostMutation.isPending) {
      return;
    }

    setIsSubmitting(true);

    try {
      let imagePath: string | undefined = undefined;

      // If poll is enabled on feed posts, validate options
      let cleanedPollOptions: string[] | undefined = undefined;
      if (!isLostFound && isPoll) {
        const normalized = Array.from(
          new Set(
            pollOptions
              .map((o) => o.trim())
              .filter((o) => o.length > 0)
          )
        );

        if (normalized.length < 2) {
          Alert.alert(
            "Poll options required",
            "Please provide at least two distinct poll options."
          );
          return;
        }

        cleanedPollOptions = normalized;
      }

      // Upload image first if present
      if (image) {
        try {
          imagePath = await uploadImage(image, supabase);
        } catch (error: any) {
          logger.error("Image upload error", error as Error);
          Alert.alert(
            "Error",
            error.message || "Failed to upload image. Please try again."
          );
          return;
        }
      }

      // Fire the mutation (optimistic UI will update feed); no need to await here
      createPostMutation.mutate({
        imagePath,
        postContent: content,
        postLocation: location,
        postIsAnonymous: isAnonymous,
        postCategory: category,
        pollOptions: cleanedPollOptions,
      });

      // Immediately reset and navigate back to the originating tab; feed overlay will show while mutation completes
      reset();
      if (isLostFound) {
        router.replace("/(protected)/(tabs)/lostfound");
      } else {
        router.replace("/(protected)/(tabs)");
      }
    } catch (error) {
      // Errors are already surfaced via mutation onError; nothing extra here
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validation: For feed posts, just content. For L&F posts, content + location. For reposts, content is optional
  const isPostButtonDisabled = !canSubmit;

  const handleTogglePoll = () => {
    if (isPoll) {
      setIsPoll(false);
      setPollOptions(["", ""]);
    } else {
      setIsPoll(true);
    }
  };

  const isLoading = createPostMutation.isPending || isSubmitting;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={[]}
    >
      {/* HEADER */}
      <View
        style={[
          styles.header,
          {
            borderBottomColor: theme.border,
            paddingTop: Math.max(insets.top, 10) + 10,
          },
        ]}
      >
        <Pressable onPress={goBack} style={styles.closeButton}>
          <AntDesign name="close" size={28} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          {isRepost
            ? "Repost"
            : isLostFound
              ? "Post Lost/Found Item"
              : "Create Post"}
        </Text>
        <Pressable
          disabled={isPostButtonDisabled || isLoading}
          onPress={handlePost}
          style={[
            styles.postButton,
            {
              backgroundColor:
                isPostButtonDisabled || isLoading
                  ? theme.border
                  : theme.primary,
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
              <Text style={[styles.sectionLabel, { color: theme.text }]}>
                Category *
              </Text>
              <View style={styles.categoryButtons}>
                <Pressable
                  onPress={() => setCategory("lost")}
                  style={[
                    styles.categoryButton,
                    {
                      backgroundColor:
                        category === "lost" ? "#FF6B6B" : theme.background,
                      borderColor:
                        category === "lost" ? "#FF6B6B" : theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="alert-circle"
                    size={20}
                    color={category === "lost" ? "#FFF" : theme.text}
                  />
                  <Text
                    style={[
                      styles.categoryButtonText,
                      { color: category === "lost" ? "#FFF" : theme.text },
                    ]}
                  >
                    Lost
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setCategory("found")}
                  style={[
                    styles.categoryButton,
                    {
                      backgroundColor:
                        category === "found" ? "#51CF66" : theme.background,
                      borderColor:
                        category === "found" ? "#51CF66" : theme.border,
                    },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={category === "found" ? "#FFF" : theme.text}
                  />
                  <Text
                    style={[
                      styles.categoryButtonText,
                      { color: category === "found" ? "#FFF" : theme.text },
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
              <Text style={[styles.sectionLabel, { color: theme.text }]}>
                Location *
              </Text>
              <View
                style={[
                  styles.locationInputContainer,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={theme.secondaryText}
                />
                <TextInput
                  placeholder="e.g., Library, Block 10, Dining Hall"
                  placeholderTextColor={theme.secondaryText}
                  style={[styles.locationInput, { color: theme.text }]}
                  keyboardAppearance={isDark ? "dark" : "light"}
                  onChangeText={setLocation}
                  value={location}
                />
              </View>
            </View>
          )}

          {/* CONTENT INPUT */}
          <View style={styles.contentSection}>
            {isLostFound && (
              <Text style={[styles.sectionLabel, { color: theme.text }]}>
                Description *
              </Text>
            )}
            {isRepost && (
              <Text style={[styles.sectionLabel, { color: theme.text }]}>
                Add your thoughts (optional)
              </Text>
            )}
            <TextInput
              placeholder={
                isRepost
                  ? "Say something about this..."
                  : isLostFound
                    ? "Describe the item..."
                    : "What's on your mind?"
              }
              placeholderTextColor={theme.secondaryText}
              style={[styles.contentInput, { color: theme.text }]}
              keyboardAppearance={isDark ? "dark" : "light"}
              onChangeText={setContent}
              value={content}
              multiline
              autoFocus={!isLostFound && !isRepost}
              scrollEnabled={true}
              textAlignVertical="top"
            />
          </View>

          {/* POLL BUILDER (feed posts only, shown only when enabled) */}
          {!isLostFound && isPoll && (
            <View style={styles.pollSection}>
              <View style={styles.pollHeaderRow}>
                <Text style={[styles.sectionLabel, { color: theme.text }]}>
                  Poll
                </Text>
                <Pressable onPress={handleTogglePoll} style={styles.pollRemoveButton}>
                  <AntDesign name="close" size={18} color={theme.secondaryText} />
                </Pressable>
              </View>

              <View style={styles.pollOptionsContainer}>
                {pollOptions.map((option, index) => (
                  <View key={index} style={styles.pollOptionRow}>
                    <View
                      style={[
                        styles.pollOptionIndex,
                        { borderColor: theme.border, backgroundColor: theme.background },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pollOptionIndexText,
                          { color: theme.secondaryText },
                        ]}
                      >
                        {index + 1}
                      </Text>
                    </View>
                    <TextInput
                      style={[
                        styles.pollOptionInput,
                        {
                          borderColor: theme.border,
                          backgroundColor: theme.background,
                          color: theme.text,
                        },
                      ]}
                      placeholder={`Option ${index + 1}`}
                      placeholderTextColor={theme.secondaryText}
                      keyboardAppearance={isDark ? "dark" : "light"}
                      value={option}
                      onChangeText={(text) => {
                        const next = [...pollOptions];
                        next[index] = text;
                        setPollOptions(next);
                      }}
                    />
                    {pollOptions.length > 2 && (
                      <Pressable
                        onPress={() => {
                          const next = pollOptions.filter((_, i) => i !== index);
                          setPollOptions(next.length >= 2 ? next : ["", ""]);
                        }}
                        style={styles.pollOptionRemoveButton}
                      >
                        <AntDesign name="close" size={16} color={theme.secondaryText} />
                      </Pressable>
                    )}
                  </View>
                ))}

                {pollOptions.length < 4 && (
                  <Pressable
                    onPress={() => setPollOptions([...pollOptions, ""])}
                    style={[
                      styles.pollAddOptionButton,
                      { borderColor: theme.border },
                    ]}
                  >
                    <Feather
                      name="plus-circle"
                      size={18}
                      color={theme.primary}
                    />
                    <Text
                      style={[
                        styles.pollAddOptionText,
                        { color: theme.primary },
                      ]}
                    >
                      Add option
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* IMAGE PREVIEW */}
          {image && (
            <View style={styles.imageContainer}>
              <Pressable
                onPress={() => setImage(null)}
                style={styles.removeImageButton}
              >
                <AntDesign name="close" size={20} color="white" />
              </Pressable>
              <Image source={{ uri: image }} style={styles.imagePreview} />
            </View>
          )}

          {/* ORIGINAL POST PREVIEW (for reposts) */}
          {isRepost && originalPost && (
            <View
              style={[
                styles.originalPostPreview,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.originalPostLabel,
                  { color: theme.secondaryText },
                ]}
              >
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
                  <Image source={DEFAULT_AVATAR} style={styles.originalAvatar} />
                )}
                <View style={styles.originalPostHeaderText}>
                  <Text style={[styles.originalAuthor, { color: theme.text }]}>
                    {originalPost.is_anonymous
                      ? originalPost.user_id === session?.user?.id
                        ? "You"
                        : "Anonymous"
                      : originalPost.username}
                  </Text>
                  <Text
                    style={[
                      styles.originalTime,
                      { color: theme.secondaryText },
                    ]}
                  >
                    {formatDistanceToNowStrict(
                      new Date(originalPost.created_at!)
                    )}{" "}
                    ago
                  </Text>
                </View>
              </View>
              <Text
                style={[styles.originalContent, { color: theme.text }]}
                numberOfLines={6}
              >
                {originalPost.content}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* FOOTER */}
        <View
          style={[
            styles.footer,
            {
              backgroundColor: theme.card,
              borderTopColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 15),
            },
          ]}
        >
          {/* ANONYMOUS TOGGLE (Feed posts only) */}
          {!isLostFound && (
            <>
              <View style={styles.anonymousFooterRow}>
                <Text style={[styles.anonymousLabel, { color: theme.text }]}>
                  Anonymous
                </Text>
                <Switch
                  value={isAnonymous}
                  onValueChange={setIsAnonymous}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor={isAnonymous ? "#fff" : "#f4f3f4"}
                />
              </View>
              <View style={styles.footerActionsRow}>
                <Pressable onPress={handleTogglePoll} style={styles.footerButton}>
                  <MaterialCommunityIcons
                    name="poll"
                    size={24}
                    color={theme.text}
                  />
                </Pressable>
                <Pressable onPress={pickImage} style={styles.footerButton}>
                  <Feather name="image" size={24} color={theme.text} />
                </Pressable>
              </View>
            </>
          )}
          {isLostFound && (
            <>
              <View />
              <Pressable onPress={pickImage} style={styles.footerButton}>
                <Feather name="image" size={24} color={theme.text} />
              </Pressable>
            </>
          )}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
    flex: 1,
    textAlign: "center",
    marginHorizontal: 10,
  },
  postButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  postButtonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
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
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 10,
  },
  categoryButtons: {
    flexDirection: "row",
    gap: 12,
  },
  categoryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  categoryButtonText: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  locationSection: {
    paddingTop: 15,
    paddingBottom: 10,
  },
  locationInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  locationInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
  },
  contentSection: {
    paddingTop: 15,
  },
  pollSection: {
    paddingTop: 6,
  },
  pollHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pollOptionsContainer: {
    marginTop: 8,
    gap: 8,
  },
  pollOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pollOptionIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  pollOptionIndexText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  pollOptionInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  pollRemoveButton: {
    padding: 4,
  },
  pollOptionRemoveButton: {
    padding: 4,
  },
  pollAddOptionButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  pollAddOptionText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  anonymousLabel: {
    fontSize: 16,
    fontFamily: "Poppins_500Medium",
  },
  contentInput: {
    fontSize: 16,
    fontFamily: "Poppins_400Regular",
    paddingVertical: 10,
    minHeight: 48,
    maxHeight: 280,
    textAlignVertical: "top",
  },
  imageContainer: {
    marginVertical: 15,
    position: "relative",
  },
  removeImageButton: {
    position: "absolute",
    zIndex: 1,
    right: 10,
    top: 10,
    padding: 8,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 20,
  },
  imagePreview: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingTop: 15,
    borderTopWidth: 1,
  },
  anonymousFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  footerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
    fontFamily: "Poppins_500Medium",
    marginBottom: 10,
  },
  originalPostHeader: {
    flexDirection: "row",
    alignItems: "center",
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
    fontFamily: "Poppins_500Medium",
  },
  originalTime: {
    fontSize: 12,
  },
  originalContent: {
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    lineHeight: 22,
  },
});
