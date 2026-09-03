# Using AgentJourney

## Start

```bash
pnpm install
pnpm dev
```

Open <http://127.0.0.1:4317/> rather than the Vite port directly. The host establishes the authenticated local browser session and redirects to the Platform Shell.

## Sources

AgentJourney suggests native history roots for Claude Code, Codex CLI, Pi, and standalone GitHub Copilot CLI. Detection does not archive content.

For each source:

1. Approve the exact Source Root.
2. Preview Discovery results, including each candidate's session date, source size, and estimated turns when the adapter can establish them.
3. Select individual native sessions as the Capture Scope.
4. Capture selected sessions.
5. Optionally switch the root from manual to automatic scanning.

The raw-import controls accept files or directories without creating a persistent Source Root grant.

## Journey library

Global Search supports:

- ordinary lexical terms;
- quoted phrases, such as `"cache invalidation"`;
- explicit prefixes, such as `auth*`;
- Source Agent, Activity kind, Tool Capability, Project, and date filters.

Search indexes Canonical Activity, not arbitrary Source Bundle bytes. Exact Evidence Search is available inside a Journey.

## Journey review

A Journey opens as a Terminal Replay Debugger. The center pane is the source-styled terminal transcript; the left rail navigates Agent Threads, Turns, revisions, and Interpretations; the right rail inspects the selected Activity and opens exact evidence; the bottom dock controls timestamp-driven Replay.

The workspace identifies Source Agent, agent version, Model Provider, Model, Git branch, Native Session Identity, Journey Revision, and Interpretation. Unknown metadata remains unknown rather than being inferred.

Use:

- **Renderer** to apply any built-in or installed presentation.
- **Revision / Interpretation** to revisit or compare historical evidence and interpretations.
- **Find in Journey** to highlight canonical text.
- **Evidence** to inspect exact archived files.
- **Edit overlay** to set a title, tags, and logical Project.
- Activity stars inside the Journey Stage to create evidence-anchored bookmarks and notes.
- **Fidelity manifest** to inspect Coverage Reports, known gaps, and unclassified records.

Sensitive Findings are masked by default. Reveal actions are local and explicit; they do not make the unencrypted archive safer at rest.

## Replay

Replay uses the Activity Graph rather than inventing a flat chronology. Prompts, reasoning, tool calls/results, status transitions, and Delivery Trace chunks appear in the terminal pane as their frames are reached. The timeline shows one lane per Agent Thread, and long idle gaps are visibly compressed.

The **Content streaming** selector offers:

- **Event steps** — each semantic Activity appears as one unit at its evidenced timestamp.
- **Recorded stream** — available only when the Fidelity Manifest reports Delivery Traces; preserved chunks appear in recorded order and timing.
- **Simulated TUI stream** — opt-in fast sixteen-character streaming for agent output and reasoning when native chunks were not persisted. The dock displays `SIMULATED cadence`; this is presentation only and does not become Source Evidence.

Recorded and simulated modes expose a separate **Streaming speed** selector from 0.5× through 16×. It changes only chunk transitions within the current response; the **Timeline speed** selector independently controls timestamp gaps between Activities.

When a session contains timestamps plus occasional untimed control records, Replay places those records by evidenced Source Order and labels the dock `untimed · source-order placement`; no timestamp is inferred. A wholly untimed session remains manual-step-only in event and recorded modes. Simulated mode may autoplay because the user explicitly requested synthetic presentation.

## Export and import

- **Package** exports lossless `.agentjourney` evidence. Confirm the warning: the package is unencrypted and may contain secrets.
- **HTML** exports escaped, self-contained presentation using a CSS-compatible selected renderer. Executable third-party renderer code is never embedded.
- Settings imports Journey Packages and labels their Interpretations external until locally reinterpreted.

## Archive operations

Settings provides:

- object and Interpretation verification;
- FTS5 index rebuilding;
- Pending Evidence retry/deletion;
- Project rename/merge/delete;
- explicit Retention Policy configuration/application;
- Capture Exclusion removal;
- automatic Capture Cycle triggering;
- local plugin installation.

No revision is pruned unless the user explicitly creates and applies a Retention Policy.
