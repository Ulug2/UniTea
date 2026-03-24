import React from "react";
import { act, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockUseBlocks = jest.fn();
const onCallbacks: Array<(payload: any) => void> = [];

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
  ) => {
    if (!otherUserId) return false;
    return blocks.some(
      (b) => b.userId === otherUserId && b.scope === "profile_only",
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

const mockFrom = jest.fn((table: string) => {
  if (table === "user_chats_summary") return makeThenableResult([]);
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

jest.mock("../../../../lib/supabase", () => ({
  supabase: {
    from: mockFrom,
    channel: jest.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
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

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

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
});
