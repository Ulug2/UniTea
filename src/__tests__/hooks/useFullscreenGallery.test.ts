import { act, renderHook } from '@testing-library/react-native';
import { useFullscreenGallery } from '../../hooks/useFullscreenGallery';

describe('useFullscreenGallery', () => {
  it('starts hidden', () => {
    const { result } = renderHook(() => useFullscreenGallery());
    expect(result.current.modalProps).toEqual(
      expect.objectContaining({ visible: false, images: [], initialIndex: 0 }),
    );
  });

  it('opens at the tapped index with every URI, and closes', () => {
    const { result } = renderHook(() => useFullscreenGallery());
    act(() => result.current.open(['a', 'b', 'c'], 2));

    expect(result.current.modalProps.visible).toBe(true);
    expect(result.current.modalProps.images).toEqual([{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }]);
    expect(result.current.modalProps.initialIndex).toBe(2);

    act(() => result.current.modalProps.onClose());
    expect(result.current.modalProps.visible).toBe(false);
  });

  it('ignores an empty image list', () => {
    const { result } = renderHook(() => useFullscreenGallery());
    act(() => result.current.open([], 0));
    expect(result.current.modalProps.visible).toBe(false);
  });
});
