# Astryx adoption assessment

## Question

Should AgentJourney use Meta's Astryx React design system?

## Finding

Adopt Astryx only experimentally for selected **Platform Shell** controls. Do not use Astryx Chat components for the Journey Stage, replay scheduler, or source-native renderers, and do not migrate the application wholesale.

## What Astryx provides

- Astryx is MIT-licensed, currently beta, and publishes React 19+ components under `@astryxdesign/core` ([project README](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/README.md), [license](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/LICENSE)).
- Consumers can import precompiled CSS and do not need the StyleX build plugin. Components accept `className` and ordinary CSS overrides even though Astryx authors its internals with StyleX ([core quick start](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/README.md#quick-start), [styling guide](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/cli/assets/docs/styling.doc.mjs)). This does not require a Tailwind migration.
- The published core package has subpath exports and declares component CSS as side-effectful, permitting JavaScript tree-shaking. Version 0.5.2 is approximately 18.5 MB unpacked; its complete precompiled component stylesheet is approximately 158 KB raw / 28 KB gzip ([core package](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/package.json), [npm package](https://www.npmjs.com/package/@astryxdesign/core/v/0.5.2)).

## Why the Chat components do not own Replay

- `ChatComposer` is an active-input component whose required contract is `onSubmit`, with optional send/stop behavior. AgentJourney Replay is deliberately read-only, including its simulated composer ([ChatComposer docs](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/src/Chat/ChatComposer.doc.mjs), [implementation](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/src/Chat/ChatComposer.tsx)).
- `ChatLayout` owns a conventional chat layout with a sticky/fixed frosted composer dock and spring auto-scroll. AgentJourney owns a terminal-native debugger layout and deterministic Playhead behavior instead ([ChatLayout docs](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/src/Chat/ChatLayout.doc.mjs), [implementation](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/src/Chat/ChatLayout.tsx)).
- `ChatMessageList` renders all supplied children; its infinite-scroll support does not virtualize a large existing transcript. Replacing AgentJourney's Stage with it would not solve large-Journey rendering by itself ([ChatMessageList implementation](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/src/Chat/ChatMessageList.tsx)).
- `useStreamingText` exposes only `natural`, `fast`, and `instant` presentation presets, derives cadence from theme motion, and snaps to complete text when streaming ends or reduced motion is enabled. It does not represent evidenced Delivery Trace timing, independent 0.5×–16× Replay speed, or AgentJourney's deadline schedule ([hook docs](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/src/hooks/useStreamingText.doc.mjs), [implementation](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/src/hooks/useStreamingText.ts)).
- Astryx's `ChatPastedTextToken` is useful design reference for summarizing editable pasted material, but AgentJourney must preserve and replay source-native composer presentation rather than introduce a generic badge into every source TUI ([ChatPastedTextToken](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/core/src/Chat/ChatPastedTextToken.tsx)).

## Suitable AgentJourney seam

A narrow Platform Shell trial could use accessible interaction primitives where source-native styling is irrelevant, such as:

- `Dialog` / `AlertDialog` for archive confirmations and editors;
- `Toast` for local operation outcomes;
- form controls in Settings or Sources;
- possibly `Tooltip`, after browser-positioning coverage.

The Journey Stage must remain outside the Astryx Theme and CSS surface. Renderer plugins still execute through the validated renderer contract and render inside the isolated Stage. MP4 and HTML Presentation Exports must remain independent of Astryx.

Astryx relies on modern Popover, CSS anchor positioning, and `light-dark()` features. Its own support guide says layered controls may be functionally usable but incorrectly positioned in its Tier 2 browser range, so any AgentJourney adoption of menus, tooltips, selectors, or popovers needs the existing Chromium/WebKit viewport matrix ([browser support](https://github.com/facebook/astryx/blob/f0c15b1d5e97fb2420f42dc4df83341a84cda324/packages/cli/assets/docs/browser-support.doc.mjs)).

## Recommended trial

1. Prototype one low-risk shell dialog, preferably Annotation or MP4 Export, on a temporary branch.
2. Import `reset.css`, `astryx.css`, and a pinned neutral theme only in the Web application. Do not add a StyleX build plugin and do not load remote webfonts.
3. Preserve the current dialog's behavior and terminal-shell visual hierarchy through scoped token and plain-CSS overrides.
4. Measure production JavaScript/CSS size, first-load time, focus behavior, and narrow/medium/wide screenshots before and after.
5. Verify that all source-native Stage screenshots are byte/pixel unchanged and that no Astryx styles enter exported HTML or MP4 frames.
6. Keep the dependency only if it removes meaningful local interaction/accessibility code without forcing broad visual or architectural changes.
