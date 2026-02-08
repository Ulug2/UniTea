import React, { useState } from "react";
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
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useTheme } from "../../context/ThemeContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { Database } from "../../types/database.types";
import { uploadImage, getImageUrl } from "../../utils/supabaseImages";
import { formatDistanceToNowStrict } from "date-fns";
import nuLogo from "../../../assets/images/nu-logo.png";
import SupabaseImage from "../../components/SupabaseImage";
import { DEFAULT_AVATAR } from "../../constants/images";
import { logger } from "../../utils/logger";

type PostInsert = Database["public"]["Tables"]["posts"]["Insert"];

export default function CreatePostScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { type, repostId } = useLocalSearchParams<{
    type?: string;
    repostId?: string;
  }>();
  const isLostFound = type === "lost_found";
  const isRepost = !!repostId;
  const { session } = useAuth();
  const queryClient = useQueryClient();

  // Fetch original post if reposting
  const { data: originalPost, isLoading: isLoadingOriginal } = useQuery({
    queryKey: ["original-post", repostId],
    queryFn: async () => {
      if (!repostId) return null;
      const { data, error } = await supabase
        .from("posts_summary_view")
        .select("*")
        .eq("post_id", repostId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!repostId,
  });

  const [content, setContent] = useState<string>("");
  const [image, setImage] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Poll state (feed posts only)
  const [isPoll, setIsPoll] = useState<boolean>(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  // Lost & Found specific states
  const [category, setCategory] = useState<"lost" | "found">("lost");
  const [location, setLocation] = useState<string>("");

  const goBack = () => {
    setContent("");
    setImage(null);
    setIsAnonymous(true);
    setIsPoll(false);
    setPollOptions(["", ""]);
    setCategory("lost");
    setLocation("");
    // Use replace instead of back to avoid navigation errors
    router.replace("/(protected)/(tabs)");
  };

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        quality: 0.8, // Initial quality for picker
      });

      if (!result.canceled) {
        // CRITICAL: Compress & resize BEFORE setting state
        // This prevents memory issues and reduces upload size by 70-80%
        const manipResult = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [
            { resize: { width: 1080 } }, // Max width 1080px (perfect for mobile screens)
          ],
          {
            compress: 0.7, // Further compression
            format: ImageManipulator.SaveFormat.WEBP, // WebP is 30% smaller than JPEG
          }
        );
        setImage(manipResult.uri);
      }
    } catch (error) {
      logger.error("Error processing image", error as Error);
      Alert.alert("Error", "Failed to process image. Please try again.");
    }
  };

  // Create post mutation with optimistic UI updates (like Instagram/X)
  const createPostMutation = useMutation({
    mutationFn: async ({
      imagePath,
      postContent,
      postLocation,
      postIsAnonymous,
      postCategory,
      pollOptions,
    }: {
      imagePath: string | undefined;
      postContent: string;
      postLocation: string;
      postIsAnonymous: boolean;
      postCategory: "lost" | "found";
      pollOptions?: string[];
    }) => {
      if (!session?.user) {
        throw new Error("You must be logged in to create a post.");
      }

      // Content is required for regular posts, optional for reposts
      if (!repostId && !postContent.trim()) {
        throw new Error("Content is required");
      }

      if (isLostFound && !postLocation.trim()) {
        throw new Error("Location is required for lost & found posts");
      }

      // Prepare post data for Edge Function
      const postPayload = {
        content: postContent.trim() || "", // Allow empty content for reposts
        post_type: isLostFound ? "lost_found" : "feed",
        image_url: imagePath || null,
        is_anonymous: isLostFound ? false : postIsAnonymous, // Lost & Found posts are never anonymous
        ...(isLostFound && {
          category: postCategory,
          location: postLocation.trim(),
        }),
        ...(repostId && {
          reposted_from_post_id: repostId,
        }),
        // Optional poll payload (feed posts only)
        ...(!isLostFound &&
          pollOptions &&
          pollOptions.length >= 2 && {
          poll_options: pollOptions,
        }),
      };

      // Call Edge Function for AI moderation
      // Use fetch directly to access response body even on 400 status codes
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
      const functionUrl = `${supabaseUrl}/functions/v1/create-post`;

      // Get auth token from session
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        throw new Error("You must be logged in to create a post.");
      }

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.access_token}`,
          apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
        },
        body: JSON.stringify(postPayload),
      });

      // Parse response body (works for both 200 and 400 status)
      const responseData = await response.json();

      // Check if response contains an error (Edge Function returns { error: "..." } on failure)
      if (!response.ok) {
        // Extract error message from response body
        const errorMessage = responseData?.error || responseData?.message || "Failed to create post";
        throw new Error(errorMessage);
      }

      // Additional check: if responseData has an error field even on 200 status
      if (responseData?.error) {
        throw new Error(responseData.error);
      }

      // Validate that we received post data
      if (!responseData || !responseData.id) {
        throw new Error("Invalid response from server");
      }

      // Return the post data (edge function returns the inserted post with 'id' field)
      return responseData;
    },
    // OPTIMISTIC UI: Show post immediately (like Instagram/X/Threads)
    onMutate: async (variables) => {
      if (isLostFound) return; // Skip optimistic update for lost & found (different screen)

      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["posts", "feed"] });

      // Snapshot previous value for rollback
      const previousData = queryClient.getQueryData(["posts", "feed", "new"]);

      // Create optimistic post (will be replaced by real data from server)
      // Use placeholder data - real-time subscription will update with full data
      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();

      const optimisticPost = {
        post_id: tempId,
        user_id: session?.user?.id || "",
        content: variables.postContent.trim(),
        image_url: variables.imagePath || null,
        category: null,
        location: null,
        post_type: "feed",
        is_anonymous: variables.postIsAnonymous,
        is_deleted: false,
        is_edited: false,
        created_at: now,
        updated_at: now,
        edited_at: null,
        view_count: 0,
        username: variables.postIsAnonymous ? "Anonymous" : "You", // Placeholder - will be updated
        avatar_url: null, // Placeholder - will be updated by real-time
        is_verified: false,
        is_banned: false,
        comment_count: 0,
        vote_score: 0,
        user_vote: null,
        reposted_from_post_id: repostId || null,
        repost_comment: repostId ? variables.postContent.trim() : null,
        repost_count: 0,
        original_post_id: null,
        original_content: null,
        original_user_id: null,
        original_author_username: null,
        original_author_avatar: null,
        original_is_anonymous: null,
        original_created_at: null,
      };

      // Optimistically update feed - add to beginning of first page
      queryClient.setQueryData(["posts", "feed", "new"], (old: any) => {
        if (!old?.pages) return old;

        const newPages = [...old.pages];
        if (newPages[0]) {
          newPages[0] = [optimisticPost, ...newPages[0]];
        } else {
          newPages[0] = [optimisticPost];
        }

        return { ...old, pages: newPages };
      });

      return { previousData, tempId };
    },
    onSuccess: (data, variables, context) => {
      if (isLostFound) {
        // For lost & found, just invalidate
        queryClient.invalidateQueries({ queryKey: ["posts", "lost_found"] });
      } else {
        // Replace optimistic post with real data from server
        // Note: Edge function returns post with 'id' field, but view uses 'post_id'
        queryClient.setQueryData(["posts", "feed", "new"], (old: any) => {
          if (!old?.pages) return old;

          const newPages = old.pages.map((page: any[]) =>
            page.map((post: any) =>
              post.post_id === context?.tempId
                ? {
                  ...post,
                  post_id: data.id, // Map 'id' from DB to 'post_id' in view
                  created_at: data.created_at,
                  updated_at: data.updated_at,
                }
                : post
            )
          );

          return { ...old, pages: newPages };
        });

        // Mark as stale but don't refetch immediately (let real-time handle it)
        queryClient.invalidateQueries({
          queryKey: ["posts", "feed"],
          refetchType: "none"
        });
      }
      setIsSubmitting(false);
      goBack();
    },
    onError: (error: Error, variables, context) => {
      // Rollback optimistic update on error
      if (context?.previousData && !isLostFound) {
        queryClient.setQueryData(["posts", "feed", "new"], context.previousData);
      }
      setIsSubmitting(false);

      // Log error to Sentry (logger handles dev vs prod automatically)
      logger.error("Error creating post", error as Error, {
        isLostFound,
        hasImage: !!variables.imagePath,
      });

      // Show the actual error message from Edge Function (already user-friendly)
      // Edge Function returns: "Post violates community guidelines" or "Image violates community guidelines"
      const errorMessage = error.message || "Failed to create post. Please try again.";

      // This Alert is what users see - console errors are only for developers
      Alert.alert("Error", errorMessage);
    },
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
          setIsSubmitting(false);
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
          setIsSubmitting(false);
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
        pollOptions: cleanedPollOptions,
      });
    } catch (error) {
      setIsSubmitting(false);
    }
  };

  // Validation: For feed posts, just content. For L&F posts, content + location. For reposts, content is optional
  const isPostButtonDisabled = isRepost
    ? false // Reposts don't require content
    : isLostFound
      ? !content.trim() || !location.trim()
      : !content.trim() && !(isPoll && pollOptions.some((o) => o.trim().length > 0));

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
