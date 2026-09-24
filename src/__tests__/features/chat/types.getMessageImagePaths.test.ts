import { getMessageImagePaths } from '../../../features/chat/types';

describe('getMessageImagePaths', () => {
  it('returns image_urls when present (newer builds)', () => {
    expect(getMessageImagePaths({ image_url: 'a', image_urls: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('falls back to image_url for messages from older builds', () => {
    expect(getMessageImagePaths({ image_url: 'a', image_urls: null })).toEqual(['a']);
    expect(getMessageImagePaths({ image_url: 'a' })).toEqual(['a']);
  });

  it('treats an empty image_urls as absent', () => {
    expect(getMessageImagePaths({ image_url: 'a', image_urls: [] })).toEqual(['a']);
  });

  it('returns [] for text-only messages', () => {
    expect(getMessageImagePaths({ image_url: null, image_urls: null })).toEqual([]);
  });
});
