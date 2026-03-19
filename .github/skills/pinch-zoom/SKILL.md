---
name: pinch-zoom
description: "Use when implementing or fixing pinch-to-zoom interactions in React Native image modals, including reliable slow/fast two-finger pinch detection and optional one-finger pan while zoomed."
---

# Pinch Zoom Skill

## Use This Skill For
- Pinch-to-zoom that works for slow and fast gestures.
- Optional one-finger panning while zoomed.

## Current Implementation References
- Core fullscreen interaction component:
  - src/components/FullscreenImageModal.tsx
- Chat wrapper reusing shared modal:
  - src/features/chat/components/FullscreenImageModal.tsx

## Implementation Pattern
1. Track gesture state using Animated values:
- scaleAnim, translateXAnim, translateYAnim

2. Track runtime refs to avoid lag and stale state:
- currentScale/currentTranslateX/currentTranslateY
- baseScale/baseTranslateX/baseTranslateY
- pinchStartDistance/pinchStartCenter
- lastTouchCount to handle non-simultaneous finger landing

3. Gesture rules:
- 2 touches: pinch zoom + move center
- transition 1 -> 2 touches: re-anchor pinch baseline immediately
- transition 2 -> 1 touches: re-anchor drag baseline
- 1 touch while zoomed (> 1.01): pan image
- 1 touch at base zoom: no pinch action

## Performance Notes
- Keep useNativeDriver: true on transforms and opacity.
- Avoid expensive computations inside onPanResponderMove.

## Troubleshooting Checklist
- Pinch inconsistent:
  - verify onPanResponderStart + onPanResponderMove both re-anchor when touchCount changes to 2.
  - ensure onPanResponderTerminationRequest returns false.
- Pinch only works on fast gestures:
  - ensure transition 1 -> 2 touches re-anchors pinchStartDistance and pinchStartCenter.
  - verify lastTouchCount updates on every move/start callback.

## Reuse Contract
- Fullscreen modal should accept:
  - visible: boolean
  - uri: string | null
  - onClose: () => void
- Modal gesture layer should provide:
  - two-finger pinch zoom with clamped scale
  - one-finger pan while scale > 1
