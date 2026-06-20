import { useMutation, useQueryClient } from '@tanstack/react-query';
import { recordMatchView } from '../data/queries';

export function useRecordMatchView(userId?: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { matchId: string }>({
    mutationFn: ({ matchId }) => {
      if (!userId) throw new Error('Not authenticated');
      return recordMatchView(matchId, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['matchmaking', 'window', userId],
      });
    },
  });
}
