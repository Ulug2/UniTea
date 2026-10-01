import React, { useEffect } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Head from "expo-router/head";
import PostListItem from "../../../components/PostListItem";
import { useAuth } from "../../../context/AuthContext";
import { StaticThemeProvider } from "../../../context/ThemeContext";
import { lightTheme } from "../../../theme";
import { setPendingDeepLink } from "../../../utils/pendingDeepLink";
import { toPostListItemProps } from "../../posts/utils/postListItemProps";
import { getPreviewFixture } from "../data/fixtures";
import { usePreviewPost } from "../hooks/usePreviewPost";
import { UniTeeWordmark } from "./UniTeeWordmark";
import type { PostsSummaryViewRow } from "../../../types/posts";

/** Native baseline width the app's scaling is designed against (scaling.ts). */
const CARD_MAX_WIDTH = 430;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Clean capture view for a single post card: the real PostListItem in
 * read-only mode, as a white rounded card on plain turquoise with the UniTee
 * wordmark below. Live posts (?postId=<uuid>) load only through the signed-in
 * viewer's own session; sample fixtures (?fixture=text|anonymous|long) are
 * served in __DEV__ builds only.
 */
export default function PostCardPreviewScreen() {
  const params = useLocalSearchParams<{ postId?: string; fixture?: string }>();
  const postId = firstParam(params.postId);
  const fixture = __DEV__ ? getPreviewFixture(firstParam(params.fixture)) : null;

  const { session, loading: authLoading } = useAuth();
  const live = usePreviewPost(fixture ? null : postId, session?.user?.id);

  // Same hand-off the protected layout uses for deep links: send signed-out
  // viewers through the normal sign-in screen and return here afterwards.
  const needsSignIn = !fixture && !authLoading && live.status === "signed-out";
  useEffect(() => {
    if (!needsSignIn || !postId) return;
    setPendingDeepLink(`/preview/post-card?postId=${encodeURIComponent(postId)}`);
    router.replace("/(auth)");
  }, [needsSignIn, postId]);

  let body: React.ReactNode;
  if (fixture) {
    body = <PreviewCard post={fixture} />;
  } else if (live.status === "ready") {
    body = <PreviewCard post={live.post} />;
  } else if (
    authLoading ||
    live.status === "loading" ||
    live.status === "signed-out"
  ) {
    body = (
      <ActivityIndicator
        testID="preview-loading"
        color={lightTheme.card}
        size="large"
      />
    );
  } else {
    body = <PreviewMessage status={live.status} />;
  }

  return (
    <PreviewFrame>
      <Head>
        <title>UniTee post preview</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      {body}
    </PreviewFrame>
  );
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  const { height } = useWindowDimensions();
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[
        styles.pageContent,
        { paddingTop: Math.max(96, Math.round(height * 0.16)) },
      ]}
    >
      <View style={styles.column}>{children}</View>
      <View style={styles.wordmark}>
        <UniTeeWordmark width={220} />
      </View>
    </ScrollView>
  );
}

function PreviewCard({ post }: { post: PostsSummaryViewRow }) {
  return (
    <View style={styles.card} testID="preview-card">
      <StaticThemeProvider isDark={false}>
        <PostListItem {...toPostListItemProps(post)} readOnly />
      </StaticThemeProvider>
    </View>
  );
}

const MESSAGES: Record<"invalid" | "error" | "unavailable", string> = {
  invalid: "Open this page with ?postId=<post id> to preview a post.",
  error: "Couldn't load this post. Check your connection and try again.",
  unavailable: "This post isn't available to preview.",
};

function PreviewMessage({ status }: { status: keyof typeof MESSAGES }) {
  return (
    <View style={[styles.card, styles.messageCard]} testID="preview-message">
      <Text style={styles.messageText}>{MESSAGES[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: lightTheme.primary,
  },
  pageContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 64,
  },
  column: {
    width: "100%",
    maxWidth: CARD_MAX_WIDTH,
    alignItems: "center",
  },
  card: {
    width: "100%",
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: lightTheme.card,
  },
  messageCard: {
    padding: 20,
  },
  messageText: {
    fontFamily: "Poppins_400Regular",
    fontSize: 15,
    color: lightTheme.text,
    textAlign: "center",
  },
  wordmark: {
    marginTop: 48,
  },
});
