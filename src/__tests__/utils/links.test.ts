/**
 * Tests for src/utils/links.ts
 */

import { Linking } from 'react-native';
import { openExternalLink } from '../../utils/links';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('openExternalLink', () => {
  const url = 'https://example.com';

  it('calls openURL with the correct URL when canOpenURL resolves true', async () => {
    await openExternalLink(url);
    expect(Linking.openURL).toHaveBeenCalledWith(url);
  });

  it('throws "Unable to open link" when canOpenURL resolves false', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    await expect(openExternalLink(url)).rejects.toThrow('Unable to open link');
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('propagates errors when canOpenURL rejects', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockRejectedValue(new Error('OS error'));
    await expect(openExternalLink(url)).rejects.toThrow('OS error');
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('propagates errors when openURL rejects', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('open failed'));
    await expect(openExternalLink(url)).rejects.toThrow('open failed');
  });
});
