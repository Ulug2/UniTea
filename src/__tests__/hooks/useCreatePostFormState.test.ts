import { renderHook, act } from '@testing-library/react-native';
import { useCreatePostFormState } from '../../hooks/useCreatePostFormState';

describe('useCreatePostFormState', () => {
  // ── initial state ────────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('returns correct defaults for a regular post', () => {
      const { result } = renderHook(() => useCreatePostFormState({ type: 'feed' }));

      expect(result.current.content).toBe('');
      expect(result.current.image).toBeNull();
      expect(result.current.isAnonymous).toBe(true);
      expect(result.current.isSubmitting).toBe(false);
      expect(result.current.isPoll).toBe(false);
      expect(result.current.pollOptions).toEqual(['', '']);
      expect(result.current.category).toBe('lost');
      expect(result.current.location).toBe('');
    });

    it('sets isLostFound=true when type is "lost_found"', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ type: 'lost_found' })
      );
      expect(result.current.isLostFound).toBe(true);
      expect(result.current.isRepost).toBe(false);
    });

    it('sets isRepost=true when repostId is provided', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ repostId: 'post-123' })
      );
      expect(result.current.isRepost).toBe(true);
      expect(result.current.isLostFound).toBe(false);
    });

    it('sets isRepost=true when repostId is a non-empty array', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ repostId: ['post-123'] })
      );
      expect(result.current.isRepost).toBe(true);
    });
  });

  // ── canSubmit — regular post ─────────────────────────────────────────────────
  describe('canSubmit — regular post', () => {
    it('is false when content is empty', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      expect(result.current.canSubmit).toBe(false);
    });

    it('is false when content is only whitespace', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      act(() => { result.current.setContent('   '); });
      expect(result.current.canSubmit).toBe(false);
    });

    it('is true when content has non-whitespace characters', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      act(() => { result.current.setContent('Hello world'); });
      expect(result.current.canSubmit).toBe(true);
    });
  });

  // ── canSubmit — lost & found ─────────────────────────────────────────────────
  describe('canSubmit — lost & found', () => {
    it('is false when content is set but location is empty', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ type: 'lost_found' })
      );
      act(() => { result.current.setContent('Lost my keys'); });
      expect(result.current.canSubmit).toBe(false);
    });

    it('is false when location is set but content is empty', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ type: 'lost_found' })
      );
      act(() => { result.current.setLocation('Library'); });
      expect(result.current.canSubmit).toBe(false);
    });

    it('is true when both content and location are non-empty', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ type: 'lost_found' })
      );
      act(() => {
        result.current.setContent('Lost my keys');
        result.current.setLocation('Library');
      });
      expect(result.current.canSubmit).toBe(true);
    });
  });

  // ── canSubmit — repost ───────────────────────────────────────────────────────
  describe('canSubmit — repost', () => {
    it('is false when content is empty and no image', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ repostId: 'post-abc' })
      );
      expect(result.current.canSubmit).toBe(false);
    });

    it('is true when content has text (no image)', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ repostId: 'post-abc' })
      );
      act(() => { result.current.setContent('My repost comment'); });
      expect(result.current.canSubmit).toBe(true);
    });

    it('is true when image is set and content is empty', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ repostId: 'post-abc' })
      );
      act(() => { result.current.setImage('file://photo.jpg'); });
      expect(result.current.canSubmit).toBe(true);
    });
  });

  // ── canSubmit — poll ─────────────────────────────────────────────────────────
  describe('canSubmit — poll', () => {
    it('is false when isPoll=true but all options are empty', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      act(() => { result.current.setIsPoll(true); });
      expect(result.current.canSubmit).toBe(false);
    });

    it('is true when isPoll=true and at least one option has text', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      act(() => {
        result.current.setIsPoll(true);
        result.current.setPollOptions(['Option A', '']);
      });
      expect(result.current.canSubmit).toBe(true);
    });

    it('ignores content when in poll mode', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      act(() => {
        result.current.setIsPoll(true);
        result.current.setContent('some content');
        result.current.setPollOptions(['', '']);
      });
      // hasPollContent is false even though content is set
      expect(result.current.canSubmit).toBe(false);
    });
  });

  // ── hasPollContent ───────────────────────────────────────────────────────────
  describe('hasPollContent', () => {
    // Note: hasPollContent is internal but affects canSubmit; test via canSubmit
    // We test setPollOptions directly here
    it('is false when all poll options are whitespace', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      act(() => {
        result.current.setIsPoll(true);
        result.current.setPollOptions(['  ', '   ']);
      });
      expect(result.current.canSubmit).toBe(false);
    });

    it('becomes true when any option is non-empty after trim', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      act(() => {
        result.current.setIsPoll(true);
        result.current.setPollOptions(['  ', 'Yes']);
      });
      expect(result.current.canSubmit).toBe(true);
    });
  });

  // ── reset ────────────────────────────────────────────────────────────────────
  describe('reset()', () => {
    it('resets all fields back to defaults', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));

      act(() => {
        result.current.setContent('Some text');
        result.current.setImage('file://img.jpg');
        result.current.setIsAnonymous(false);
        result.current.setIsSubmitting(true);
        result.current.setIsPoll(true);
        result.current.setPollOptions(['A', 'B', 'C']);
        result.current.setCategory('found');
        result.current.setLocation('Cafeteria');
      });

      act(() => { result.current.reset(); });

      expect(result.current.content).toBe('');
      expect(result.current.image).toBeNull();
      expect(result.current.isAnonymous).toBe(true);
      expect(result.current.isPoll).toBe(false);
      expect(result.current.pollOptions).toEqual(['', '']);
      expect(result.current.category).toBe('lost');
      expect(result.current.location).toBe('');
    });

    it('reset does NOT reset isSubmitting (not included in reset)', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      act(() => { result.current.setIsSubmitting(true); });
      act(() => { result.current.reset(); });
      // isSubmitting is intentionally not reset — caller controls it
      // This just documents current behaviour
      expect(result.current.isSubmitting).toBe(true);
    });
  });

  // ── setters are stable ───────────────────────────────────────────────────────
  describe('state updates reflect correctly', () => {
    it('updates category independently', () => {
      const { result } = renderHook(() =>
        useCreatePostFormState({ type: 'lost_found' })
      );
      act(() => { result.current.setCategory('found'); });
      expect(result.current.category).toBe('found');
    });

    it('updates isAnonymous', () => {
      const { result } = renderHook(() => useCreatePostFormState({}));
      act(() => { result.current.setIsAnonymous(false); });
      expect(result.current.isAnonymous).toBe(false);
    });
  });
});
