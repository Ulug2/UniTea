import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockUseBlocks = jest.fn();
const onCallbacks: Array<(payload: any) => void> = [];

jest.mock("../../../../hooks/usePushNotifications", () => ({
  getCurrentViewedChatId: jest.fn(() => null),
}));

jest.mock("../../../../context/AuthContext", () => ({
  useAuth: () => ({ session: { user: { id: "u1" } } }),
}));

jest.mock("../../../../context/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      background: "#fff",
      secondaryText: "#999",
      primary: "#000",
    },
  }),
}));

jest.mock("../../../../hooks/useBlocks", () => ({
  useBlocks: () => mockUseBlocks(),
  isBlockedChat: (
    blocks: Array<{ userId: string; scope: "anonymous_only" | "profile_only" }>,
    otherUserId: string | null | undefined,
    isAnonymous: boolean,
  ) => {
    if (!otherUserId) return false;
    const requiredScope = isAnonymous ? "anonymous_only" : "profile_only";
    return blocks.some(
      (b) => b.userId === otherUserId && b.scope === requiredScope,
    );
  },
}));

jest.mock("../../../../hooks/useRevealAfterFirstNImages", () => ({
  useRevealAfterFirstNImages: () => ({
    shouldReveal: true,
    onItemReady: jest.fn(),
  }),
}));

jest.mock("../../../../utils/feedPersistence", () => ({
  saveChatToStorage: jest.fn(),
}));

jest.mock("../../../../utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    breadcrumb: jest.fn(),
  },
}));

jest.mock("../../../../components/ChatListItem", () => {
  return function MockChatListItem() {
    return null;
  };
});

jest.mock("../../../../components/ChatListSkeleton", () => {
  return function MockChatListSkeleton() {
    return null;
  };
});

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: jest.fn(),
}));

const mockRemoveChannel = jest.fn(() => undefined);

function makeThenableResult(data: any[] = []) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
  };
  chain.then = (resolve: (value: { data: any[]; error: null }) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve);
  return chain;
}

// The `user_chats_summary` table is queried by TWO different consumers with
// different call shapes: the screen's own main list fetch
// (.select("*").or(...).order(...), awaited as a thenable) and
// applyFreshChatSummary's single-row follow-up (.select(...).eq("chat_id",
// id).maybeSingle()). This mock chain supports both on the same object so
// it doesn't matter which one runs, or in what order relative to the
// other — the main list fetch always resolves to an empty array
// (harmless), while .eq("chat_id", id) routes to whatever
// `mockChatIdFetchHandler` returns for that specific id, letting tests
// control the single-row response precisely without depending on overall
// call ordering.
let mockChatIdFetchHandler: ((chatId: string) => Promise<{ data: any; error: null }>) | null =
  null;

