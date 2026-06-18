import {
  extractEmailDomain,
  isKnownUniversityDomain,
  resolveUniversityDomain,
} from "../../utils/universityDomain";

describe("universityDomain", () => {
  it("extracts domain from email", () => {
    expect(extractEmailDomain("student@nu.edu.kz")).toBe("nu.edu.kz");
    expect(extractEmailDomain("  user@stu.sdu.edu.kz ")).toBe("stu.sdu.edu.kz");
    expect(extractEmailDomain(null)).toBeNull();
    expect(extractEmailDomain("not-an-email")).toBeNull();
  });

  it("recognizes configured university domains", () => {
    expect(isKnownUniversityDomain("nu.edu.kz")).toBe(true);
    expect(isKnownUniversityDomain("unknown.edu")).toBe(false);
  });

  it("prefers profile domain over email", () => {
    expect(
      resolveUniversityDomain({
        profileUniversityDomain: "stu.sdu.edu.kz",
        userEmail: "student@nu.edu.kz",
      }),
    ).toBe("stu.sdu.edu.kz");
  });

  it("falls back to email when profile and cache are missing", () => {
    expect(
      resolveUniversityDomain({
        userEmail: "student@nu.edu.kz",
      }),
    ).toBe("nu.edu.kz");
  });

  it("returns null for unknown domains", () => {
    expect(
      resolveUniversityDomain({
        profileUniversityDomain: "unknown.edu",
        userEmail: "user@gmail.com",
      }),
    ).toBeNull();
  });
});
