# Mobile Adaptation Feature Plan

This plan focuses on improving gameplay usability on narrow screens while preserving desktop behavior.

| Priority | Feature | Status | Description |
| --- | --- | --- | --- |
| P0 | Tap/Click Letter Entry + Explicit Submit Control | Completed | - Make each hex on the letter board interactive (`button`/pointer-enabled target) so letters can be entered by tap (mobile) and click (desktop).<br>- Keep the existing keyboard flow, but add always-visible board controls (`Submit`, `Delete`, `Shuffle`) so mobile users are not blocked by hidden form submit behavior. |
| P0 | Mobile Layout Order for Core Gameplay | Completed | - On small breakpoints, reorder content so `Found Words` appears immediately below the board, with hints below that.<br>- Move `Sessions` out of the main gameplay flow on mobile (separate screen/drawer/modal) to keep active play area focused. |
| P0 | Compact Top Bar for Small Screens | Not started | - Reduce vertical stacking in the header by collapsing actions into a compact row/menu and shortening seed controls by default.<br>- Keep brand + key action visible without pushing the board too far below the fold. |
| P1 | Sticky/Reachable Input Actions | Not started | - Keep primary play actions (letter board + submit/delete/shuffle) within thumb reach by using a sticky action row near the bottom on mobile.<br>- Prevent key controls from disappearing when content above grows (feedback, rank panel, lists). |
| P1 | Responsive Status Panel Simplification | Not started | - Replace the full rank track on very narrow screens with a condensed summary (current rank + points to next) to reduce height and visual density.<br>- Preserve full rank track for tablet/desktop where horizontal space is available. |
| P1 | Better Scroll and Panel Height Strategy | Not started | - Replace fixed list heights with viewport-aware max heights (using dynamic viewport units) so lists don’t compete with board visibility.<br>- Keep a single primary scroll region during gameplay to reduce jumpy vertical navigation on mobile. |
| P1 | Touch Target and Interaction Ergonomics | Not started | - Enforce minimum 44x44 px hit areas for interactive controls (hexes, session items, buttons) and add pressed/active states for touch feedback.<br>- Add `touch-action` and pointer affordances where useful to reduce accidental zoom/selection behavior. |
| P2 | Mobile-Friendly Sessions Management UX | Not started | - Add a dedicated `Sessions` view with compact cards and clear metadata (source, puzzle id/date, rank, score, updated time).<br>- Add a lightweight entry point from top bar or overflow menu so session switching remains accessible but secondary. |
| P2 | Input Mode and Keyboard Hints | Not started | - Set input attributes for mobile keyboards (`autocapitalize="off"`, `autocomplete="off"`, `inputmode="text"`) and preserve lowercase normalization.<br>- Keep focus behavior predictable after submissions and board taps to prevent keyboard flicker. |
| P2 | Mobile-Specific Accessibility and Safe Areas | Not started | - Improve semantics for interactive board letters (`aria-label`, focus order, keyboard activation parity).<br>- Respect safe-area insets and test portrait/landscape to avoid clipped controls on notched devices. |
| P2 | Performance/Polish on Constrained Devices | Not started | - Reduce costly visual effects/animations on small devices and honor reduced-motion preferences consistently.<br>- Minimize reflows on frequent updates (word list/rank feedback) so input remains responsive on lower-end phones. |

## Suggested Delivery Order

1. P0: Tap/click entry + visible mobile controls + mobile layout reorder + compact top bar.
2. P1: Sticky actions, status panel simplification, scroll/list sizing, touch target ergonomics.
3. P2: Sessions dedicated view, input/keyboard tuning, accessibility-safe area refinements, performance polish.

## Notes From Current Code Scan

- The current form submit button is hidden by CSS (`.word-form button { display: none; }`), which hurts touch-first play.
- The letter board component currently renders static SVG polygons/text with no click/tap interaction handlers.
- At `max-width: 900px`, layout collapses to one column, but `Sessions` remains above `Found Words` because of DOM order.
- Header actions wrap and can become tall on mobile due to the seed form and action grouping.
