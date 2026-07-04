jest.mock('../../../features/matchmaking/data/queries', () => ({
  submitMatchmakingProfile: jest.fn(),
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSubmitMatchmaking } from '../../../features/matchmaking/hooks/useSubmitMatchmaking';
import { submitMatchmakingProfile } from '../../../features/matchmaking/data/queries';
import { MATCHMAKING_QUESTIONS } from '../../../features/matchmaking/config/questions';
import type { SubmitPayload } from '../../../features/matchmaking/data/queries';

const mockSubmit = submitMatchmakingProfile as jest.Mock;

function validAnswers(): Record<string, number> {
  const answers: Record<string, number> = {};
  for (const q of MATCHMAKING_QUESTIONS) {
    answers[q.id] = 0;
  }
  return answers;
}

function validPayload(overrides: Partial<SubmitPayload> = {}): SubmitPayload {
  return {
    display_name: 'Alex',
    major: 'Computer Science',
    gender: 'other',
    answers: validAnswers(),
    ...overrides,
  } as SubmitPayload;
}

let queryClient: QueryClient;

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  jest.clearAllMocks();
});

afterEach(() => {
  queryClient.clear();
});

describe('useSubmitMatchmaking', () => {
  it('submits a fully valid, trimmed payload', async () => {
    mockSubmit.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSubmitMatchmaking('u1'), { wrapper: createWrapper() });

    act(() => result.current.mutate(validPayload({ display_name: '  Alex  ', major: '  CS  ' })));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Alex', major: 'CS' }),
    );
  });

  it('rejects an empty display name before hitting the network', async () => {
    const { result } = renderHook(() => useSubmitMatchmaking('u1'), { wrapper: createWrapper() });
    act(() => result.current.mutate(validPayload({ display_name: '   ' })));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('First name is required');
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects a display name over 50 characters', async () => {
    const { result } = renderHook(() => useSubmitMatchmaking('u1'), { wrapper: createWrapper() });
    act(() => result.current.mutate(validPayload({ display_name: 'a'.repeat(51) })));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe(
      'First name must be 50 characters or less',
    );
  });

  it('rejects an empty major', async () => {
    const { result } = renderHook(() => useSubmitMatchmaking('u1'), { wrapper: createWrapper() });
    act(() => result.current.mutate(validPayload({ major: '' })));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Major is required');
  });

  it('rejects an invalid gender value', async () => {
    const { result } = renderHook(() => useSubmitMatchmaking('u1'), { wrapper: createWrapper() });
    act(() => result.current.mutate(validPayload({ gender: 'invalid' as any })));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Gender selection is required');
  });

  it('rejects a payload missing an answer for one of the required questions', async () => {
    const answers = validAnswers();
    delete answers[MATCHMAKING_QUESTIONS[0].id];
    const { result } = renderHook(() => useSubmitMatchmaking('u1'), { wrapper: createWrapper() });

    act(() => result.current.mutate(validPayload({ answers })));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('Missing answer');
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range answer index for a question', async () => {
    const answers = validAnswers();
    const q = MATCHMAKING_QUESTIONS[0];
    answers[q.id] = q.options.length; // one past the last valid index
    const { result } = renderHook(() => useSubmitMatchmaking('u1'), { wrapper: createWrapper() });

    act(() => result.current.mutate(validPayload({ answers })));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toContain('out of range');
  });

  it('invalidates the my-submission query for this user on success', async () => {
    mockSubmit.mockResolvedValue(undefined);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSubmitMatchmaking('u1'), { wrapper: createWrapper() });

    act(() => result.current.mutate(validPayload()));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['matchmaking', 'my-submission', 'u1'],
    });
  });
});
