jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));

import { supabase } from '../../lib/supabase';
import { logActivity as logActivityWeb } from '../../utils/activityLogger.web';
import { logActivity as logActivityNative } from '../../utils/activityLogger';

const mockFrom = supabase.from as jest.Mock;

describe('activityLogger web fallback (post card preview)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockFrom.mockReturnValue({ insert: jest.fn().mockResolvedValue({ error: null }) });
  });

  it('web: never writes user_activity_events', () => {
    logActivityWeb('session_start', 'uni-1', 'user-1');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('native: still logs (control)', () => {
    logActivityNative('session_start', 'uni-1', 'user-1');
    expect(mockFrom).toHaveBeenCalledWith('user_activity_events');
  });
});
