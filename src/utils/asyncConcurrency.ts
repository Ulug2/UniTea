/**
 * @param onItemComplete Optional. Fires after each item successfully
 * resolves (never on failure), with the running completed count and the
 * total item count — e.g. for driving "Uploading images (3/5)"-style
 * progress text. Backward compatible: omitting it changes nothing about
 * existing behavior or callers.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onItemComplete?: (completedCount: number, total: number) => void,
): Promise<R[]> {
  if (items.length === 0) return [];

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let completedCount = 0;
  let firstError: unknown = null;

  const worker = async () => {
    while (true) {
      if (firstError) return;
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;

      try {
        results[current] = await mapper(items[current], current);
        completedCount += 1;
        onItemComplete?.(completedCount, items.length);
      } catch (error) {
        firstError = error;
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (firstError) throw firstError;
  return results;
}
