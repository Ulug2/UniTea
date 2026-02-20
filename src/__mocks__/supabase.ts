/**
 * Shared Supabase mock used across all tests.
 * Individual tests override specific methods using mockResolvedValueOnce / mockImplementationOnce.
 */

const mockQueryBuilder = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
  // Default terminal resolution — individual tests override this
  then: undefined as any,
};

// Make the builder thenable so "await supabase.from(...).select(...)" works
Object.defineProperty(mockQueryBuilder, 'then', {
  get() {
    return Promise.resolve({ data: [], error: null }).then.bind(
      Promise.resolve({ data: [], error: null })
    );
  },
});

export const mockFrom = jest.fn(() => mockQueryBuilder);

export const supabase = {
  from: mockFrom,
  auth: {
    getSession: jest.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    onAuthStateChange: jest.fn().mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  },
};

/** Helper: make supabase.from(table) resolve with specific data. */
export function mockSupabaseFrom(data: unknown[], error: unknown = null) {
  mockQueryBuilder.select.mockReturnThis();
  mockQueryBuilder.eq.mockReturnThis();
  mockQueryBuilder.in.mockReturnThis();
  mockQueryBuilder.or.mockReturnThis();
  mockQueryBuilder.order.mockReturnThis();
  mockQueryBuilder.range.mockReturnThis();
  mockQueryBuilder.not.mockReturnThis();
  mockQueryBuilder.maybeSingle.mockResolvedValue({ data: data[0] ?? null, error });

  // Make awaiting the builder itself resolve (for queries without .maybeSingle)
  mockFrom.mockImplementation(() => ({
    ...mockQueryBuilder,
    // Override the implicit await
    select: jest.fn().mockReturnValue({
      ...mockQueryBuilder,
      eq: jest.fn().mockReturnValue({
        ...mockQueryBuilder,
        // resolve the whole chain
        then: (resolve: any) =>
          Promise.resolve({ data, error }).then(resolve),
        maybeSingle: jest.fn().mockResolvedValue({ data: data[0] ?? null, error }),
      }),
      in: jest.fn().mockReturnValue({
        ...mockQueryBuilder,
        then: (resolve: any) =>
          Promise.resolve({ data, error }).then(resolve),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      ...mockQueryBuilder,
      eq: jest.fn().mockResolvedValue({ data: null, error }),
    }),
    update: jest.fn().mockReturnValue({
      ...mockQueryBuilder,
      eq: jest.fn().mockResolvedValue({ data: null, error }),
    }),
    upsert: jest.fn().mockResolvedValue({ data: null, error }),
  }));
}

/** Reset all mocks between tests. */
export function resetSupabaseMocks() {
  jest.clearAllMocks();
  mockFrom.mockReturnValue(mockQueryBuilder);
}
