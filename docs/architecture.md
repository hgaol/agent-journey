# AgentJourney Architecture

## Modules and seams

```text
Native history files
       │ approved VirtualSource
       ▼
Source Adapter ── InterpretationDocument ──▶ Capture Coordinator
       │                                           │
       │ exact selected bytes                      │ validated Canonical Activity
       └───────────────────────────────┬───────────┘
                                       ▼
                              Journey Archive
                         SQLite + object store + FTS
                                       │
                      HTTP/JSON + SSE loopback seam
                                       ▼
                              Platform Shell
        library · Terminal Replay Debugger · evidence · lifecycle
                                       │ StageDocument
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
             Style Pack CSS                    QuickJS Renderer Plugin
                    │                              declarative tree
                    └──────────────────┬──────────────────┘
                                       ▼
                         trusted opaque-iframe renderer
```

### Archive module

The Archive interface owns Journey identity, immutable source revisions, versioned Interpretations, object durability, FTS indexes, Sensitive Findings, Review Overlays, Projects, Package portability, retention, exclusions, verification, and repair. Callers never address SQLite tables or object paths.

### Source Adapter seam

Four bundled adapters and sandboxed third-party adapters satisfy the same interface: Discovery over a constrained `VirtualSource`, then Interpretation over a selected `SourceBundleView`. Discovery may report an optional source-native Turn Count Estimate; the host enriches candidates with byte size and newest file modification time from `VirtualSource` metadata without interpreting or archiving them. The host—not the adapter—copies bytes into the Independent Archive. Every interpreted source record receives an Evidence Disposition.

Third-party JavaScript executes in QuickJS with bounded memory/time and no Node or browser capabilities. It receives only files inside an approved Source Root or explicit manual import.

### Renderer seam

Renderers receive only a selected, optionally redacted Stage Document. Review/Replay projection occurs before an executable plugin receives the document, so future Replay activity is absent rather than merely hidden.

CSS Style Packs use the trusted semantic renderer. Executable renderer JavaScript runs in QuickJS and returns a restricted, schema-validated declarative tree. Trusted code realizes the tree in an opaque-origin iframe; plugin JavaScript never receives DOM or navigation capabilities.

### Loopback seam

Fastify binds to `127.0.0.1`. A per-installation secret bootstraps an HTTP-only same-site cookie. Host/Origin validation, mutation CSRF tokens, authenticated SSE, and no wildcard CORS defend the unencrypted local archive from arbitrary web origins and DNS rebinding.

## Capture transaction

1. Discovery reports candidates without archiving content.
2. The user selects a Capture Scope, or an approved automatic Scan Policy starts a cycle.
3. Files are read without following symlinks and rejected if they change during the read.
4. Exact bytes are stored durably as content-addressed objects.
5. The adapter returns a schema-valid Interpretation and Coverage Report.
6. SQLite commits the Source Bundle manifest, Journey Revision, Interpretation, Activities, indexes, findings, and Source Provenance observation.
7. If interpretation fails after bytes are preserved, Pending Evidence is committed instead.
8. An SSE event refreshes browser queries.

Revision identity uses Source Agent + Native Session Identity for the Journey and a path-independent content multiset for the revision. Moved copies deduplicate. Append-compatible content creates a normal revision; incompatible divergence is flagged as an Identity Conflict.

## Terminal Replay Debugger

The production Journey route uses the terminal-native debugger layout chosen from prototype variant B: Thread and Turn rail, central source-styled terminal transcript, selected-Activity inspector, and multi-lane replay dock. The terminal is a semantic reconstruction, not a PTY emulator and not an agent-control surface.

## Replay model

Canonical Activities form a partially ordered graph. Source Order is deterministic within streams; causal links constrain tool results, parent activity, approvals, and thread relationships. A deterministic Display Order is derived without claiming unknown cross-thread chronology.

Turns are evidenced when native turn IDs exist and otherwise marked inferred. Delivery Trace chunks remain attached to one semantic Activity. Replay frames use evidenced timestamps/chunk offsets. Isolated untimed Activities within a timestamped stream use labeled Source-Order Placement; wholly untimed Interpretations permit manual stepping in evidence-based modes. The user may explicitly opt into Simulated Streaming, which creates deterministic character-reveal frames labeled `simulated` without changing Canonical Activity or the Fidelity Manifest. Review-to-Replay transition resets to frame zero, holds the first frame for 400 ms, auto-starts only when timing is safe, and recreates the Stage iframe so stale Review DOM cannot survive the transition. Streaming Speed scales only same-Activity chunk transitions and explicitly selected Simulated Prompt Typing; Timeline Speed separately scales inter-Activity timestamp gaps. Prompt draft frames omit the Human Input Activity from the projected Stage until a distinct submitted frame, then restore the immutable final input without changing Canonical Activity. Long idle intervals are visibly compressed. Remaining Replay Time sums the same scheduled delays used by playback, updates every 100 ms while running, reacts to Timeline/Cadence Speed changes, and remains unavailable when timing supports manual stepping only.

## Portability

Journey Packages carry data and checksums only. Imported Interpretation provenance remains external until a local adapter reproduces or replaces it. Presentation HTML receives a redacted Stage Document, escapes content, strips external CSS resources, omits plugin JavaScript, and uses only AgentJourney's fixed inline controls.

Replay Video Export reuses the trusted interactive Stage source from the Portability module. The host derives bounded Replay frames, renders them in Playwright Chromium, installed Chrome/Edge, or Playwright WebKit, and passes variable-duration images to local FFmpeg for H.264 MP4 encoding. Browser and encoder are local-substitutable dependencies behind one `ReplayVideoExporter` interface; the loopback route and tests use the same interface. A correlated authenticated SSE event reports preparing, frame-rendering, H.264 encoding, finalizing, completed, or failed progress while the POST remains the authoritative binary download.
