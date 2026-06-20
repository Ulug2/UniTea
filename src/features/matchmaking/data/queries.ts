import { supabase } from '../../../lib/supabase';
import type { EventPhase, LaunchEventProfile, MatchWithPartnerInfo } from '../types';

// The new matchmaking tables are not yet reflected in the auto-generated
// database.types.ts (they require a `supabase db push` + `npm run types` cycle).
// We cast through `any` here so the rest of the codebase stays strictly typed.
// Remove the cast once the types are regenerated after deploying the migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchEventConfig(): Promise<EventPhase> {
  const { data, error } = await db
    .from('launch_event_config')
    .select('phase')
    .single();

  if (error) throw error;
  return (data as { phase: EventPhase }).phase;
}

export async function fetchMySubmission(userId: string): Promise<LaunchEventProfile | null> {
  const { data, error } = await db
    .from('launch_event_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as LaunchEventProfile | null;
}

// Uses the get_my_match() SECURITY DEFINER RPC so we can safely read
// the partner's demographic info without broadening RLS on launch_event_profiles.
export async function fetchMyMatch(): Promise<MatchWithPartnerInfo | null> {
  const { data, error } = await db.rpc('get_my_match');

  if (error) throw error;
  return (data ?? null) as MatchWithPartnerInfo | null;
}

export type SubmitPayload = {
  user_id: string;
  university_id: string;
  gender: 'male' | 'female' | 'other';
  display_name: string;
  major: string;
  answers: Record<string, number>;
};

export async function submitMatchmakingProfile(payload: SubmitPayload): Promise<void> {
  const { error } = await db
    .from('launch_event_profiles')
    .insert(payload);

  if (error) throw error;
}

export async function recordMatchView(matchId: string, userId: string): Promise<void> {
  const { error } = await db
    .from('launch_event_message_windows')
    .insert({ user_id: userId, match_id: matchId });

  // 23505 = unique violation — window was already recorded; treat as success
  if (error && error.code !== '23505') throw error;
}

export async function fetchMatchWindow(
  userId: string,
): Promise<{ viewed_at: string; window_expires_at: string } | null> {
  const { data, error } = await db
    .from('launch_event_message_windows')
    .select('viewed_at, window_expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as { viewed_at: string; window_expires_at: string } | null;
}
