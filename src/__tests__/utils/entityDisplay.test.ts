jest.mock("../../../assets/svg/student-thin-svgrepo-com.svg", () => "StudentIcon");
jest.mock("../../../assets/svg/people-svgrepo-com.svg", () => "PeopleIcon");
jest.mock("../../config/universityBranding", () => ({
  getUniversityBranding: (domain: string | null | undefined) => {
    if (domain === "nu.edu.kz") {
      return { displayName: "Nazarbayev", avatar: 1 };
    }
    if (domain === "stu.sdu.edu.kz") {
      return { displayName: "Suleiman Demirel", avatar: 2 };
    }
    return null;
  },
}));

import {
  buildPostAuthorContext,
  getAvatarForEntity,
  getDisplayNameForEntity,
  resolveAnonymousCommentAvatar,
  resolvePostAuthorDisplay,
} from "../../utils/entityDisplay";

describe("entityDisplay", () => {
  describe("resolvePostAuthorDisplay", () => {
    it("shows Nazarbayev branding for anonymous campus NU posts", () => {
      const result = resolvePostAuthorDisplay(
        buildPostAuthorContext({
          isAnonymous: true,
          universityDomain: "nu.edu.kz",
          userId: "user-1",
          currentUserId: "user-2",
        }),
      );

      expect(result.displayName).toBe("Nazarbayev");
      expect(result.avatar.kind).toBe("bundled");
      expect(result.entityKind).toBe("university");
    });

    it("shows Suleiman Demirel branding for anonymous campus SDU posts", () => {
      const result = resolvePostAuthorDisplay(
        buildPostAuthorContext({
          isAnonymous: true,
          universityDomain: "stu.sdu.edu.kz",
          userId: "user-1",
          currentUserId: "user-2",
        }),
      );

      expect(result.displayName).toBe("Suleiman Demirel");
      expect(result.avatar.kind).toBe("bundled");
    });

    it('shows "You" for own anonymous campus posts', () => {
      const result = resolvePostAuthorDisplay(
        buildPostAuthorContext({
          isAnonymous: true,
          universityDomain: "nu.edu.kz",
          userId: "user-1",
          currentUserId: "user-1",
        }),
      );

      expect(result.displayName).toBe("You");
    });

    it("shows community name for anonymous community posts", () => {
      const result = resolvePostAuthorDisplay(
        buildPostAuthorContext({
          isAnonymous: true,
          communityId: "comm-1",
          communityName: "Chess Club",
          userId: "user-1",
          currentUserId: "user-1",
        }),
      );

      expect(result.displayName).toBe("Chess Club");
      expect(result.entityKind).toBe("community");
    });

    it("uses community remote avatar when available", () => {
      const result = resolvePostAuthorDisplay(
        buildPostAuthorContext({
          isAnonymous: true,
          communityId: "comm-1",
          communityName: "Chess Club",
          communityAvatarUrl: "community-images/chess.png",
          userId: "user-1",
          currentUserId: "user-2",
        }),
      );

      expect(result.avatar).toEqual({
        kind: "remote",
        url: "community-images/chess.png",
        bucket: "post-images",
      });
    });

    it("uses people SVG fallback for community posts without image", () => {
      const result = resolvePostAuthorDisplay(
        buildPostAuthorContext({
          isAnonymous: true,
          communityId: "comm-1",
          communityName: "Chess Club",
          userId: "user-1",
          currentUserId: "user-2",
        }),
      );

      expect(result.avatar.kind).toBe("svg");
      if (result.avatar.kind === "svg") {
        expect(result.avatar.backgroundColor).toBe("#2FC9C1");
      }
    });

    it("shows student username for public posts", () => {
      const result = resolvePostAuthorDisplay(
        buildPostAuthorContext({
          isAnonymous: false,
          username: "alice",
          userId: "user-1",
          currentUserId: "user-2",
        }),
      );

      expect(result.displayName).toBe("alice");
      expect(result.entityKind).toBe("student");
    });

    it("uses student SVG fallback when public post has no avatar", () => {
      const result = resolvePostAuthorDisplay(
        buildPostAuthorContext({
          isAnonymous: false,
          username: "alice",
          avatarUrl: null,
          userId: "user-1",
          currentUserId: "user-2",
        }),
      );

      expect(result.avatar.kind).toBe("svg");
    });
  });

  describe("resolveAnonymousCommentAvatar", () => {
    it("matches university branding from parent post context", () => {
      const avatar = resolveAnonymousCommentAvatar(
        buildPostAuthorContext({
          isAnonymous: true,
          universityDomain: "nu.edu.kz",
          userId: "user-1",
          currentUserId: "user-2",
        }),
      );

      expect(avatar.kind).toBe("bundled");
    });

    it("matches community avatar from parent post context", () => {
      const avatar = resolveAnonymousCommentAvatar(
        buildPostAuthorContext({
          isAnonymous: true,
          communityId: "comm-1",
          communityName: "Chess Club",
          communityAvatarUrl: "community-images/chess.png",
          userId: "user-1",
          currentUserId: "user-2",
        }),
      );

      expect(avatar).toEqual({
        kind: "remote",
        url: "community-images/chess.png",
        bucket: "post-images",
      });
    });
  });

  describe("getDisplayNameForEntity", () => {
    it("falls back to University for unknown domains", () => {
      expect(
        getDisplayNameForEntity("university", {
          universityDomain: "unknown.edu",
        }),
      ).toBe("University");
    });

    it("falls back to Community when name is missing", () => {
      expect(getDisplayNameForEntity("community", {})).toBe("Community");
    });
  });

  describe("getAvatarForEntity", () => {
    it("falls back to student SVG for unknown university domain", () => {
      const avatar = getAvatarForEntity("university", {
        universityDomain: "unknown.edu",
      });

      expect(avatar.kind).toBe("svg");
    });
  });
});
