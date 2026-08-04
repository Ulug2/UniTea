/** Centralized field length limits — adjust here to propagate app-wide. */

export const COMMUNITY_NAME_MIN_LENGTH = 2;
export const COMMUNITY_NAME_MAX_LENGTH = 50;
export const COMMUNITY_DESCRIPTION_MAX_LENGTH = 300;

export const POST_TITLE_MAX_LENGTH = 120;
export const POST_BODY_MAX_LENGTH = 2000;

/** Mirrors is_valid_username()/profiles_username_format_check in
 * supabase/migrations/20260803010000_random_username_privacy_migration.sql */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
