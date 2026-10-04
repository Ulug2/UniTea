/**
 * Tests for src/features/profile/components/ProfileSettingsModal.tsx
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { ProfileSettingsModal } from "../../../../features/profile/components/ProfileSettingsModal";
import type { Theme } from "../../../../context/ThemeContext";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("../../../../context/FontScaleContext", () => ({
  useFontScale: () => ({ preference: "default" }),
}));

const theme = {
  card: "#fff",
  border: "#ddd",
  text: "#000",
  secondaryText: "#666",
  primary: "#00f",
} as Theme;

function renderModal() {
  const handlers = {
    onClose: jest.fn(),
    toggleTheme: jest.fn(),
    onPressNotifications: jest.fn(),
    onPressTextSize: jest.fn(),
    onPressTerms: jest.fn(),
    onPressPrivacy: jest.fn(),
    onPressManageAccount: jest.fn(),
    onPressContactSupport: jest.fn(),
    onPressWebsite: jest.fn(),
    onPressInstagram: jest.fn(),
  };
  const utils = render(
    <ProfileSettingsModal
      visible
      theme={theme}
      isDark={false}
      isManualDark={false}
      {...handlers}
    />,
  );
  return { ...utils, handlers };
}

describe("ProfileSettingsModal", () => {
  it("describes the automatic theme without naming a platform", () => {
    const { getByText } = renderModal();
    expect(getByText("Following system appearance")).toBeTruthy();
  });

  it("opens the website from the Website row", () => {
    const { getByText, handlers } = renderModal();
    fireEvent.press(getByText("Website"));
    expect(handlers.onPressWebsite).toHaveBeenCalledTimes(1);
    expect(handlers.onPressInstagram).not.toHaveBeenCalled();
  });

  it("opens Instagram from the Instagram row", () => {
    const { getByText, handlers } = renderModal();
    fireEvent.press(getByText("Instagram"));
    expect(handlers.onPressInstagram).toHaveBeenCalledTimes(1);
    expect(handlers.onPressWebsite).not.toHaveBeenCalled();
  });
});
