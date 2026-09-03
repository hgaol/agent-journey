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

Replay uses the Activity Graph rather than inventing a flat chronology. Selecting **REPLAY** starts again from the first frame and automatically plays when timing is supported; the first frame is held briefly so the complete Review transcript cannot appear to carry into Replay. The transport shows `left MM:SS.s` and counts down using the active timeline/cadence speeds and compressed gaps; manual-only Replay shows `left · manual` instead of inventing a duration. Prompts, reasoning, tool calls/results, status transitions, and Delivery Trace chunks appear in the terminal pane as their frames are reached. The timeline shows one lane per Agent Thread, and long idle gaps are visibly compressed.

The **Content streaming** selector offers:

- **Event steps** — each semantic Activity appears as one unit at its evidenced timestamp.
- **Recorded stream** — available only when the Fidelity Manifest reports Delivery Traces; preserved chunks appear in recorded order and timing.
- **Simulated TUI stream** — opt-in fast sixteen-character streaming for agent output and reasoning when native chunks were not persisted. The dock displays `SIMULATED cadence`; this is presentation only and does not become Source Evidence.

The **Prompt playback** selector defaults to **simulated typing/paste** and can be changed to instant submission: Human Input appears as a draft in the source-native composer, then moves into the transcript before the response. Inputs over 1,000 characters skip typing: the complete content appears in one visibly labeled simulated paste and is submitted after a brief hold. This prevents pasted logs from taking minutes; Typing Speed does not alter the paste transition. Both forms are presentation-only, represent no recorded keystrokes or clipboard event, and send nothing to the source agent.

Recorded and simulated response modes expose a **Streaming speed** selector from 0.5× through 16×. Simulated prompts instead expose an independent **Typing speed** from 0.5× through 4×. Typing uses the same target character cadence regardless of transcript size; slow rendering may skip an intermediate character frame to catch up rather than stretching the whole prompt. Streaming Speed changes only response chunks; the **Timeline speed** selector independently controls timestamp gaps between Activities. Both typing and response streaming follow deadline-based cadence and update only the active composer/Activity, so large transcripts do not accumulate extra per-frame rendering delay. Timeline dots are a density-bounded Activity overview; typing characters and response chunks do not create thousands of duplicate timeline controls.

When a session contains timestamps plus occasional untimed control records, Replay places those records by evidenced Source Order and labels the dock `untimed · source-order placement`; no timestamp is inferred. A wholly untimed session remains manual-step-only in event and recorded modes. Simulated mode may autoplay because the user explicitly requested synthetic presentation.

## Export and import

- **Package** exports lossless `.agentjourney` evidence. Confirm the warning: the package is unencrypted and may contain secrets.
- **HTML** exports escaped, self-contained presentation using a CSS-compatible selected renderer. Executable third-party renderer code is never embedded.
- **MP4** opens a local export dialog for Style Pack, 720p/1080p/1440p quality, 0.5×–16× playback speed, 30/60 fps, event/recorded/simulated streaming, optional simulated prompt typing with its own speed, and redaction. Video is silent H.264, simulated cadence is labeled, and temporary frames remain local and are deleted after encoding. Rendering engine may be Automatic, Playwright Chromium, installed Google Chrome, installed Microsoft Edge, or Playwright WebKit. Automatic mode tries them in that order. WebKit is Safari-compatible but is not the installed Safari application; install it with `pnpm exec playwright install webkit`. The dialog shows overall percentage, current phase, and rendered-frame count while exporting. Set `AGENTJOURNEY_BROWSER_EXECUTABLE`, `AGENTJOURNEY_EDGE_EXECUTABLE`, or the legacy `AGENTJOURNEY_CHROME_EXECUTABLE` for a nonstandard Chromium-based executable.
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
