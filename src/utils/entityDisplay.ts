import type { ImageSourcePropType } from "react-native";
import type { FC } from "react";
import type { SvgProps } from "react-native-svg";
import {
  AVATAR_FALLBACK_BG,
  COMMUNITY_FALLBACK_ICON,
  STUDENT_AVATAR_ICON,
} from "../constants/avatars";
import { getUniversityBranding } from "../config/universityBranding";

export type EntityKind = "university" | "community" | "student";

export type AvatarDescriptor =
  | {
      kind: "remote";
      url: string;
      bucket: "avatars" | "post-images";
    }
  | {
      kind: "bundled";
      source: ImageSourcePropType;
    }
  | {
      kind: "svg";
      Icon: FC<SvgProps>;
      backgroundColor: string;
    };

export type PostAuthorContext = {
  isAnonymous: boolean;
  isOwnPost: boolean;
  username?: string | null;
  avatarUrl?: string | null;
  universityDomain?: string | null;
  communityId?: string | null;
  communityName?: string | null;
  communityAvatarUrl?: string | null;
};

export type EntityDisplayContext = {
  username?: string | null;
  avatarUrl?: string | null;
  universityDomain?: string | null;
  communityName?: string | null;
  communityAvatarUrl?: string | null;
  isOwnPost?: boolean;
};

export type PostAuthorDisplay = {
  displayName: string;
  avatar: AvatarDescriptor;
  entityKind: EntityKind;
};

function studentSvgAvatar(): AvatarDescriptor {
  return {
    kind: "svg",
    Icon: STUDENT_AVATAR_ICON,
    backgroundColor: AVATAR_FALLBACK_BG,
  };
}

function communitySvgAvatar(): AvatarDescriptor {
  return {
    kind: "svg",
    Icon: COMMUNITY_FALLBACK_ICON,
    backgroundColor: AVATAR_FALLBACK_BG,
  };
}

export function getDisplayNameForEntity(
  kind: EntityKind,
  ctx: EntityDisplayContext,
): string {
  switch (kind) {
    case "student":
      return ctx.username?.trim() || "Unknown";
    case "community":
      return ctx.communityName?.trim() || "Community";
    case "university": {
      if (ctx.isOwnPost) return "You";
      const branding = getUniversityBranding(ctx.universityDomain);
      return branding?.displayName ?? "University";
    }
  }
}

export function getAvatarForEntity(
  kind: EntityKind,
  ctx: EntityDisplayContext,
): AvatarDescriptor {
  switch (kind) {
    case "student":
      if (ctx.avatarUrl) {
        return {
          kind: "remote",
          url: ctx.avatarUrl,
          bucket: "avatars",
        };
      }
      return studentSvgAvatar();

    case "community":
      if (ctx.communityAvatarUrl) {
        return {
          kind: "remote",
          url: ctx.communityAvatarUrl,
          bucket: "post-images",
        };
      }
      return communitySvgAvatar();

    case "university": {
      const branding = getUniversityBranding(ctx.universityDomain);
      if (branding) {
        return { kind: "bundled", source: branding.avatar };
      }
      return studentSvgAvatar();
    }
  }
}

function resolveAnonymousEntityKind(
  ctx: PostAuthorContext,
): EntityKind {
  return ctx.communityId ? "community" : "university";
}

export function resolvePostAuthorDisplay(
  ctx: PostAuthorContext,
): PostAuthorDisplay {
  const entityKind: EntityKind = ctx.isAnonymous
    ? resolveAnonymousEntityKind(ctx)
    : "student";

  const entityCtx: EntityDisplayContext = {
    username: ctx.username,
    avatarUrl: ctx.avatarUrl,
    universityDomain: ctx.universityDomain,
    communityName: ctx.communityName,
    communityAvatarUrl: ctx.communityAvatarUrl,
    isOwnPost: ctx.isOwnPost,
  };

  return {
    displayName: getDisplayNameForEntity(entityKind, entityCtx),
    avatar: getAvatarForEntity(entityKind, entityCtx),
    entityKind,
  };
}

/** Anonymous comment avatar follows the parent post's university/community branding. */
export function resolveAnonymousCommentAvatar(
  ctx: PostAuthorContext,
): AvatarDescriptor {
  const entityKind = resolveAnonymousEntityKind(ctx);
  return getAvatarForEntity(entityKind, {
    universityDomain: ctx.universityDomain,
    communityName: ctx.communityName,
    communityAvatarUrl: ctx.communityAvatarUrl,
  });
}

export function buildPostAuthorContext(
  input: Omit<PostAuthorContext, "isOwnPost"> & {
    currentUserId?: string | null;
    userId?: string | null;
  },
): PostAuthorContext {
  const userId = input.userId ?? null;
  return {
    isAnonymous: input.isAnonymous,
    isOwnPost: Boolean(
      input.currentUserId && userId && input.currentUserId === userId,
    ),
    username: input.username,
    avatarUrl: input.avatarUrl,
    universityDomain: input.universityDomain,
    communityId: input.communityId,
    communityName: input.communityName,
    communityAvatarUrl: input.communityAvatarUrl,
  };
}
