export type AuthErrorKind =
  | "rate_limit"
  | "email_not_confirmed"
  | "invalid_credentials"
  | "user_already_registered"
  | "password_too_short"
  | "weak_password"
  | "invalid_email"
  | "network"
  | "timeout"
  | "unknown";

export type NormalizedAuthError = {
  kind: AuthErrorKind;
  message: string;
  rawMessage: string;
  /** Server-provided wait before retrying, when the error states one. */
  retryAfterSeconds?: number;
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

  // Per-user resend cooldown, e.g. "For security purposes, you can only
  // request this after 5 seconds."
  const retryAfter = messageLower.match(/request this after (\d+) seconds?/);
  if (retryAfter) {
    const retryAfterSeconds = Number(retryAfter[1]);
    return {
      kind: "rate_limit",
      message: `Please wait ${retryAfterSeconds} second${retryAfterSeconds === 1 ? "" : "s"} and try again.`,
      rawMessage,
      retryAfterSeconds,
    };
  }

  if (messageLower.includes("too many") || messageLower.includes("rate limit")) {
    return {
      kind: "rate_limit",
      message: "Too many attempts right now. Please wait a minute and try again.",
      rawMessage,
    };
  }

  // Leaked-password protection: "Password is known to be weak and easy to
  // guess, please choose a different one."
  if (messageLower.includes("known to be weak") || messageLower.includes("easy to guess")) {
    return {
      kind: "weak_password",
      message:
        "This password is too common or has appeared in a data breach. Please choose a different one.",
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

