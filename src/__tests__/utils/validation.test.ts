import {
  COMMUNITY_DESCRIPTION_MAX_LENGTH,
  COMMUNITY_NAME_MAX_LENGTH,
  POST_BODY_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
} from "../../constants/validationConstants";
import {
  normalizeCommunityDescription,
  normalizeCommunityName,
  validateCommunityDescription,
  validateCommunityName,
} from "../../utils/communityValidation";
import {
  normalizePostBody,
  normalizePostTitle,
  validatePostBody,
  validatePostTitle,
} from "../../utils/postValidation";

describe("communityValidation", () => {
  it("accepts names within the limit", () => {
    expect(validateCommunityName("a".repeat(COMMUNITY_NAME_MAX_LENGTH))).toBeNull();
    expect(normalizeCommunityName("Photo Club")).toBe("Photo Club");
  });

  it("rejects names over the limit", () => {
    const over = "a".repeat(COMMUNITY_NAME_MAX_LENGTH + 1);
    expect(validateCommunityName(over)).toContain(String(COMMUNITY_NAME_MAX_LENGTH));
    expect(() => normalizeCommunityName(over)).toThrow();
  });

  it("accepts descriptions within the limit", () => {
    expect(
      validateCommunityDescription("a".repeat(COMMUNITY_DESCRIPTION_MAX_LENGTH)),
    ).toBeNull();
  });

  it("rejects descriptions over the limit", () => {
    const over = "a".repeat(COMMUNITY_DESCRIPTION_MAX_LENGTH + 1);
    expect(validateCommunityDescription(over)).toContain(
      String(COMMUNITY_DESCRIPTION_MAX_LENGTH),
    );
  });
});

describe("postValidation", () => {
  it("accepts titles within the limit", () => {
    expect(validatePostTitle("a".repeat(POST_TITLE_MAX_LENGTH))).toBeNull();
    expect(normalizePostTitle("Hello")).toBe("Hello");
  });

  it("rejects titles over the limit", () => {
    const over = "a".repeat(POST_TITLE_MAX_LENGTH + 1);
    expect(validatePostTitle(over)).toContain(String(POST_TITLE_MAX_LENGTH));
    expect(() => normalizePostTitle(over)).toThrow();
  });

  it("accepts body within the limit", () => {
    expect(validatePostBody("a".repeat(POST_BODY_MAX_LENGTH))).toBeNull();
    expect(normalizePostBody("Hello world")).toBe("Hello world");
  });

  it("rejects body over the limit", () => {
    const over = "a".repeat(POST_BODY_MAX_LENGTH + 1);
    expect(validatePostBody(over)).toContain(String(POST_BODY_MAX_LENGTH));
    expect(() => normalizePostBody(over)).toThrow();
  });
});
