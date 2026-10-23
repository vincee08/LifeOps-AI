const mockSingle = jest.fn();
const mockEq = jest.fn(() => ({
  single: mockSingle,
  select: jest.fn(() => ({ single: mockSingle })),
}));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect, update: mockUpdate }));
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ from: mockFrom }) }));

import { isValidTimezone, loadProfile, updateProfile } from '@/features/settings/profile-service';

const profile = {
  id: 'owner',
  display_name: 'Alice',
  timezone: 'Asia/Manila',
  currency_code: 'PHP',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
};

beforeEach(() => jest.clearAllMocks());

describe('profile service', () => {
  it('loads the signed-in owner profile', async () => {
    mockSingle.mockResolvedValueOnce({ data: profile, error: null });
    await expect(loadProfile('owner')).resolves.toEqual(profile);
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockEq).toHaveBeenCalledWith('id', 'owner');
  });

  it('updates only editable fields and reports failed persistence', async () => {
    mockSingle.mockResolvedValueOnce({ data: profile, error: null });
    await updateProfile('owner', ' Alice ', 'Asia/Manila');
    expect(mockUpdate).toHaveBeenCalledWith({ display_name: 'Alice', timezone: 'Asia/Manila' });
    mockSingle.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(updateProfile('owner', 'Alice', 'Asia/Manila')).rejects.toThrow(
      'Profile could not be saved',
    );
  });

  it('rejects malformed timezone and overlong name before sending', async () => {
    expect(isValidTimezone('Asia/Manila')).toBe(true);
    expect(isValidTimezone('not/a-real-place')).toBe(false);
    await expect(updateProfile('owner', 'Alice', 'not/a-real-place')).rejects.toThrow();
    await expect(updateProfile('owner', 'a'.repeat(81), 'UTC')).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
