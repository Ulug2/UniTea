jest.mock("../../../../lib/supabase", () => ({
  supabase: {
    storage: { from: jest.fn() },
  },
}));

import React from "react";
import { Animated } from "react-native";
import { render } from "@testing-library/react-native";
import { ChatComposer } from "../../../../features/chat/components/ChatComposer";

const baseStyles = {
  inputContainer: {},
  input: {},
  sendButton: {},
  imagePickerButton: {},
  imagePreviewContainer: {},
  imagePreview: {},
  removeImageButton: {},
};

describe("ChatComposer", () => {
  it("accepts an Animated.Value for paddingBottom so it can be kept in sync with the keyboard's own show/hide animation", () => {
    const paddingBottom = new Animated.Value(0);

    expect(() =>
      render(
        <ChatComposer
          value=""
          onChangeText={() => {}}
          onSend={() => {}}
          onPickImage={() => {}}
          selectedImageUri={null}
          onRemoveImage={() => {}}
          isSending={false}
          disabled={true}
          textColor="#000"
          placeholderColor="#999"
          styles={baseStyles}
          paddingBottom={paddingBottom}
        />,
      ),
    ).not.toThrow();
  });
});
