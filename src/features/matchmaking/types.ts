export type EventPhase = 'inactive' | 'accepting' | 'locked' | 'revealed';

export type LaunchEventProfile = {
  id: string;
  user_id: string;
  university_id: string;
  gender: 'male' | 'female' | 'other';
  display_name: string;
  major: string;
  answers: Record<string, number>;
  submitted_at: string;
  demographics_purged_at: string | null;
};

export type LaunchEventMatch = {
  id: string;
  university_id: string;
  user_a_id: string;
  user_b_id: string;
  compatibility_score: number;
  match_type: 'primary' | 'wingman';
  created_at: string;
};

export type MatchWindowStatus = {
  viewed_at: string | null;
  window_expires_at: string | null;
  isExpired: boolean;
  msRemaining: number;
};

export type MatchWithPartnerInfo = LaunchEventMatch & {
  partner: {
    user_id: string;
    display_name: string;
    major: string;
    gender: 'male' | 'female' | 'other';
  };
};
