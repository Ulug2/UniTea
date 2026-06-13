import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTheme } from "../../../../context/ThemeContext";
import { useAuth } from "../../../../context/AuthContext";
import { supabase } from "../../../../lib/supabase";
import SupabaseImage from "../../../../components/SupabaseImage";
import { uploadImage } from "../../../../utils/supabaseImages";
import { useImagePipeline } from "../../../../hooks/useImagePipeline";
import { useCommunity } from "../../../../features/communities/hooks/useCommunity";
import {
  useUpdateCommunity,
  useDeleteCommunity,
} from "../../../../features/communities/hooks/useCommunityMutations";
import { moderateScale, scale, verticalScale } from "../../../../utils/scaling";

export default function ManageCommunityScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardAppearance = isDark ? "dark" : "light";
  const { id } = useLocalSearchParams<{ id: string }>();
  const communityId = typeof id === "string" ? id : id?.[0];
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const { data: community, isPending } = useCommunity(communityId);
  const updateCommunity = useUpdateCommunity();
  const deleteCommunity = useDeleteCommunity();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  // New local image to upload (uri) vs existing stored path.
  const [newAvatarUri, setNewAvatarUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (community) {
      setName(community.name);
      setDescription(community.description ?? "");
    }
  }, [community]);

  const { pickAndPrepareImages } = useImagePipeline({
    allowsMultipleSelection: false,
    selectionLimit: 1,
  });

  const isOwner = !!community && community.created_by === currentUserId;
  const canSave = name.trim().length >= 2 && !isSaving;

  const pickAvatar = async () => {
    const selected = await pickAndPrepareImages();
    if (selected.length > 0) setNewAvatarUri(selected[0].uri);
  };

  const handleSave = async () => {
    if (!canSave || !communityId) return;
    setIsSaving(true);
    try {
      let avatarPath = community?.avatar_url ?? null;
      if (newAvatarUri) {
        try {
          avatarPath = await uploadImage(newAvatarUri, supabase);
        } catch (error: any) {
          Alert.alert("Error", error?.message || "Failed to upload the image.");
          return;
        }
      }

      await updateCommunity.mutateAsync({
        id: communityId,
        name,
        description,
        avatarUrl: avatarPath,
      });
      router.back();
    } catch {
      // Errors surfaced via mutation onError.
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!communityId) return;
    Alert.alert(
      "Delete community?",
      "This permanently deletes the community and all of its posts. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCommunity.mutateAsync(communityId);
              router.replace("/(protected)/(tabs)");
            } catch {
              // Errors surfaced via mutation onError.
            }
          },
        },
      ],
    );
  };

  if (isPending) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!community || !isOwner) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
        edges={["top"]}
      >
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={moderateScale(8)}
            style={styles.headerButton}
          >
            <Ionicons name="close" size={moderateScale(26)} color={theme.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Manage</Text>
          <View style={styles.headerButton} />
        </View>
        <View style={styles.centered}>
          <Text style={[styles.emptyText, { color: theme.secondaryText }]}>
            You don't have permission to manage this community.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const hasNewAvatar = Boolean(newAvatarUri);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={["top"]}
    >
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={moderateScale(8)}
          style={styles.headerButton}
        >
          <Ionicons name="close" size={moderateScale(26)} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Manage Community
        </Text>
        <Pressable
          disabled={!canSave}
          onPress={handleSave}
          style={[
            styles.saveButton,
            { backgroundColor: canSave ? theme.primary : theme.border },
          ]}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + verticalScale(40) }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.avatarSection}>
          <Pressable onPress={pickAvatar} style={styles.avatarPressable}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              {hasNewAvatar ? (
                <ExpoImage
                  source={{ uri: newAvatarUri! }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : community.avatar_url ? (
                <SupabaseImage
                  path={community.avatar_url}
                  bucket="post-images"
                  style={styles.avatarImage}
                />
              ) : (
                <Ionicons
                  name="camera"
                  size={moderateScale(28)}
                  color={theme.secondaryText}
                />
              )}
            </View>
            <Text style={[styles.avatarHint, { color: theme.primary }]}>
              Change photo
            </Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Name *</Text>
          <View
            style={[
              styles.inputContainer,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <TextInput
              placeholderTextColor={theme.secondaryText}
              style={[styles.input, { color: theme.text }]}
              keyboardAppearance={keyboardAppearance}
              value={name}
              onChangeText={setName}
              maxLength={60}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>Description</Text>
          <View
            style={[
              styles.inputContainer,
              styles.multilineContainer,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <TextInput
              placeholderTextColor={theme.secondaryText}
              style={[styles.input, styles.multilineInput, { color: theme.text }]}
              keyboardAppearance={keyboardAppearance}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={300}
              textAlignVertical="top"
            />
          </View>
        </View>

        <Pressable
          onPress={handleDelete}
          style={[styles.deleteButton, { borderColor: theme.error }]}
        >
          <Ionicons
            name="trash-outline"
            size={moderateScale(18)}
            color={theme.error}
          />
          <Text style={[styles.deleteButtonText, { color: theme.error }]}>
            Delete Community
          </Text>
        </Pressable>
      </ScrollView>
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
    paddingHorizontal: scale(12),
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: moderateScale(4),
    minWidth: scale(48),
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontFamily: "Poppins_600SemiBold",
  },
  saveButton: {
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(18),
    borderRadius: moderateScale(20),
    minWidth: scale(64),
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: moderateScale(14),
    fontFamily: "Poppins_600SemiBold",
  },
  scroll: {
    flex: 1,
    paddingHorizontal: scale(16),
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: scale(32),
  },
  emptyText: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  avatarSection: {
    alignItems: "center",
    paddingVertical: verticalScale(24),
  },
  avatarPressable: {
    alignItems: "center",
  },
  avatar: {
    width: scale(88),
    height: scale(88),
    borderRadius: moderateScale(44),
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarHint: {
    marginTop: verticalScale(8),
    fontSize: moderateScale(13),
    fontFamily: "Poppins_500Medium",
  },
  field: {
    marginBottom: verticalScale(18),
  },
  label: {
    fontSize: moderateScale(14),
    fontFamily: "Poppins_600SemiBold",
    marginBottom: verticalScale(8),
  },
  inputContainer: {
    borderWidth: 1,
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(12),
    minHeight: verticalScale(48),
    justifyContent: "center",
  },
  multilineContainer: {
    minHeight: verticalScale(110),
    paddingVertical: verticalScale(10),
  },
  input: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_400Regular",
  },
  multilineInput: {
    minHeight: verticalScale(90),
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: moderateScale(8),
    marginTop: verticalScale(12),
    paddingVertical: verticalScale(14),
    borderRadius: moderateScale(12),
    borderWidth: 1,
  },
  deleteButtonText: {
    fontSize: moderateScale(15),
    fontFamily: "Poppins_600SemiBold",
  },
});
