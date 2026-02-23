/**
 * Tests for src/components/ErrorBoundary.tsx
 */

jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
}));
jest.mock("../../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("../../context/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      background: "#fff",
      text: "#000",
      secondaryText: "#666",
      primary: "#007aff",
    },
    isDark: false,
    isManualDark: false,
    toggleTheme: jest.fn(),
    setTheme: jest.fn(),
  }),
}));

import React from "react";
import { render, screen } from "@testing-library/react-native";
import * as Sentry from "@sentry/react-native";
import { logger } from "../../utils/logger";
import ErrorBoundary from "../../components/ErrorBoundary";

const mockCaptureException = Sentry.captureException as jest.Mock;

// ── helpers ───────────────────────────────────────────────────────────────────

function ThrowOnce({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error from child");
  }
  return <></>;
}

// Suppress console.error on intentional throws
const originalConsoleError = console.error;
beforeEach(() => {
  jest.clearAllMocks();
  console.error = jest.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("ErrorBoundary", () => {
  it("renders children normally when no error occurs", () => {
    render(
      <ErrorBoundary>
        <ThrowOnce shouldThrow={false} />
      </ErrorBoundary>,
    );
    // Should not show fallback
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  });

  it("renders default ErrorFallback when child throws and no fallback prop provided", () => {
    render(
      <ErrorBoundary>
        <ThrowOnce shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/Test error from child/i)).toBeTruthy();
  });

  it("renders custom fallback prop when provided and child throws", () => {
    render(
      <ErrorBoundary fallback={<></>}>
        <ThrowOnce shouldThrow={true} />
      </ErrorBoundary>,
    );
    // Default fallback text should NOT appear
    expect(screen.queryByText(/Something went wrong/i)).toBeNull();
  });

  it("calls logger.error in componentDidCatch", () => {
    render(
      <ErrorBoundary>
        <ThrowOnce shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(logger.error).toHaveBeenCalledWith(
      "React Error Boundary caught an error",
      expect.any(Error),
      expect.any(Object),
    );
  });

  it("does NOT call Sentry.captureException in __DEV__ mode", () => {
    // __DEV__ is true in jest-expo by default
    render(
      <ErrorBoundary>
        <ThrowOnce shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it('shows "Reload App" button in the default fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowOnce shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Reload App/i)).toBeTruthy();
  });
});
