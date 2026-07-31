import React from "react";
import { FlatList } from "react-native";
import { render } from "@testing-library/react-native";
import { ChatMessageList } from "../../../../features/chat/components/ChatMessageList";

describe("ChatMessageList", () => {
  it('sets keyboardShouldPersistTaps="handled" on the message FlatList so taps on reply previews and long-presses are not swallowed just to dismiss the keyboard', () => {
    const { UNSAFE_getByType } = render(
      <ChatMessageList
        messages={[]}
        listRef={React.createRef<FlatList<any>>()}
        renderItem={() => null}
        keyExtractor={(item: any) => item.id}
        newMessagesPillCount={0}
        onNewMessagesPress={() => {}}
        isAtBottom={true}
        newMessagesPillStyles={{ pill: {}, text: {} }}
        theme={{ primary: "#000" }}
      />,
    );

    const list = UNSAFE_getByType(FlatList);
    expect(list.props.keyboardShouldPersistTaps).toBe("handled");
  });
});
