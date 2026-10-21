const mockPlatform = { OS: 'web' };
const mockAppState = { currentState: 'active', addEventListener: jest.fn() };
const mockAuth = { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() };

jest.mock('react-native', () => ({ Platform: mockPlatform, AppState: mockAppState }));
jest.mock('@/lib/environment', () => ({
  readSupabaseConfig: () => ({
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_example',
  }),
}));
jest.mock('@/lib/supabase-session-storage', () => ({ nativeSessionStorage: {} }));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ auth: mockAuth })),
}));

beforeEach(() => {
  mockPlatform.OS = 'web';
  mockAppState.currentState = 'active';
  jest.clearAllMocks();
});

describe('central Supabase client', () => {
  it('uses memory-only sessions in the web preview and initializes once', () => {
    jest.isolateModules(() => {
      const { createClient } = require('@supabase/supabase-js');
      const { getSupabaseClient } = require('@/lib/supabase');

      expect(getSupabaseClient()).toBe(getSupabaseClient());
      expect(createClient).toHaveBeenCalledTimes(1);
      expect(createClient).toHaveBeenCalledWith(
        'https://example.supabase.co',
        'sb_publishable_example',
        expect.objectContaining({
          auth: {
            storage: undefined,
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
        }),
      );
      expect(mockAppState.addEventListener).not.toHaveBeenCalled();
    });
  });

  it('uses encrypted native storage and refreshes only while active', () => {
    mockPlatform.OS = 'android';

    jest.isolateModules(() => {
      const { createClient } = require('@supabase/supabase-js');
      const { nativeSessionStorage } = require('@/lib/supabase-session-storage');
      const { getSupabaseClient } = require('@/lib/supabase');

      getSupabaseClient();
      expect(createClient).toHaveBeenCalledWith(
        'https://example.supabase.co',
        'sb_publishable_example',
        expect.objectContaining({
          auth: {
            storage: nativeSessionStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
          },
        }),
      );
      expect(mockAuth.startAutoRefresh).toHaveBeenCalledTimes(1);
      const onChange = mockAppState.addEventListener.mock.calls[0][1] as (state: string) => void;
      onChange('background');
      expect(mockAuth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
