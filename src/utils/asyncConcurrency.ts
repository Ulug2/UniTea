export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let firstError: unknown = null;

  const worker = async () => {
    while (true) {
      if (firstError) return;
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;

      try {
        results[current] = await mapper(items[current], current);
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
