import { act, renderHook } from '@testing-library/react-native';
import { useFollowGrowingInput } from '../../hooks/useFollowGrowingInput';
import { verticalScale } from '../../utils/scaling';

const layout = (y: number, height: number) => ({ nativeEvent: { layout: { x: 0, y, width: 300, height } } }) as any;
const scroll = (y: number) => ({ nativeEvent: { contentOffset: { x: 0, y } } }) as any;
const selection = (end: number) => ({ nativeEvent: { selection: { start: end, end } } }) as any;

function setup(textLength = 100) {
  const hook = renderHook(({ len }) => useFollowGrowingInput(len), { initialProps: { len: textLength } });
  const scrollTo = jest.fn();
  (hook.result.current.scrollRef as any).current = { scrollTo };
  const h = hook.result.current;
  act(() => {
    h.scrollViewProps.onLayout(layout(0, 500)); // viewport 500 tall
    h.sectionProps.onLayout(layout(200, 0)); // input section at y=200 in the scroll content
    h.inputProps.onFocus();
  });
  return { h, scrollTo };
}

it('scrolls to keep the caret visible when the input grows past the viewport while typing at the end', () => {
  const { h, scrollTo } = setup();
  act(() => {
    h.inputProps.onSelectionChange(selection(100));
    h.inputProps.onLayout(layout(30, 400)); // bottom = 200 + 30 + 400 = 630 > 500
  });
  expect(scrollTo).toHaveBeenCalledWith({ y: 630 + verticalScale(24) - 500, animated: true });
});

it('does nothing while the input still fits', () => {
  const { h, scrollTo } = setup();
  act(() => h.inputProps.onLayout(layout(30, 100)));
  expect(scrollTo).not.toHaveBeenCalled();
});

it('does not move the page when editing in the middle of the text', () => {
  const { h, scrollTo } = setup(100);
  act(() => {
    h.inputProps.onSelectionChange(selection(40));
    h.inputProps.onLayout(layout(30, 400));
  });
  expect(scrollTo).not.toHaveBeenCalled();
});

it('does not scroll when the input is not focused', () => {
  const { h, scrollTo } = setup();
  act(() => {
    h.inputProps.onBlur();
    h.inputProps.onLayout(layout(30, 400));
  });
  expect(scrollTo).not.toHaveBeenCalled();
});

it('accounts for how far the user already scrolled', () => {
  const { h, scrollTo } = setup();
  act(() => {
    h.scrollViewProps.onScroll(scroll(200)); // visible bottom = 700
    h.inputProps.onLayout(layout(30, 400)); // caret bottom 630 + margin: still visible
  });
  expect(scrollTo).not.toHaveBeenCalled();
});
