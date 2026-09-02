# AgentJourney Product Spec

## Purpose

AgentJourney is a local-only, read-only platform for discovering, preserving, searching, reviewing, and replaying histories produced by coding agents. It never launches, wraps, intercepts, or controls an agent.

The first user is a developer who uses multiple terminal coding agents and needs to reconstruct what happened: prompts, context, reasoning, tools, edits, approvals, failures, subagents, state changes, and outcomes.

## Initial source agents

- Claude Code
- OpenAI Codex CLI
- Pi
- Standalone GitHub Copilot CLI (`copilot`)

macOS, Linux, native Windows, and WSL are development targets. The project currently runs from source with pnpm; release packaging is out of scope.

## Product invariants

1. Source-agent files are read-only inputs.
2. Capture is passive and requires an approved Source Root and Capture Scope.
3. Manual scanning is the default; automatic rescanning is optional.
4. Every capture preserves an exact Source Bundle in an Independent Archive.
5. A source change creates an immutable Journey Revision; an adapter change creates a separate Interpretation.
6. Canonical Activity never replaces Source Evidence.
7. Unknown source records are visible and receive an Evidence Disposition; nothing is silently dropped.
8. A Journey is one logical, non-branching conversation. Forks are linked Journeys; delegated subagents are nested Agent Threads.
9. Activities form a partially ordered causal graph. Flat transcripts, Turns, and timelines are derived views.
10. Review Overlays may add titles, tags, Projects, bookmarks, and notes but never modify evidence.
11. Source Agent, Model Provider, and Model are independent metadata dimensions.
12. Renderer Plugins alter presentation only. They never access Source Evidence or archive internals.
13. The default renderer follows the Source Agent; any installed renderer can present any Journey using Neutral Fallback for unsupported activity.
14. Local Custody forbids accounts, cloud sync, telemetry, and hosted ingestion.
15. The archive is unencrypted and relies on host-account and operating-system protection.

## Views

### Terminal Replay Debugger

The Journey workspace mimics a coding-agent terminal rather than a dashboard or chat application: terminal transcript in the center, Thread and Turn navigation on the left, Activity evidence inspection on the right, and a timestamp-driven replay dock below. The selected Source-Native Renderer controls terminal vocabulary and visual treatment.

### Review View

The default mode exposes the complete selected Journey Revision and Interpretation immediately inside the terminal transcript, with search, evidence links, Coverage Report, Fidelity Manifest, revision selection, and Review Overlays.

### Replay View

Replay progressively reveals terminal behavior through a Playhead. Prompt, reasoning, Delivery Trace chunks, tool start/result, state transitions, and Agent Threads appear according to evidenced timestamps. Parallel thread lanes remain visible and long idle gaps are compressed explicitly rather than inventing timing.

### Evidence inspector

The Platform Shell can inspect exact Source Evidence for a selected revision. Raw evidence remains outside Renderer Plugins and outside Global Search.

## Rendering

The Platform Shell remains stable. Renderer Plugins own only the Journey Stage. Built-in and third-party renderers use the same versioned interface. A Style Pack is a CSS-focused renderer; complex renderers may use precompiled sandboxed JavaScript authored in TypeScript.

Renderer code runs in capability-free QuickJS and returns a validated declarative render tree. Trusted AgentJourney code realizes that tree in an opaque-origin iframe with scoped CSS; plugin code has no browser DOM, network, filesystem, archive-wide, browser-storage, or Platform Shell access. Renderer packages are inert and locally installed; there is no marketplace.

## Source adapters

Source Adapter Plugins discover and interpret source histories through a separately permissioned interface. They are authored in TypeScript, distributed as dependency-bundled JavaScript, and run in a restricted non-Node sandbox with virtual read-only access to granted roots. The host module—not the adapter—creates Source Bundles and commits Capture Cycles.

## Storage and search

A deep Archive module hides:

- SQLite for identities, revisions, Interpretations, Activity Graphs, metadata, overlays, settings, and lexical full-text indexes.
- A compressed content-addressed object store for exact source bytes and large Artifacts.

Global Search indexes Canonical Activity and metadata, not arbitrary raw bytes. Evidence Search is scoped to a selected Source Bundle. Semantic search and model-generated summaries are out of scope initially.

## Portability

- `.agentjourney` Journey Packages are checksummed, lossless, unencrypted, data-only, and re-importable.
- HTML Presentation Exports are derived, redacted by default, contain no third-party executable code, and are not evidence packages.

## Implementation status

The defined platform scope is implemented: four built-in adapters, raw-file and approved-root capture, immutable revisions and Interpretations, forensic evidence and redaction views, Review Overlays and Projects, filtered search, causal Replay with Turns/Delivery Traces/Agent Thread lanes, sandboxed third-party adapters and renderers, Journey Packages, sanitized HTML exports, retention/exclusion lifecycle, automatic Scan Policies, verification/repair, and source/build/browser test suites. See [`implementation-plan.md`](implementation-plan.md) for the completed checklist.
