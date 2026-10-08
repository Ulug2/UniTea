jest.mock("../../../../lib/supabase", () => ({
  supabase: {
    storage: { from: jest.fn() },
  },
}));

import React from "react";
import { Animated } from "react-native";
import { fireEvent, render, screen } from "@testing-library/react-native";
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
          selectedImages={[]}
          canAddImage
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

  const image = (n: number) => ({
    localUri: `file://img-${n}.webp`,
    mimeType: "image/webp",
    fileName: null,
    aspectRatio: 1,
  });
  const renderComposer = (overrides: Partial<React.ComponentProps<typeof ChatComposer>> = {}) =>
    render(
      <ChatComposer
        value=""
        onChangeText={() => {}}
        onSend={() => {}}
        onPickImage={() => {}}
        selectedImages={[]}
        canAddImage
        onRemoveImage={() => {}}
        isSending={false}
        disabled={false}
        textColor="#000"
        placeholderColor="#999"
        styles={baseStyles}
        {...overrides}
      />,
    );

  it("shows one removable thumbnail per selected image and reports the removed index", () => {
    const onRemoveImage = jest.fn();
    renderComposer({ selectedImages: [image(1), image(2), image(3)], onRemoveImage });

    expect(screen.getByTestId("remove-image-0")).toBeTruthy();
    expect(screen.getByTestId("remove-image-2")).toBeTruthy();
    fireEvent.press(screen.getByTestId("remove-image-1"));
    expect(onRemoveImage).toHaveBeenCalledWith(1);
  });

  it("disables the image picker once the limit is reached", () => {
    const onPickImage = jest.fn();
    renderComposer({ selectedImages: [image(1), image(2), image(3)], canAddImage: false, onPickImage });

    fireEvent.press(screen.getByTestId("pick-image-button"));
    expect(onPickImage).not.toHaveBeenCalled();
  });

  it("shows the post the next message is about and lets the user remove it", () => {
    const onCancelPostContext = jest.fn();
    renderComposer({
      postContext: { label: "Lost & Found", text: "Lost: Keys\n[image]" },
      onCancelPostContext,
    });

    expect(screen.getByText("Lost & Found")).toBeTruthy();
    expect(screen.getByText("Lost: Keys [image]")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Remove post"));
    expect(onCancelPostContext).toHaveBeenCalledTimes(1);
  });

  it("shows no post strip for an ordinary chat", () => {
    renderComposer();
    expect(screen.queryByLabelText("Remove post")).toBeNull();
  });

  it("keeps the picker enabled below the limit", () => {
    const onPickImage = jest.fn();
    renderComposer({ selectedImages: [image(1)], onPickImage });

    fireEvent.press(screen.getByTestId("pick-image-button"));
    expect(onPickImage).toHaveBeenCalledTimes(1);
  });
});
