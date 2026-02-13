export type AuthErrorKind =
  | "rate_limit"
  | "email_not_confirmed"
  | "invalid_credentials"
  | "user_already_registered"
  | "password_too_short"
  | "invalid_email"
  | "network"
  | "timeout"
  | "unknown";

export type NormalizedAuthError = {
  kind: AuthErrorKind;
  message: string;
  rawMessage: string;
};

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message || "Unknown error";
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

export function normalizeAuthError(err: unknown): NormalizedAuthError {
  const rawMessage = toMessage(err);
  const messageLower = rawMessage.toLowerCase();

  if (messageLower.includes("too many") || messageLower.includes("rate limit")) {
    return {
      kind: "rate_limit",
      message: "Too many attempts. Please try again in 5 minutes.",
      rawMessage,
    };
  }

  if (
    messageLower.includes("invalid login credentials") ||
    messageLower.includes("invalid credentials")
  ) {
    return {
      kind: "invalid_credentials",
      message: "Incorrect email or password. Please try again.",
      rawMessage,
    };
  }

  if (messageLower.includes("email not confirmed")) {
    return {
      kind: "email_not_confirmed",
      message: "Please verify your email address before signing in.",
      rawMessage,
    };
  }

  if (messageLower.includes("user already registered")) {
    return {
      kind: "user_already_registered",
      message: "An account with this email already exists.",
      rawMessage,
    };
  }

  if (messageLower.includes("password should be at least")) {
    return {
      kind: "password_too_short",
      message: "Password must be at least 6 characters long.",
      rawMessage,
    };
  }

  if (messageLower.includes("invalid email")) {
    return {
      kind: "invalid_email",
      message: "Please enter a valid email address.",
      rawMessage,
    };
  }

  if (messageLower.includes("network")) {
    return {
      kind: "network",
      message: "Network error. Please check your connection.",
      rawMessage,
    };
  }

  if (messageLower.includes("timeout")) {
    return {
      kind: "timeout",
      message: "Request timed out. Please check your connection and try again.",
      rawMessage,
    };
  }

  return {
    kind: "unknown",
    message: "Something went wrong. Please try again.",
    rawMessage,
  };
}

