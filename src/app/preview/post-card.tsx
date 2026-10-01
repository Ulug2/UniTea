import { Platform } from "react-native";
import { Redirect } from "expo-router";
import PostCardPreviewScreen from "../../features/preview/components/PostCardPreviewScreen";

/**
 * Browser-only, read-only post card preview (see PostCardPreviewScreen).
 * Lives outside (protected) on purpose: that layout registers push tokens
 * and sets badges, which a capture page must never do. It does its own
 * sign-in hand-off and ban/block/university checks instead. The mobile apps
 * never show it — a native visit is sent to the normal home route.
 */
export default function PostCardPreviewRoute() {
  if (Platform.OS !== "web") return <Redirect href="/" />;
  return <PostCardPreviewScreen />;
}
