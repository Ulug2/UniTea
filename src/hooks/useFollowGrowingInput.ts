import { useCallback, useMemo, useRef } from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  TextInputSelectionChangeEventData,
} from "react-native";
import { verticalScale } from "../utils/scaling";

const CARET_MARGIN = verticalScale(24);

/**
 * For a multiline TextInput that grows with its content inside a
 * ScrollView (instead of scrolling internally — nested scrolling breaks on
 * Android and with long pasted text): while the user types at the end of
 * the text, scroll just enough to keep the input's bottom (the caret) in
 * view. Editing in the middle of the text never moves the page.
 *
 * Wire-up: `scrollRef` + `scrollViewProps` on the ScrollView,
 * `sectionProps` on the input's direct-child section of the scroll
 * content, `inputProps` on the TextInput. `textLength` is the input's
 * current value length.
 */
export function useFollowGrowingInput(textLength: number) {
  const scrollRef = useRef<ScrollView>(null);
  const viewportHeight = useRef(0);
  const scrollOffset = useRef(0);
  const sectionY = useRef(0);
  const inputFrame = useRef({ y: 0, height: 0 });
  const isFocused = useRef(false);
  const caretAtEnd = useRef(true);
  const textLengthRef = useRef(textLength);
  textLengthRef.current = textLength;

  const followCaret = useCallback(() => {
    if (!isFocused.current || !caretAtEnd.current || viewportHeight.current <= 0) return;
    const caretBottom =
      sectionY.current + inputFrame.current.y + inputFrame.current.height + CARET_MARGIN;
    const visibleBottom = scrollOffset.current + viewportHeight.current;
    if (caretBottom > visibleBottom) {
      scrollRef.current?.scrollTo({ y: caretBottom - viewportHeight.current, animated: true });
    }
  }, []);

  const scrollViewProps = useMemo(
    () => ({
      onLayout: (e: LayoutChangeEvent) => {
        viewportHeight.current = e.nativeEvent.layout.height;
        followCaret();
      },
      onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        scrollOffset.current = e.nativeEvent.contentOffset.y;
      },
      scrollEventThrottle: 16,
    }),
    [followCaret],
  );

  const sectionProps = useMemo(
    () => ({
      onLayout: (e: LayoutChangeEvent) => {
        sectionY.current = e.nativeEvent.layout.y;
      },
    }),
    [],
  );

  const inputProps = useMemo(
    () => ({
      onLayout: (e: LayoutChangeEvent) => {
        const { y, height } = e.nativeEvent.layout;
        inputFrame.current = { y, height };
        followCaret();
      },
      onFocus: () => {
        isFocused.current = true;
      },
      onBlur: () => {
        isFocused.current = false;
      },
      onSelectionChange: (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        caretAtEnd.current = e.nativeEvent.selection.end >= textLengthRef.current;
      },
    }),
    [followCaret],
  );

  return { scrollRef, scrollViewProps, sectionProps, inputProps };
}
