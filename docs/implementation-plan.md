# AgentJourney Implementation Plan

All defined milestones are implemented and verified. Follow-up work should be driven by real source-format drift or user feedback rather than additional speculative scope.

## Milestone 1 — Walking skeleton ✅

- [x] pnpm workspace and strict TypeScript configuration
- [x] JSON Schema contract source plus generated TypeScript
- [x] deep Archive module with SQLite and content-addressed Source Bundle storage
- [x] Source Adapter interface and in-memory conformance harness
- [x] sanitized fixtures and parsers for Claude Code, Codex CLI, Pi, and standalone Copilot CLI
- [x] manual Discovery and Capture Cycle endpoints
- [x] per-candidate Discovery date, byte size, and optional Turn Count Estimate
- [x] authenticated loopback Fastify host
- [x] React/Vite Platform Shell
- [x] Journey library, detail view, renderer selector, and bundled source-native Style Packs
- [x] basic Review and manual Replay views
- [x] unit, integration, and browser tests

## Milestone 2 — Forensic completeness ✅

- [x] evidence inspector with virtualized source viewing and Evidence Search
- [x] revision and Interpretation selection/comparison
- [x] Pending Evidence preservation, retry, and deletion workflow
- [x] Sensitive Findings and non-destructive Presentation Redaction
- [x] logical Project management, Workspace evidence, and Review Overlays
- [x] evidence-anchored bookmarks and reviewer notes with orphan detection
- [x] Global Search filters for text, source, Activity kind, capability, Project, date, and Journey
- [x] in-Journey search highlighting
- [x] current, legacy, malformed, resumed, forked, streaming, and Agent Thread fixture coverage
- [x] private local compatibility checker that uploads nothing

## Milestone 3 — Replay ✅

- [x] production Terminal Replay Debugger selected from the captured three-variant prototype
- [x] source-native terminal transcript with Thread/Turn rail and Activity inspector
- [x] causal Activity Graph linearization with deterministic non-chronological tie breaking
- [x] provenance-aware evidenced and inferred Turns
- [x] selectable event-step, evidenced Recorded Streaming, and explicitly Simulated TUI Streaming modes
- [x] independent 0.5×–16× Streaming Speed and Timeline Speed controls
- [x] Delivery Trace capture and chunk-level Replay frames
- [x] Agent Thread preservation and multi-lane timeline
- [x] dynamic Fork lineage resolution
- [x] timed playhead, scrubbing, speed, and explicit idle-gap compression
- [x] labeled Source-Order Placement for untimed records inside timestamped sessions
- [x] manual-step-only behavior for wholly untimed evidence
- [x] full Fidelity Manifest and Coverage Report UI with evidence links

## Milestone 4 — Extension isolation ✅

- [x] inert, integrity-checked `.agentjourney-plugin` package loader
- [x] semantic interface compatibility negotiation
- [x] third-party Style Pack and executable Renderer Plugin installation
- [x] capability-free QuickJS renderer execution, validated declarative trees, opaque-origin iframe rendering, CSS confinement, and typed intents
- [x] package-local raster assets with bounded size and safe data URLs
- [x] restricted QuickJS Source Adapter runtime without Node, filesystem, process, environment, or network globals
- [x] separately approved Source Roots for installed adapters
- [x] local development-directory loading
- [x] plugin creation, packaging, validation, examples, and conformance suites

## Milestone 5 — Portability and lifecycle ✅

- [x] checksummed, data-only, lossless Journey Package export/import
- [x] imported Interpretation provenance and compatible local reinterpretation
- [x] sanitized self-contained HTML Presentation Export with no third-party executable code
- [x] archive object, Interpretation, permission, and search-index verification
- [x] search-index repair
- [x] explicit Retention Policies with physical unreferenced-object collection
- [x] delete-only and delete-with-Capture-Exclusion behavior
- [x] exclusion management and rediscovery
- [x] manual native raw-file/directory import
- [x] per-source manual or automatic Scan Policy, defaulting to manual
- [x] periodic batched automatic Capture Cycles with concurrent-cycle coalescing
- [x] SSE-driven browser refresh after archive changes

## Verification ✅

- [x] strict TypeScript checking
- [x] generated contract validation
- [x] unit and integration suite
- [x] Playwright browser workflow tests using sanitized data
- [x] production Web UI and host builds
- [x] local compatibility checks against all four installed Source Agents
- [x] GitHub Actions matrix for Linux, macOS, and native Windows, plus browser tests
