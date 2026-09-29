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

  it('opens the URL', async () => {
    await openExternalLink(url);
    expect(Linking.openURL).toHaveBeenCalledWith(url);
  });

  it('still opens the URL when canOpenURL would report false (some Android devices)', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    await openExternalLink(url);
    expect(Linking.openURL).toHaveBeenCalledWith(url);
    expect(Linking.canOpenURL).not.toHaveBeenCalled();
  });

  it('throws a user-facing error when nothing can open the link', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('No Activity found to handle Intent'));
    await expect(openExternalLink(url)).rejects.toThrow('Unable to open link. Please try again later.');
  });
});
