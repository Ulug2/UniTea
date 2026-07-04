export const MIN_PASSWORD_LENGTH = 8;

export type PasswordRequirementKey =
  | "length"
  | "uppercase"
  | "lowercase"
  | "number"
  | "symbol"
  | "match";

export type PasswordRequirement = {
  key: PasswordRequirementKey;
  label: string;
  met: boolean;
};

const SYMBOL_REGEX = /[^A-Za-z0-9]/;

/**
 * Live requirement checklist for a password field. Pass `confirmPassword`
 * (and set `checkMatch`) only for screens that collect a confirmation field —
 * the "match" requirement is omitted otherwise so it isn't shown as
 * perpetually unmet on single-field forms (e.g. login).
 */
export function getPasswordRequirements(
  password: string,
  options?: { confirmPassword?: string; checkMatch?: boolean },
): PasswordRequirement[] {
  const requirements: PasswordRequirement[] = [
    {
      key: "length",
      label: `At least ${MIN_PASSWORD_LENGTH} characters`,
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    {
      key: "uppercase",
      label: "One uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      key: "lowercase",
      label: "One lowercase letter",
      met: /[a-z]/.test(password),
    },
    { key: "number", label: "One number", met: /[0-9]/.test(password) },
    {
      key: "symbol",
      label: "One special character",
      met: SYMBOL_REGEX.test(password),
    },
  ];

  if (options?.checkMatch) {
    requirements.push({
      key: "match",
      label: "Passwords match",
      met: password.length > 0 && password === options.confirmPassword,
    });
  }

  return requirements;
}

export function isPasswordValid(
  password: string,
  options?: { confirmPassword?: string; checkMatch?: boolean },
): boolean {
  return getPasswordRequirements(password, options).every((r) => r.met);
}
