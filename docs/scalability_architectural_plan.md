# Feed Scalability Architecture Plan

## Overview

The feed system currently uses a **persistent mounted feed architecture** to provide a smooth user experience when switching between Campus Feed and Community Feeds.

The main goals are:

- Keep already visited feeds responsive.
- Preserve loaded images and scroll state when switching feeds.
- Avoid unnecessary re-renders.
- Prevent future memory/performance issues as users visit many communities.

This document describes the current architecture and the planned scalability improvements.

---

# Current Architecture

## Feed Mounting Strategy

The app maintains visited feeds in memory during the current session.

Example:

A user visits:

```
Campus Feed
        ↓
Computer Science Community
        ↓
Sports Community
        ↓
Gaming Community
```

The app keeps these feeds mounted:

```
Mounted Feeds:

Campus Feed
Computer Science Community
Sports Community
Gaming Community
```

Inactive feeds are hidden using:

```ts
opacity: 0
pointerEvents: "none"
```

instead of:

```ts
display: "none"
```

---

## Why opacity:0 Is Used

Previously, inactive community feeds used:

```ts
display: "none"
```

This caused native layout removal.

Result:

- Feed components remained mounted in React.
- But native views could lose their layout state.
- Image components could lose their decoded image state.
- Returning to a feed could show a placeholder/image reload flash.

Hot / Recent / Top switching did not have this issue because those feeds stayed inside the same horizontal pager layout.

The new approach keeps inactive feeds alive:

```
Active Feed
    ↓
Fully mounted

Inactive Feed
    ↓
Still mounted
Still has layout
Still keeps images
Not interactive
Invisible
```

This provides the same persistence behavior users expect from feed switching.

---

# Current Performance Optimizations

## Component Render Isolation

A feed screen can contain multiple mounted community feeds.

Without protection:

```
FeedScreen update
        ↓
Every CommunityFeedPager rerenders
        ↓
Every feed subtree recalculates
```

This creates unnecessary work.

The current architecture uses:

```tsx
React.memo(CommunityFeedPager)
```

to create a render boundary:

```
FeedScreen update
        ↓
Only feeds with changed props rerender
```

This keeps unrelated communities isolated.

---

# Current Bug Fixes Completed

## Post Creation Freeze Fix

The previous freeze after posting was caused by a native modal presentation conflict.

Flow before fix:

```
Create Post fullScreenModal
        ↓
Post submitted
        ↓
Mutation waits for success
        ↓
Parent tab screen tries to show loading modal
        ↓
iOS modal stack conflict
        ↓
Frozen UI
```

The solution:

- Remove the parent-level post creation loading overlay.
- Keep loading state inside the Create Post screen.
- Let the screen that owns the mutation own the loading UI.

Result:

- Posting works.
- Feed remains responsive.
- Navigation remains stable.

---

# Future Scalability Problem

The current architecture intentionally prioritizes smooth switching.

However, there is a future limitation:

## Unlimited Mounted Communities

Currently:

```
User visits 1 community
        ↓
1 feed stays mounted

User visits 20 communities
        ↓
20 feeds stay mounted
```

Each mounted feed can hold:

- FlatList state
- React Query cache references
- image views
- decoded image memory
- component state

For normal usage this is acceptable.

For extreme sessions, memory usage may increase.

---

# Phase B: Bounded Feed Persistence (Future)

Phase B is not currently required.

It should only be implemented if real usage shows:

- memory pressure
- slow scrolling after many communities
- crashes on lower-end devices
- degraded performance after long sessions

The goal:

Maintain the benefits of persistence while introducing controlled cleanup.

---

# Proposed Future Strategy

## Keep Recently Used Feeds Alive

Instead of:

```
Keep everything forever
```

Use:

```
Keep active feed
+
recently visited feeds
+
prefetch priority feeds
```

Example:

Maximum mounted feeds:

```
Current feed:
Campus

Recently visited:
Community A
Community B

Evict:
Community C
Community D
Community E
```

---

# Possible Eviction Rules

Future implementation could track:

```ts
{
  feedKey,
  lastVisitedAt,
  scrollPosition,
  cacheState
}
```

When the limit is exceeded:

1. Find least recently used inactive feed.
2. Remove it from mounted feeds.
3. Keep React Query cache.
4. Preserve enough state to restore quickly.

Example:

Before:

```
Mounted:
Campus
Engineering
Sports
Gaming
Music
Art
```

After cleanup:

```
Mounted:
Campus
Engineering
Sports

Cached:
Gaming
Music
Art
```

---

# Important Design Principle

The goal is NOT:

"Unmount everything for memory."

The goal is:

"Keep the feeds users are likely to return to alive, while safely cleaning up inactive feeds."

---

# Non-Goals

The following should not be introduced unless a real problem appears:

- Complete feed architecture rewrite.
- Removing persistent feeds.
- Aggressive unmounting.
- Replacing React Query caching.
- Custom image caching system.
- Removing image persistence behavior.

---

# Current Recommended Architecture

```
                    FeedScreen

                         |
        ---------------------------------
        |               |               |
    Campus Feed     Community A     Community B

        |               |               |
    memoized        memoized        memoized

        |
 opacity:0 inactive feeds
 keep layout
 keep images
 keep state
```

---

# Decision Summary

Current approach:

✅ Persistent feed switching  
✅ No image reload flash  
✅ Better render isolation  
✅ Stable post creation flow  
✅ Minimal complexity  

Future Phase B:

⏳ Only implement when real scalability data shows a need.

The current architecture optimizes for user experience first while leaving a clear path toward bounded resource management.