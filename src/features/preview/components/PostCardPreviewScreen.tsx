import React, { useEffect } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
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

// Capture artboard, in points, measured from the reference capture (a 3x
// screenshot at the 430pt native baseline scaling.ts designs against): a 4:5
// portrait frame, the card inset 15pt and centred vertically, the wordmark
// ~100pt wide sitting 32pt above the bottom edge.
const ARTBOARD_WIDTH = 430;
const ARTBOARD_MIN_HEIGHT = (ARTBOARD_WIDTH * 5) / 4;
const CARD_INSET = 15;
const CARD_RADIUS = 9;
const WORDMARK_WIDTH = 103;
const WORDMARK_BOTTOM = 32;
// Keeps a tall card clear of the wordmark; applied top and bottom so the
// card stays centred and the frame grows evenly instead of overlapping.
const CARD_VERTICAL_CLEARANCE = 100;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Clean capture view for a single post card: the real PostListItem in
 * read-only mode, as a white rounded card on plain turquoise with the UniTee
 * wordmark below, laid out on a 430×537.5pt (4:5) artboard
 * (testID "preview-artboard") for screenshotting. Live posts
 * (?postId=<uuid>) load only through the signed-in viewer's own session;
 * sample fixtures (?fixture=text|anonymous|anonymous-sdu|long) are served in
 * __DEV__ builds only.
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
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.artboard} testID="preview-artboard">
        {children}
        <View style={styles.wordmark}>
          <UniTeeWordmark width={WORDMARK_WIDTH} />
        </View>
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
    justifyContent: "center",
  },
  artboard: {
    width: "100%",
    maxWidth: ARTBOARD_WIDTH,
    minHeight: ARTBOARD_MIN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: CARD_INSET,
    paddingVertical: CARD_VERTICAL_CLEARANCE,
    backgroundColor: lightTheme.primary,
  },
  card: {
    width: "100%",
    borderRadius: CARD_RADIUS,
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
    position: "absolute",
    bottom: WORDMARK_BOTTOM,
    left: 0,
    right: 0,
    alignItems: "center",
  },
});
