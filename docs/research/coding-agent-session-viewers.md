# Coding-agent session viewer landscape

## Question

Is there an existing project that:

1. supports several coding agents;
2. collects session logs plus source-agent metadata;
3. replays/renders the process in a web UI like the terminal agent; and
4. defaults to the source agent's visual style while allowing the viewer to switch among Codex, Claude Code, Pi, and other themes?

## Conclusion

Several projects cover requirements 1–3 in different ways, but none found covers all four. In particular, the inspected projects either normalize every provider into one application UI or replay the raw terminal. None documents a provider-native skin system that automatically selects the source agent's appearance and lets the user re-render the same normalized session as Claude Code, Codex, Pi, etc.

This leaves a credible product gap: combine semantic, normalized transcripts with timed terminal replay and pluggable provider-native renderers.

## Closest projects

| Project | Agents | Collection and metadata | Web rendering/replay | Themes | Fit |
|---|---|---|---|---|---|
| [AgentsView](https://github.com/wesm/agentsview) | Broad list including Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Pi, Aider, Copilot CLI, Devin CLI, and others | Discovers local stores, syncs to SQLite, indexes messages, models, token usage, costs, projects, and agent identity | Rich web session browser, live updates, tool/thinking blocks, search, analytics, export | Light/dark, not source-agent skins | Best mature foundation for requirements 1–2 and transcript browsing |
| [Agent Session Viewer](https://github.com/dhruv-anand-aintech/agent-session-viewer) | Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Pi, Goose, Devin, and others | Reads each platform's native JSONL/JSON/SQLite locations and retains `source`/brand identity | Live normalized web conversation UI with tool cards and thinking blocks | Unified dark UI with per-platform identity/colors, not interchangeable native skins | Closest lightweight multi-provider web viewer |
| [cctrace](https://github.com/thevibeworks/cctrace) | Claude Code, Codex, Grok, Kimi Code, OpenCode | Wraps the agent with a TLS-intercepting proxy; records requests, streamed responses, metadata, usage, cost, context, and client identity into local traces | Strongest semantic process replay: step/play controls, time lanes, tool/subagent events, live tailing, and reopenable HTML/web traces | System/light/dark; no Claude/Codex/Pi skin switching; Pi is not listed | Closest to requirements 2–3, but capture is proxy-based and playback of original stream timing remains on its roadmap |
| [ccx](https://github.com/thevibeworks/ccx) | Claude Code, Codex, Grok | Reads native local session files, merges providers with badges, exposes model/date/token metadata | Web browser, live tail, conversation tree, turn evidence and timeline rail | Light/dark plus provider accents; not native agent skins; full replay mode is not the current scope | Good read-only multi-provider browser |
| [AICoder Session Viewer](https://github.com/seastart/aicoder-session-viewer) | Claude Code, Codex, Gemini CLI, Antigravity CLI, OpenCode | Provider registry normalizes JSONL/JSON/SQLite into one Rust model and carries tool/session metadata | Tauri UI plus self-contained HTML export; Markdown, code, tools, thinking, images, subagents | One dark UI with per-tool colors; HTML light/dark toggle only | Strong desktop/export option, but not browser-server playback and no Pi |
| [VibeTunnel](https://github.com/amantus-ai/vibetunnel) | Any terminal program | Records forwarded PTY sessions in asciinema format; session activity is tracked | Browser terminal and later terminal playback, preserving ANSI/terminal behavior | Terminal presentation rather than semantic source-agent renderers | Best literal terminal fidelity, but weaker semantic agent metadata/search |
| [agmux](https://github.com/rjprins/agmux) | Launches Claude Code, Codex, custom CLIs; discovers inactive Claude, Codex, and Pi logs | tmux-backed PTYs plus provider log discovery and readiness metadata | Live xterm.js terminal, conversation previews, restore/resume | Generic terminal/application themes | Good terminal control plane; not a normalized archival renderer |
| [AgentOS](https://github.com/saadnvd1/agent-os) | Claude Code, Codex, OpenCode, Gemini CLI, Aider, Cursor CLI, Amp, Pi, Oh My Pi | Manages agent/tmux sessions and worktrees | Multi-pane web terminal and session orchestration | Unified product UI | Strong for running agents, not for source-native historical rendering |
| [TraceForge](https://github.com/mgt19888/traceforge) | Codex and Claude Code adapters | Normalized event/session schema with provider/adapter metadata | Replay strip, chronological timeline, command/test/diff/issues panes | No provider-native theme system documented | Useful event-model prototype; narrow and early |
| [agent-replay](https://github.com/ALeeCFin/agent-replay) | Claude Code only | Imports Claude Code transcripts to SQLite/FTS | Timeline scrubber, rich replay UI, diffs, errors, costs and embedded Claude terminal | Claude-focused only | Strong replay UX reference, not multi-agent |
| [ace](https://github.com/mjaverto/ace) | Claude Code, Codex, Pi, Oh My Pi, OpenCode | Normalizes transcripts to Markdown with rich YAML frontmatter including source, model, cwd, branch, version and counts | No web UI | N/A | Good ingestion/metadata reference or preprocessing layer |

## Requirement-by-requirement assessment

### 1. Several coding agents

Already well covered. AgentsView has the broadest documented parser set. Agent Session Viewer, AgentOS, and ace explicitly include Pi as well as Claude Code and Codex.

### 2. Logs plus source-agent metadata

Also substantially covered. Two collection approaches are common:

- **Read native history stores:** AgentsView, Agent Session Viewer, ccx, AICoder Session Viewer, and ace parse files/databases already written by each agent.
- **Capture at runtime:** cctrace proxies agent traffic; VibeTunnel/agmux capture PTY output.

Native parsing preserves semantic events but requires one evolving adapter per provider. PTY recording is visually faithful but does not by itself recover structured tool calls, thinking, token usage, models, or lineage.

### 3. Reproduce the terminal process in a web UI

There are two different meanings:

- **Semantic replay:** cctrace, TraceForge, and agent-replay render chronological prompts, reasoning, tools, outputs, diffs, and timing as structured web components.
- **Literal terminal replay:** VibeTunnel records asciinema-compatible terminal output; tmux/xterm projects such as agmux render the actual PTY.

No inspected project clearly combines a lossless PTY recording with a normalized semantic event stream and keeps them synchronized on one playhead.

### 4. Default to the source agent's UI, with switchable Codex/Claude/Pi themes

This is the uncovered requirement. Existing theme support means one of:

- application light/dark/system modes;
- code-highlight themes;
- provider badges/accent colors; or
- the terminal's ANSI appearance.

That is different from a renderer contract such as:

```text
normalized session + selected renderer
  -> claude-code skin
  -> codex skin
  -> pi skin
  -> neutral audit skin
  -> raw terminal skin
```

None of the inspected primary sources documents this behavior.

## Product opportunity

A differentiated implementation could use three layers:

1. **Lossless source envelope** — preserve raw records, source agent, schema version, file offsets, timestamps, model, cwd, branch, session lineage, and capture provenance.
2. **Normalized semantic event model** — user/assistant text, thinking, tool start/update/result, file edits, commands, approvals, errors, usage, compaction, subagents, and terminal chunks.
3. **Pluggable renderers** — source-default renderer selected from metadata, switchable Claude Code/Codex/Pi/neutral themes, plus an ANSI terminal renderer. Themes should change presentation without changing event meaning.

For true process reproduction, record both semantic events and timestamped terminal chunks. Link both to stable event IDs or monotonic timestamps so a single playhead can drive the themed transcript and terminal view.

## Primary sources inspected

- AgentsView README, supported-agent table, and theme implementation: <https://github.com/wesm/agentsview>
- Agent Session Viewer README and source brand catalog: <https://github.com/dhruv-anand-aintech/agent-session-viewer>
- cctrace README, web/replay docs, and replay roadmap: <https://github.com/thevibeworks/cctrace>
- ccx README and web renderer/theme source: <https://github.com/thevibeworks/ccx>
- AICoder Session Viewer README and provider registry: <https://github.com/seastart/aicoder-session-viewer>
- VibeTunnel README: <https://github.com/amantus-ai/vibetunnel>
- agmux README: <https://github.com/rjprins/agmux>
- AgentOS README: <https://github.com/saadnvd1/agent-os>
- TraceForge README, architecture, importer and replay UI: <https://github.com/mgt19888/traceforge>
- agent-replay README: <https://github.com/ALeeCFin/agent-replay>
- ace README and frontmatter schema: <https://github.com/mjaverto/ace>
