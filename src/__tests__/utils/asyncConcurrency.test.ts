/**
 * Tests for src/utils/asyncConcurrency.ts
 */
import { mapWithConcurrency } from '../../utils/asyncConcurrency';

describe('mapWithConcurrency', () => {
  it('returns an empty array for no items and never calls the mapper', async () => {
    const mapper = jest.fn();
    const result = await mapWithConcurrency([], 3, mapper);
    expect(result).toEqual([]);
    expect(mapper).not.toHaveBeenCalled();
  });

  it('maps every item and preserves original order regardless of resolution order', async () => {
    const mapper = (item: number) =>
      new Promise<number>((resolve) =>
        setTimeout(() => resolve(item * 10), item % 2 === 0 ? 5 : 1),
      );
    const result = await mapWithConcurrency([1, 2, 3, 4], 2, mapper);
    expect(result).toEqual([10, 20, 30, 40]);
  });

  it('never runs more than `concurrency` mappers at once', async () => {
    let active = 0;
    let maxActive = 0;
    const mapper = async (item: number) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return item;
    };
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, mapper);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('rejects with the first error and stops issuing new work', async () => {
    const mapper = jest.fn(async (item: number) => {
      if (item === 2) throw new Error('item 2 failed');
      return item;
    });
    await expect(mapWithConcurrency([1, 2, 3], 1, mapper)).rejects.toThrow(
      'item 2 failed',
    );
  });

  // ── onItemComplete (Phase 7.5 — post creation progress UI) ──────────────

  it('is fully backward compatible: omitting onItemComplete changes nothing', async () => {
    const result = await mapWithConcurrency([1, 2, 3], 3, async (n) => n * 2);
    expect(result).toEqual([2, 4, 6]);
  });

  it('fires onItemComplete once per successfully completed item, with a running count and the fixed total', async () => {
    const calls: Array<[number, number]> = [];
    await mapWithConcurrency(
      ['a', 'b', 'c', 'd', 'e'],
      3,
      async (item) => item,
      (completed, total) => calls.push([completed, total]),
    );

    expect(calls).toHaveLength(5);
    // Every call reports the same total.
    expect(calls.every(([, total]) => total === 5)).toBe(true);
    // Completed counts are strictly increasing 1..5 (workers append as each
    // resolves; concurrency doesn't change that the count only ever grows).
    const counts = calls.map(([completed]) => completed);
    expect(counts).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not fire onItemComplete for a failed item, and stops calling it once an error occurs', async () => {
    const calls: Array<[number, number]> = [];
    const mapper = async (item: number) => {
      if (item === 3) throw new Error('boom');
      return item;
    };

    await expect(
      mapWithConcurrency([1, 2, 3, 4], 1, mapper, (completed, total) =>
        calls.push([completed, total]),
      ),
    ).rejects.toThrow('boom');

    // Only items 1 and 2 (processed before the failure, concurrency=1)
    // ever completed successfully.
    expect(calls).toEqual([
      [1, 4],
      [2, 4],
    ]);
  });

  it('reports the correct total for a single-item call', async () => {
    const calls: Array<[number, number]> = [];
    await mapWithConcurrency(['only'], 3, async (item) => item, (completed, total) =>
      calls.push([completed, total]),
    );
    expect(calls).toEqual([[1, 1]]);
  });
});