function makeUserChatsSummaryChain() {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    then: (resolve: (value: { data: any[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  chain.eq = jest.fn((_col: string, value: string) => {
    chain.maybeSingle = () =>
      mockChatIdFetchHandler
        ? mockChatIdFetchHandler(value)
        : Promise.resolve({ data: null, error: null });
    return chain;
  });
  return chain;
}

const mockFrom = jest.fn((table: string) => {
  if (table === "user_chats_summary") return makeUserChatsSummaryChain();
  if (table === "profiles") return makeThenableResult([]);
  return makeThenableResult([]);
});

let mockChannel: any;
mockChannel = {
  on: jest.fn(
    (_event: string, _filter: any, callback: (payload: any) => void) => {
      onCallbacks.push(callback);
      return mockChannel;
    },
  ),
  subscribe: jest.fn((statusCallback?: (status: string) => void) => {
    statusCallback?.("SUBSCRIBED");
    return mockChannel;
  }),
  unsubscribe: jest.fn(),
};

// NOTE: from/removeChannel must be wrapped in indirection functions rather
// than referenced directly (`from: mockFrom`). jest.mock factories are
// hoisted above regular `const` declarations in this file, so a direct
// reference bakes in whatever mockFrom evaluates to AT THAT EARLIER POINT
// (undefined, since `const mockFrom = jest.fn(...)` hasn't run yet) —
// permanently, since object literals capture values, not live bindings.
// Wrapping in an arrow function defers the mockFrom lookup to actual call
// time, by which point it's properly initialized. `channel` already used
// this pattern; only `from`/`removeChannel` were missing it.
jest.mock("../../../../lib/supabase", () => ({
  supabase: {
    from: (...args: Parameters<typeof mockFrom>) => mockFrom(...args),
    channel: jest.fn(() => mockChannel),
    removeChannel: (...args: Parameters<typeof mockRemoveChannel>) =>
      mockRemoveChannel(...args),
  },
}));

import ChatScreen from "../../../../app/(protected)/(tabs)/chat";

describe("ChatScreen realtime blocked-user cache guards", () => {
  let queryClient: QueryClient;

  const blockedUserId = "u2";
  const initialSummary = {
    chat_id: "chat-1",
    participant_1_id: "u1",
    participant_2_id: blockedUserId,
    post_id: null,
    created_at: "2026-03-25T09:00:00.000Z",
    last_message_at: "2026-03-25T10:00:00.000Z",
    last_message_content_p1: "old",
    last_message_has_image_p1: false,
    last_message_content_p2: "old",
    last_message_has_image_p2: false,
    unread_count_p1: 0,
    unread_count_p2: 0,
  };

  function renderScreen() {
    return render(
      <QueryClientProvider client={queryClient}>
        <ChatScreen />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    onCallbacks.length = 0;
    mockChatIdFetchHandler = null;

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    // global-unread-count has no active observer in this test (the real
    // badge lives in the tab layout, not ChatScreen) — with the default
    // gcTime: 0 above, an unobserved query is eligible for garbage
    // collection, and the async act() flushes in these tests cross enough
    // of a tick boundary for that GC to fire before an assertion can read
    // it back. Give this one query family a real gcTime so tests can
    // reliably read what recomputeGlobalBadge wrote.
    queryClient.setQueryDefaults(["global-unread-count"], { gcTime: 60_000 });

    mockUseBlocks.mockReturnValue({
      data: [{ userId: blockedUserId, scope: "profile_only" }],
    });

    queryClient.setQueryData(["chat-summaries", "u1"], [initialSummary]);
    queryClient.setQueryData(
      ["blocks", "u1"],
      [{ userId: blockedUserId, scope: "profile_only" }],
    );
    queryClient.setQueryData(["global-unread-count", "u1"], 7);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it("ignores blocked realtime UPDATE and does not mutate chat-summaries cache", async () => {
    renderScreen();

    await waitFor(() => {
      expect(onCallbacks.length).toBeGreaterThan(0);
    });

    const before = queryClient.getQueryData(["chat-summaries", "u1"]);

    act(() => {
      onCallbacks[0]({
        eventType: "UPDATE",
        new: {
          id: "chat-1",
          participant_1_id: "u1",
          participant_2_id: blockedUserId,
          last_message_at: "2026-03-25T12:00:00.000Z",
          unread_count_p1: 2,
          unread_count_p2: 0,
        },
      });
    });

    const after = queryClient.getQueryData(["chat-summaries", "u1"]);
    const unread = queryClient.getQueryData(["global-unread-count", "u1"]);

    expect(after).toEqual(before);
    expect(unread).toBe(7);
  });

  // Bug B: the old code only ever fetched unread_count_p1/p2 in the
  // follow-up query, never the preview text, so the list reordered but
  // still showed the previous message. This asserts the preview text is
  // actually updated once the fetch resolves.
  it("updates preview text (not just ordering) once the fresh row lands (Bug B)", async () => {
    mockChatIdFetchHandler = async () => ({
      data: {
        chat_id: "chat-1",
        last_message_at: "2026-03-25T12:00:00.000Z",
        last_message_content_p1: "old",
        last_message_has_image_p1: false,
        last_message_content_p2: "new incoming text",
        last_message_has_image_p2: false,
        unread_count_p1: 1,
        unread_count_p2: 0,
        participant_1_id: "u1",
        participant_2_id: "u3",
      },
      error: null,
    });

    queryClient.setQueryData(
      ["chat-summaries", "u1"],
      [{ ...initialSummary, participant_2_id: "u3" }],
    );
    mockUseBlocks.mockReturnValue({ data: [] });
    queryClient.setQueryData(["blocks", "u1"], []);

    renderScreen();
    await waitFor(() => expect(onCallbacks.length).toBeGreaterThan(0));

    await act(async () => {
      onCallbacks[0]({
        eventType: "UPDATE",
        new: {
          id: "chat-1",
          participant_1_id: "u1",
          participant_2_id: "u3",
          is_anonymous: false,
          last_message_at: "2026-03-25T12:00:00.000Z",
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const after = queryClient.getQueryData<any[]>(["chat-summaries", "u1"]);
    expect(after?.[0].last_message_content_p2).toBe("new incoming text");
    expect(after?.[0].unread_count_p1).toBe(1);
  });

  // Bug C: the old code recomputed the badge synchronously, immediately
  // after firing (but not awaiting) the unread-count fetch — so it always
  // used stale data and was never corrected once the fetch landed. This
  // asserts the badge reflects the FRESH count after resolution.
  it("recomputes the global badge only after fresh unread counts land (Bug C)", async () => {
    mockChatIdFetchHandler = async () => ({
      data: {
        chat_id: "chat-1",
        last_message_at: "2026-03-25T12:00:00.000Z",
        last_message_content_p1: "old",
        last_message_has_image_p1: false,
        last_message_content_p2: "hi",
        last_message_has_image_p2: false,
        unread_count_p1: 5,
        unread_count_p2: 0,
        participant_1_id: "u1",
        participant_2_id: "u3",
      },
      error: null,
    });

    queryClient.setQueryData(
      ["chat-summaries", "u1"],
      [{ ...initialSummary, participant_2_id: "u3", unread_count_p1: 0 }],
    );
    mockUseBlocks.mockReturnValue({ data: [] });
    queryClient.setQueryData(["blocks", "u1"], []);
    queryClient.setQueryData(["global-unread-count", "u1"], 0);

    renderScreen();
    await waitFor(() => expect(onCallbacks.length).toBeGreaterThan(0));

    await act(async () => {
      onCallbacks[0]({
        eventType: "UPDATE",
        new: {
          id: "chat-1",
          participant_1_id: "u1",
          participant_2_id: "u3",
          is_anonymous: false,
          last_message_at: "2026-03-25T12:00:00.000Z",
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryClient.getQueryData(["global-unread-count", "u1"])).toBe(5);
  });

  // Bug A: anonymous chats have no postgres_changes path at all, so the
  // list screen subscribes to a private chats:{userId} broadcast instead.
  // This asserts that signal alone (no postgres_changes event involved)
  // reorders the list and triggers the same fetch-and-patch flow.
  it("reorders and refreshes an anonymous chat from the chats:{userId} broadcast alone (Bug A)", async () => {
    mockChatIdFetchHandler = async () => ({
      data: {
        chat_id: "anon-chat-1",
        last_message_at: "2026-03-25T13:00:00.000Z",
        last_message_content_p1: null,
        last_message_has_image_p1: false,
        last_message_content_p2: null,
        last_message_has_image_p2: false,
        unread_count_p1: 1,
        unread_count_p2: 0,
        participant_1_id: "u1",
        participant_2_id: null,
      },
      error: null,
    });

    const olderSummary = {
      ...initialSummary,
      chat_id: "anon-chat-1",
      participant_2_id: null,
      is_anonymous: true,
      last_message_at: "2026-03-25T09:00:00.000Z",
    };
    const otherSummary = {
      ...initialSummary,
      chat_id: "chat-other",
      participant_2_id: "u4",
      last_message_at: "2026-03-25T10:00:00.000Z",
    };
    queryClient.setQueryData(
      ["chat-summaries", "u1"],
      [otherSummary, olderSummary],
    );
    mockUseBlocks.mockReturnValue({ data: [] });
    queryClient.setQueryData(["blocks", "u1"], []);

    renderScreen();
    await waitFor(() => expect(onCallbacks.length).toBeGreaterThanOrEqual(3));

    // Registration order: channelP1 (postgres_changes), channelP2
    // (postgres_changes), channelBroadcast (broadcast) — index 2.
    await act(async () => {
      onCallbacks[2]({
        payload: {
          chat_id: "anon-chat-1",
          last_message_at: "2026-03-25T13:00:00.000Z",
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const after = queryClient.getQueryData<any[]>(["chat-summaries", "u1"]);
    expect(after?.[0].chat_id).toBe("anon-chat-1"); // reordered to top
    expect(after?.find((s) => s.chat_id === "anon-chat-1")?.unread_count_p1).toBe(1);
  });

  // Rapid succession: two messages arrive close together and their
  // follow-up fetches can resolve out of order. The older response must
  // never overwrite the newer one already in the cache.
  it("discards an out-of-order fetch response instead of overwriting newer data", async () => {
    let resolveOlder: (row: any) => void = () => {};
    let resolveNewer: (row: any) => void = () => {};
    const olderPromise = new Promise((resolve) => {
      resolveOlder = (row) => resolve({ data: row, error: null });
    });
    const newerPromise = new Promise((resolve) => {
      resolveNewer = (row) => resolve({ data: row, error: null });
    });
    let eqCallCount = 0;
    mockChatIdFetchHandler = () => {
      const isFirst = eqCallCount === 0;
      eqCallCount++;
      return (isFirst ? olderPromise : newerPromise) as Promise<{
        data: any;
        error: null;
      }>;
    };

    queryClient.setQueryData(
      ["chat-summaries", "u1"],
      [{ ...initialSummary, participant_2_id: "u3" }],
    );
    mockUseBlocks.mockReturnValue({ data: [] });
    queryClient.setQueryData(["blocks", "u1"], []);

    renderScreen();
    await waitFor(() => expect(onCallbacks.length).toBeGreaterThan(0));

    // First (older) message arrives, then a second (newer) one right after —
    // both trigger a follow-up fetch before either resolves.
    act(() => {
      onCallbacks[0]({
        eventType: "UPDATE",
        new: {
          id: "chat-1",
          participant_1_id: "u1",
          participant_2_id: "u3",
          is_anonymous: false,
          last_message_at: "2026-03-25T12:00:00.000Z",
        },
      });
    });
    act(() => {
      onCallbacks[0]({
        eventType: "UPDATE",
        new: {
          id: "chat-1",
          participant_1_id: "u1",
          participant_2_id: "u3",
          is_anonymous: false,
          last_message_at: "2026-03-25T12:00:05.000Z",
        },
      });
    });

    // Resolve the NEWER fetch first, then the OLDER one — simulating
    // out-of-order network resolution.
    await act(async () => {
      resolveNewer({
        chat_id: "chat-1",
        last_message_at: "2026-03-25T12:00:05.000Z",
        last_message_content_p1: "old",
        last_message_has_image_p1: false,
        last_message_content_p2: "second message",
        last_message_has_image_p2: false,
        unread_count_p1: 2,
        unread_count_p2: 0,
        participant_1_id: "u1",
        participant_2_id: "u3",
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      resolveOlder({
        chat_id: "chat-1",
        last_message_at: "2026-03-25T12:00:00.000Z",
        last_message_content_p1: "old",
        last_message_has_image_p1: false,
        last_message_content_p2: "first message",
        last_message_has_image_p2: false,
        unread_count_p1: 1,
        unread_count_p2: 0,
        participant_1_id: "u1",
        participant_2_id: "u3",
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const after = queryClient.getQueryData<any[]>(["chat-summaries", "u1"]);
    // The stale (older) response must not have clobbered the newer content.
    expect(after?.[0].last_message_content_p2).toBe("second message");
    expect(after?.[0].unread_count_p1).toBe(2);
  });
});
