import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../context/AuthContext';
import { isRateLimitError } from '../../../utils/clientRateLimit';

type InitiateMatchChatResult = { chatId: string };

export function useInitiateMatchChat() {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();

  return useMutation<InitiateMatchChatResult, Error, { partnerUserId: string }>({
    mutationFn: async ({ partnerUserId }) => {
      if (!currentUserId) throw new Error('Not authenticated');
      if (currentUserId === partnerUserId) {
        throw new Error('Cannot chat with yourself');
      }

      // Canonical ordering: smaller UUID is participant_1 to avoid duplicate rows
      const [p1, p2] =
        currentUserId < partnerUserId
          ? [currentUserId, partnerUserId]
          : [partnerUserId, currentUserId];

      // Check for an existing matchmaking chat (post_id IS NULL, non-anonymous, same pair)
      const { data: existing, error: selectErr } = await supabase
        .from('chats')
        .select('id')
        .eq('participant_1_id', p1)
        .eq('participant_2_id', p2)
        .eq('is_anonymous', false)
        .is('post_id', null)
        .maybeSingle();

      if (selectErr && selectErr.code !== 'PGRST116') throw selectErr;
      if (existing) return { chatId: existing.id };

      const { data: created, error: insertErr } = await supabase
        .from('chats')
        .insert({
          participant_1_id: p1,
          participant_2_id: p2,
          post_id: null,
          initiator_id: currentUserId,
          is_anonymous: false,
        })
        .select('id')
        .single();

      if (insertErr) {
        // Race condition: another insert won — fetch the existing row
        if (insertErr.code === '23505') {
          const { data: dup, error: dupErr } = await supabase
            .from('chats')
            .select('id')
            .eq('participant_1_id', p1)
            .eq('participant_2_id', p2)
            .eq('is_anonymous', false)
            .is('post_id', null)
            .single();
          if (dupErr) throw dupErr;
          return { chatId: dup.id };
        }
        throw insertErr;
      }

      return { chatId: created.id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['chat-summaries', currentUserId],
        refetchType: 'none',
      });
    },
    onError: (error) => {
      if (isRateLimitError(error)) {
        Alert.alert("Slow down", "You're starting too many chats. Please wait a moment before trying again.");
      }
    },
  });
}
