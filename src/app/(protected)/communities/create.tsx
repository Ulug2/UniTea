import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTheme } from "../../../context/ThemeContext";
import { supabase } from "../../../lib/supabase";
import { uploadImage } from "../../../utils/supabaseImages";
import { useImagePipeline } from "../../../hooks/useImagePipeline";
import { useCreateCommunity } from "../../../features/communities/hooks/useCommunityMutations";
import { moderateScale, scale, verticalScale } from "../../../utils/scaling";

export default function CreateCommunityScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardAppearance =
    Platform.OS === "ios" ? (isDark ? "dark" : "light") : undefined;
  const { height: screenHeight } = useWindowDimensions();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slideAnim = useRef(
    new Animated.Value(Platform.OS === "android" ? screenHeight : 0),
  ).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isExiting = useRef(false);

  const { pickAndPrepareImages } = useImagePipeline({
    allowsMultipleSelection: false,
    selectionLimit: 1,
  });
  const createCommunity = useCreateCommunity();

  const canSubmit = name.trim().length >= 2 && !isSubmitting;

  const closeScreen = useCallback(() => {
    if (Platform.OS !== "android") {
      router.back();
      return;
    }
    if (isExiting.current) return;
    isExiting.current = true;
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: screenHeight,
        duration: 280,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(220),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 60,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      router.back();
    });
  }, [screenHeight, slideAnim, fadeAnim]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeScreen();
      return true;
    });
    return () => sub.remove();
  }, [closeScreen]);

  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setAndroidKeyboardInset(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setAndroidKeyboardInset(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const pickAvatar = async () => {
    const selected = await pickAndPrepareImages();
    if (selected.length > 0) setAvatarUri(selected[0].uri);
  };

  const handleCreate = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      let avatarPath: string | null = null;
      if (avatarUri) {
        try {
          avatarPath = await uploadImage(avatarUri, supabase);
        } catch (error: any) {
          Alert.alert(
            "Error",
            error?.message || "Failed to upload the community image.",
          );
          return;
        }
      }

      await createCommunity.mutateAsync({
        name,
        description,
        avatarUrl: avatarPath,
      });

      if (Platform.OS === "android") {
        closeScreen();
      } else {
        router.back();
      }
    } catch {
      // Errors surfaced via mutation onError.
    } finally {
      setIsSubmitting(false);
    }
  };

  const main = (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.background }]}
      edges={[]}
    >
      <View
        style={[
          styles.header,
          {
            borderBottomColor: theme.border,
            paddingTop:
              Math.max(insets.top, verticalScale(10)) + verticalScale(10),
          },
        ]}
      >
        <Pressable onPress={closeScreen} style={styles.closeButton}>
          <Ionicons name="close" size={moderateScale(28)} color={theme.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          New Community
        </Text>
        <Pressable
          disabled={!canSubmit}
          onPress={handleCreate}
          style={[
            styles.createButton,
            { backgroundColor: canSubmit ? theme.primary : theme.border },
          ]}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>Create</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
        enabled={Platform.OS === "ios"}
      >
        <View style={{ flex: 1, paddingBottom: androidKeyboardInset }}>
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={false}
            contentContainerStyle={{
              paddingBottom: insets.bottom + verticalScale(24),
            }}
          >
            <View style={styles.avatarSection}>
              <Pressable onPress={pickAvatar} style={styles.avatarPressable}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}
                >
                  {avatarUri ? (
                    <ExpoImage
                      source={{ uri: avatarUri }}
                      style={styles.avatarImage}
                      contentFit="cover"
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
                  {avatarUri ? "Change photo" : "Add photo"}
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
                  placeholder="e.g. Photography Club"
                  placeholderTextColor={theme.secondaryText}
                  style={[styles.input, { color: theme.text }]}
                  keyboardAppearance={keyboardAppearance}
                  value={name}
                  onChangeText={setName}
                  maxLength={60}
                  autoFocus
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.text }]}>
                Description
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  styles.multilineContainer,
                  { backgroundColor: theme.card, borderColor: theme.border },
                ]}
              >
                <TextInput
                  placeholder="What is this community about?"
                  placeholderTextColor={theme.secondaryText}
                  style={[
                    styles.input,
                    styles.multilineInput,
                    { color: theme.text },
                  ]}
                  keyboardAppearance={keyboardAppearance}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  maxLength={300}
                  textAlignVertical="top"
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return Platform.OS === "android" ? (
    <Animated.View
      style={[
        { flex: 1 },
        { transform: [{ translateY: slideAnim }], opacity: fadeAnim },
      ]}
    >
      {main}
    </Animated.View>
  ) : (
    main
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
    paddingHorizontal: scale(15),
    paddingBottom: verticalScale(12),
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: moderateScale(5),
  },
  headerTitle: {
    fontSize: moderateScale(18),
    fontFamily: "Poppins_600SemiBold",
    flex: 1,
    textAlign: "center",
    marginHorizontal: scale(10),
  },
  createButton: {
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(18),
    borderRadius: moderateScale(20),
    minWidth: scale(72),
    alignItems: "center",
  },
  createButtonText: {
    color: "#fff",
    fontSize: moderateScale(14),
    fontFamily: "Poppins_600SemiBold",
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: scale(16),
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
});
