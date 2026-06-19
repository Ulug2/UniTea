import { useMutation, useQueryClient } from '@tanstack/react-query';
import { submitMatchmakingProfile, type SubmitPayload } from '../data/queries';
import { MATCHMAKING_QUESTIONS } from '../config/questions';

const REQUIRED_QUESTION_IDS = new Set(MATCHMAKING_QUESTIONS.map((q) => q.id));

function validateAnswers(answers: Record<string, number>): void {
  for (const id of REQUIRED_QUESTION_IDS) {
    if (!(id in answers) || typeof answers[id] !== 'number') {
      throw new Error(`Missing answer for question ${id}`);
    }
    const q = MATCHMAKING_QUESTIONS.find((q) => q.id === id)!;
    if (answers[id] < 0 || answers[id] >= q.options.length) {
      throw new Error(`Answer for ${id} is out of range`);
    }
  }
}

export function useSubmitMatchmaking(userId?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SubmitPayload>({
    mutationFn: async (payload) => {
      // Client-side validation before hitting the DB
      if (!payload.display_name.trim()) throw new Error('First name is required');
      if (!payload.major.trim()) throw new Error('Major is required');
      if (!['male', 'female', 'other'].includes(payload.gender)) {
        throw new Error('Gender selection is required');
      }
      if (payload.display_name.trim().length > 50) {
        throw new Error('First name must be 50 characters or less');
      }
      if (payload.major.trim().length > 100) {
        throw new Error('Major must be 100 characters or less');
      }
      validateAnswers(payload.answers);

      return submitMatchmakingProfile({
        ...payload,
        display_name: payload.display_name.trim(),
        major: payload.major.trim(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['matchmaking', 'my-submission', userId],
      });
    },
  });
}
