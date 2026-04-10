import React, { Component, ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import * as Sentry from "@sentry/react-native";
import { logger } from "../utils/logger";
import { useTheme } from "../context/ThemeContext";
import { moderateScale, scale, verticalScale } from "../utils/scaling";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryClass extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to Sentry
    logger.error("React Error Boundary caught an error", error, {
      componentStack: errorInfo.componentStack,
    });

    // Also send to Sentry directly for better stack traces
    if (!__DEV__) {
      Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback error={this.state.error} />;
    }

    return this.props.children;
  }
}

function ErrorFallback({ error }: { error: Error | null }) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        Something went wrong
      </Text>
      <Text style={[styles.message, { color: theme.secondaryText }]}>
        {error?.message || "An unexpected error occurred"}
      </Text>
      <Pressable
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={() => {
          // Reset error boundary state by reloading
          if (typeof window !== "undefined") {
            window.location.reload();
          }
        }}
      >
        <Text style={styles.buttonText}>Reload App</Text>
      </Pressable>
    </View>
  );
}

export default function ErrorBoundary({ children, fallback }: Props) {
  return (
    <ErrorBoundaryClass fallback={fallback}>{children}</ErrorBoundaryClass>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: moderateScale(24),
  },
  title: {
    fontSize: moderateScale(20),
    fontWeight: "600",
    marginBottom: verticalScale(8),
    textAlign: "center",
  },
  message: {
    fontSize: moderateScale(14),
    marginBottom: verticalScale(24),
    textAlign: "center",
  },
  button: {
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(24),
    borderRadius: moderateScale(8),
  },
  buttonText: {
    color: "#fff",
    fontSize: moderateScale(16),
    fontWeight: "600",
  },
});
