/**
 * Tests for src/context/AuthContext.tsx
 *
 * We test the REAL AuthContext (not the mock) by mocking supabase.
 * The moduleNameMapper points supabase imports to __mocks__/supabase.ts.
 */

jest.mock("../../lib/supabase", () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
// Do NOT mock AuthContext here — we are testing the real one
jest.mock("../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    breadcrumb: jest.fn(),
    setUser: jest.fn(),
    clearUser: jest.fn(),
  },
}));

import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../../context/AuthContext";

// ── access the supabase mock ───────────────────────────────────────────────────
function getSupabaseMock() {
  return require("../../lib/supabase").supabase;
}

// ── helper: capture the onAuthStateChange callback ────────────────────────────
function extractAuthStateCallback() {
  const supabase = getSupabaseMock();
  const calls = (supabase.auth.onAuthStateChange as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as (event: string, session: any) => void;
}

// ── wrapper ───────────────────────────────────────────────────────────────────
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(AuthProvider, null, children);

beforeEach(() => {
  jest.clearAllMocks();
  const supabase = getSupabaseMock();
  // Default: valid session
  (supabase.auth.getSession as jest.Mock).mockResolvedValue({
    data: {
      session: {
        user: { id: "user-abc", email: "abc@uni.edu" },
        access_token: "valid-token",
      },
    },
    error: null,
  });
  (supabase.auth.onAuthStateChange as jest.Mock).mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });
  (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
});

describe("AuthContext — initial load", () => {
  it("starts in loading state", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
  });

  it("resolves session from getSession on mount", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 5000,
    });

    expect(result.current.session?.user?.id).toBe("user-abc");
    expect(result.current.error).toBeNull();
  });

  it("sets session to null when getSession returns null", async () => {
    const supabase = getSupabaseMock();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 5000,
    });

    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("clears session and sets error when getSession returns an error", async () => {
    const supabase = getSupabaseMock();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: { message: "Session expired" },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false), {
      timeout: 5000,
    });

    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it("calls signOut when a token refresh error is detected", async () => {
    const supabase = getSupabaseMock();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: { message: "Token expired, please refresh" },
    });

    renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
  });
});

describe("AuthContext — auth state change events", () => {
  it("clears session on SIGNED_OUT event", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fireEvent = extractAuthStateCallback();

    act(() => {
      fireEvent("SIGNED_OUT", null);
    });

    expect(result.current.session).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("sets session on SIGNED_IN event", async () => {
    // Start with no session
    const supabase = getSupabaseMock();
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBeNull();

    const fireEvent = extractAuthStateCallback();
    const newSession = {
      user: { id: "new-user", email: "new@uni.edu" },
      access_token: "new-token",
    };

    act(() => {
      fireEvent("SIGNED_IN", newSession);
    });

    expect(result.current.session).toEqual(newSession);
    expect(result.current.error).toBeNull();
  });

  it("updates session on TOKEN_REFRESHED event", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fireEvent = extractAuthStateCallback();
    const refreshedSession = {
      user: { id: "user-abc", email: "abc@uni.edu" },
      access_token: "refreshed-token",
    };

    act(() => {
      fireEvent("TOKEN_REFRESHED", refreshedSession);
    });

    expect(result.current.session?.access_token).toBe("refreshed-token");
  });

  it("updates session on USER_UPDATED event", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fireEvent = extractAuthStateCallback();
    const updatedSession = {
      user: { id: "user-abc", email: "updated@uni.edu" },
      access_token: "same-token",
    };

    act(() => {
      fireEvent("USER_UPDATED", updatedSession);
    });

    expect(result.current.session?.user?.email).toBe("updated@uni.edu");
  });
});

describe("AuthContext — signOut", () => {
  it("clears session after signOut() even if supabase throws", async () => {
    const supabase = getSupabaseMock();
    (supabase.auth.signOut as jest.Mock).mockRejectedValue(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).not.toBeNull();

    await act(async () => {
      await result.current.signOut();
    });

    // Session cleared regardless of signOut error
    expect(result.current.session).toBeNull();
  });

  it("clears session normally when signOut() succeeds", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.session).toBeNull();
  });
});

describe("AuthContext — useAuth guard", () => {
  it("throws when useAuth is used outside AuthProvider", () => {
    // Suppress React error output for this test
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within AuthProvider",
    );

    spy.mockRestore();
  });
});
