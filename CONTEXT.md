# AgentJourney

AgentJourney is a local-first, read-only platform for preserving, finding, and replaying histories produced by multiple coding agents.

## Language

**AgentJourney Platform**:
The local-first environment in which coding-agent histories are preserved, found, and replayed across source agents. It does not execute or control coding agents.
_Avoid_: Library, agent runner, control plane

**Journey**:
The durable replay of one logical, non-branching coding-agent conversation. A Journey may span resumed invocations; a fork begins a separate Journey linked to its parent.
_Avoid_: Session, transcript, recording, Reel

**Journey Revision**:
An immutable state of a Journey based on source content observed at a particular capture point. The newest revision is shown by default, while stable references identify one specific revision.
_Avoid_: Snapshot, duplicate Journey

**Agent Thread**:
A nested coding-agent conversation delegated from activity within a Journey. It retains its own ordered activity and rejoins its parent without becoming a top-level Journey.
_Avoid_: Sub-Journey, separate session

**Fork**:
A new Journey that diverges from a parent Journey at a known point while retaining that lineage. Unlike an Agent Thread, a Fork is independently addressable by the user.
_Avoid_: Branch thread, duplicate

**Native Session Identity**:
The conversation identifier assigned by a Source Agent. Together with the Source Agent, it establishes Journey identity when available and remains independent of source location.
_Avoid_: Filename, source path

**Synthetic Identity**:
A clearly marked AgentJourney-assigned identity used only when Source Evidence contains no Native Session Identity.
_Avoid_: Guessed session ID

**Identity Conflict**:
Divergent Source Evidence that claims the same Source Agent and Native Session Identity without being an append-compatible continuation. AgentJourney preserves and flags both revisions rather than silently merging them.
_Avoid_: Duplicate, overwrite

**Source Provenance**:
The known origin and discovery history of Source Evidence, including source locations that may change without changing Journey identity.
_Avoid_: Identity, ownership

**Host Environment**:
The operating environment in which AgentJourney accesses Source Roots and maintains Local Custody. Native Windows and WSL are distinct Host Environments even when they run on the same machine.
_Avoid_: Source Agent, project

**Workspace**:
An exact working location evidenced for a Journey. Multiple Workspaces may represent checkouts or worktrees belonging to the same Project; an evidenced path does not grant filesystem access.
_Avoid_: Project, repository identity, Source Root

**Project**:
A stable, user-facing grouping of related Journeys and Workspaces. Suggested grouping may use repository evidence, but ambiguous Journeys remain unassigned and users control final membership.
_Avoid_: Directory, workspace, folder basename

**Discovery**:
The identification of candidate coding-agent histories and their approximate scope before AgentJourney archives their content.
_Avoid_: Capture, import

**Turn Count Estimate**:
A Discovery-only estimate derived from source-native human-prompt records so users can judge a candidate Journey's scope before Capture. It is not a Canonical Turn count and may be unavailable for third-party Source Adapters.
_Avoid_: Exact turn count, Activity count

**Capture**:
The preservation of coding-agent activity for later inspection and replay. AgentJourney captures only activity already persisted by another system.
_Avoid_: Logging, tracing

**Capture Scope**:
The user-approved boundary selecting which discovered histories AgentJourney may archive.
_Avoid_: Search filter, filesystem access

**Source Root**:
A user-approved location within which a Source Adapter Plugin may discover and capture persisted histories.
_Avoid_: Home-directory access, archive location

**Scan Policy**:
The per-Source-Root choice between user-initiated scanning and automatic rescanning. New Source Roots default to manual scanning.
_Avoid_: Capture Scope, watcher configuration

**Capture Cycle**:
An atomic attempt to preserve and interpret the changed histories within a scan. Each changed Journey gains at most one revision from a cycle, and an incomplete cycle never replaces its current revision.
_Avoid_: File event, partial import

**Passive Capture**:
Capture by discovering or receiving a coding agent's persisted history without launching, wrapping, intercepting, or modifying the agent.
_Avoid_: Instrumentation, recording proxy

**Source Adapter Plugin**:
A separately trusted extension that recognizes and interprets a Source Agent's persisted history as Journeys, Source Evidence, and Canonical Activity. Its authority over local evidence is distinct from a Renderer Plugin's presentation role.
_Avoid_: Renderer, import script

**Forensic Review**:
The examination of a Journey to reconstruct an agent's decisions, actions, failures, and outcomes. It is AgentJourney's primary user goal.
_Avoid_: Monitoring, analytics

**Review Overlay**:
User-authored organization and commentary associated with immutable Journey evidence, such as a display title, tags, Project assignment, bookmarks, notes, or saved presentation preferences.
_Avoid_: Edited evidence, Canonical Activity

**Global Search**:
Archive-wide search over Canonical Activity, Journey metadata, provenance, supported Artifact text, native tool identities, and Tool Capabilities. Results identify a specific Activity and Journey Revision.
_Avoid_: Raw-file search, web search

**Evidence Search**:
Search confined to the exact Source Bundle of a selected Journey Revision.
_Avoid_: Global Search, canonical search

**Local Custody**:
The guarantee that Journey content remains under the user's control on the machine running AgentJourney. AgentJourney does not transmit that content to an account, hosted service, or telemetry system.
_Avoid_: Cloud backup, local-first sync

**Sensitive Finding**:
An evidence-linked span that AgentJourney identifies with high confidence as a credential or comparable secret requiring guarded presentation.
_Avoid_: Deleted secret, encrypted content

**Presentation Redaction**:
Reversible masking of Sensitive Findings when content is displayed or exported, without altering Source Evidence or Canonical Activity.
_Avoid_: Sanitization, encryption

**Replay**:
A chronological presentation of captured or imported coding-agent activity that preserves the observable sequence of work.
_Avoid_: Playback, transcript view

**Review View**:
The default presentation in which the complete selected Journey Revision is immediately available for forensic inspection, navigation, and search.
_Avoid_: Static replay, transcript mode

**Replay View**:
An optional progressive presentation in which a playhead traverses the Activity Graph without inventing unsupported timing. Entering Replay restarts at the first frame and begins automatically when the selected mode has autoplay-safe timing; manual-only histories remain paused.
_Avoid_: Review View, simulated terminal recording

**Playhead**:
The current position within Replay View, controlling which evidenced Activity has been revealed.
_Avoid_: Cursor, fake clock

**Turn**:
A navigation grouping of Activities associated with one interaction cycle. Its boundaries retain whether they were explicitly evidenced by the Source Agent or inferred for presentation.
_Avoid_: Core Activity, guaranteed source fact

**Fidelity Manifest**:
The capability-based account of which content, timing, Delivery Traces, Agent Threads, causal relationships, and terminal evidence an Interpretation supports, including known gaps.
_Avoid_: Fidelity Profile, quality level, accuracy score

**Fidelity Badge**:
A concise Semantic, Timed, or Terminal summary derived from a Fidelity Manifest. A badge never implies that every Activity has the summarized fidelity.
_Avoid_: Guarantee, quality tier

**Semantic Fidelity**:
Preservation of the meaningful ordered activity in a conversation, such as messages, reasoning, tool use, results, and edits.
_Avoid_: Basic fidelity

**Timed Fidelity**:
Semantic Fidelity with source-supported timestamps or durations that reveal the pace of activity.
_Avoid_: Full fidelity

**Terminal Fidelity**:
Timed Fidelity with a captured ANSI terminal stream sufficient to reproduce the observed terminal presentation.
_Avoid_: Exact mode, raw mode

**Source Agent**:
The coding-agent product that produced a Journey's Source Evidence. It determines the default renderer and remains unchanged when another renderer is selected.
_Avoid_: Model, model provider, renderer

**Model Provider**:
The service or route through which a Source Agent accessed a model. Its identity is independent of both the Source Agent and Model and remains unknown when Source Evidence does not establish it.
_Avoid_: Agent, model

**Model**:
The model identity reported by Source Evidence for some or all of a Journey. It is not inferred from the Source Agent or Model Provider.
_Avoid_: Agent, provider

**Platform Shell**:
The stable AgentJourney experience surrounding Journey presentation, including library navigation, search, revision selection, replay controls, import, settings, and archive operations.
_Avoid_: Renderer chrome, agent theme

**Journey Stage**:
The bounded terminal transcript surface where the selected renderer expresses a Journey Revision without changing its evidence, causality, or availability.
_Avoid_: Entire application, chat pane

**Terminal Replay Debugger**:
The Journey workspace combining a terminal-native transcript, Thread and Turn navigation, Activity inspection, and timestamp-driven Replay controls.
_Avoid_: Dashboard, chat UI, terminal emulator

**Source-Native Renderer**:
An interchangeable presentation of a Journey patterned after an agent's recognizable language, information hierarchy, and visual conventions. It never changes Canonical Activity and is not terminal emulation or a pixel-exact recording.
_Avoid_: Theme, emulator, replica

**Renderer Plugin**:
An interchangeable extension that presents Canonical Activity on the Journey Stage through AgentJourney's public rendering contract. Built-in and third-party renderers share that contract rather than receiving different expressive powers.
_Avoid_: Hardcoded theme, application plugin

**Style Pack**:
A Renderer Plugin that changes visual expression without introducing custom presentation behavior.
_Avoid_: Hardcoded CSS, full renderer

**Neutral Fallback**:
A source-independent presentation used when the selected renderer has no native treatment for an activity. It preserves the activity rather than omitting it.
_Avoid_: Unknown event, unsupported block

**Source Evidence**:
The immutable, losslessly preserved activity records supplied by a coding agent. Source Evidence is the basis for verifying or reinterpreting a Journey.
_Avoid_: Raw data, logs

**Source Bundle**:
The byte-preserved source files and their relevant identities retained as Source Evidence for a Journey. Manual imports and scanner discoveries receive the same preservation guarantee.
_Avoid_: Parsed copy, normalized export

**Pending Evidence**:
A preserved Source Bundle that could not yet be interpreted into a valid Journey Revision. It remains outside current Canonical Activity until successfully retried or explicitly deleted.
_Avoid_: Failed Journey, discarded import

**Activity**:
AgentJourney's canonical account of one meaningful occurrence in a coding-agent conversation, such as a message, reasoning step, tool interaction, edit, or state change.
_Avoid_: Message, block, raw event

**Human Input**:
Content intentionally supplied by the human participant to the coding agent. A source role named `user` is insufficient evidence that content is Human Input.
_Avoid_: User-role message, prompt injection

**Context Injection**:
Instructions or environmental context supplied to the coding agent by its harness, configuration, or surrounding system rather than intentionally entered as the current Human Input.
_Avoid_: Human prompt, hidden noise

**Agent Output**:
Content communicated by a coding agent as an observable response or update, distinct from its Reasoning and tool interactions.
_Avoid_: Assistant message, reasoning

**Delivery Trace**:
Optional evidence describing the incremental chunks or snapshots through which one semantic Activity was delivered. It supports progressive Replay without turning transport fragments into duplicate Activities.
_Avoid_: Activity list, simulated streaming

**Recorded Streaming**:
Progressive Replay of content using chunk order and timing preserved in a Delivery Trace.
_Avoid_: Typewriter effect, reconstructed cadence

**Simulated Streaming**:
An explicitly labeled, optional TUI-like character reveal used when no Delivery Trace exists. It is presentation only and never represented as evidenced timing.
_Avoid_: Recorded Streaming, faithful cadence

**Streaming Speed**:
A user-selected multiplier applied only to chunk transitions within Recorded or Simulated Streaming. It does not alter the timestamp-based intervals between separate Activities.
_Avoid_: Timeline speed, source timing

**Reasoning**:
Deliberation or a reasoning summary attributed as such by Source Evidence. AgentJourney does not infer Reasoning from ordinary Agent Output.
_Avoid_: Chain of thought guess, commentary

**Tool Invocation**:
A coding agent's evidenced request to use a named tool or capability. It retains the source-native tool identity and may link to one or more Tool Results.
_Avoid_: Command, action block

**Tool Capability**:
A conservative, source-independent description of what a native tool can do, used for cross-agent comparison without replacing the evidenced tool identity. A Tool Invocation may have several capabilities or none when its behavior is uncertain.
_Avoid_: Normalized tool name, guessed category

**Tool Result**:
Evidenced output or status produced in response to a Tool Invocation.
_Avoid_: User message, agent response

**Approval Request**:
An evidenced request for a human or policy decision before activity may proceed.
_Avoid_: Human Input, tool error

**Approval Decision**:
The evidenced response to an Approval Request, including approval, rejection, or cancellation.
_Avoid_: Prompt response, tool result

**State Transition**:
An evidenced change in conversation state, such as starting, stopping, interruption, compaction, or a model or operating-mode change.
_Avoid_: Status text, inferred state

**Usage Observation**:
Source-evidenced consumption or limit information associated with a Journey or part of it, such as tokens, reported cost, or quota state.
_Avoid_: Estimated usage, billing record

**Artifact**:
A named work product or input surfaced by the conversation, such as a plan, patch, image, or generated document.
_Avoid_: Source Bundle, tool output

**Diagnostic**:
An evidenced warning or failure that is not already represented by a Tool Result.
_Avoid_: Inferred problem, generic status

**Activity Graph**:
The ordered and causally related Activities that constitute a Journey and its Agent Threads. Transcript, turn, and timeline presentations are views of this graph rather than separate histories.
_Avoid_: Flat transcript, event list

**Evidence Anchor**:
A stable reference from an Activity or part of it to the native record identity or exact source coordinates supporting it. Review Overlays target these anchors and remain unresolved rather than being guessed when an anchor cannot be found.
_Avoid_: Array index, screen position

**Source Order**:
The deterministic order in which evidence appears within a native source stream. It does not by itself establish wall-clock order across streams or Agent Threads.
_Avoid_: Timestamp order, global chronology

**Source-Order Placement**:
Replay scheduling that reveals an untimed Activity adjacent to timestamped activity according to its evidenced Source Order. It is labeled untimed and does not manufacture an observed timestamp.
_Avoid_: Inferred timestamp, simulated wall-clock time

**Display Order**:
A deterministic flattening used when a presentation requires a list despite unknown relative order. It is a viewing convenience rather than a claim about observed chronology.
_Avoid_: Source Order, causal order

**Unclassified Activity**:
An Activity whose source meaning is not yet understood by the applicable source interpretation. It remains visible and linked to Source Evidence until it can be classified without guessing.
_Avoid_: Unsupported event, ignored record

**Canonical Activity**:
AgentJourney's source-independent interpretation of Source Evidence for understanding activity consistently across coding agents. It is derived and may be rebuilt without changing the evidence.
_Avoid_: Unified transcript, converted history

**Interpretation**:
A versioned derivation of Canonical Activity from one Journey Revision by a particular source interpretation and canonical schema. New interpretations do not change the underlying Source Evidence.
_Avoid_: Journey Revision, migration

**Interpretation Provenance**:
The recorded origin, adapter, schema, and validation status of an Interpretation, including whether it was produced locally or imported from another archive.
_Avoid_: Source Evidence provenance, implicit trust

**Evidence Disposition**:
The accounted outcome for an interpreted source record, such as contributing Canonical Activity, supplying metadata, representing duplicate or transport detail, remaining unclassified, or being malformed.
_Avoid_: Silent skip, parser status

**Coverage Report**:
A factual account of an Interpretation's source-record dispositions, missing relationships or timing, versions, and available fidelity, with traceability to Source Evidence.
_Avoid_: Accuracy score, quality grade

**Historical Import**:
The incorporation of activity previously recorded by a coding agent into AgentJourney.
_Avoid_: Migration, upload

**Independent Archive**:
AgentJourney's durable custody of a Journey and its Source Evidence independently of the source location. Source changes or deletion do not remove archived evidence; only an explicit AgentJourney deletion does.
_Avoid_: Mirror, index

**Journey Package**:
A lossless, checksummed, data-only, re-importable transfer of selected Journey evidence, revisions, Interpretations, metadata, and Review Overlays that preserves archive identity. It never carries executable plugins.
_Avoid_: Presentation Export, plugin package, backup screenshot

**Presentation Export**:
A derived, non-authoritative presentation of selected Journey content using a chosen renderer and Presentation Redaction policy.
_Avoid_: Source Evidence, Journey Package

**Replay Video Export**:
A local MP4 Presentation Export produced from deterministic Replay frames using a selected Style Pack, local rendering engine, quality, 0.5×–16× speed, frame rate, streaming mode, and redaction policy. It contains no audio and is never Source Evidence or a terminal recording; simulated timing remains visibly labeled. Export preparation, frame rendering, encoding, and finalization expose local progress without changing the resulting presentation.
_Avoid_: Terminal Fidelity, screen recording, evidence package

**Retention Policy**:
An explicit user instruction permitting specified archived revisions and evidence to be permanently removed. In the absence of such a policy, AgentJourney retains every revision.
_Avoid_: Automatic cleanup, cache eviction

**Capture Exclusion**:
A minimal, content-free instruction preventing a deleted or intentionally skipped native session from being recaptured. It is reversible and identified by Source Agent and Native Session Identity.
_Avoid_: Hidden Journey, retained evidence

**Agent Control**:
Launching, steering, or approving a live coding agent. Agent Control is outside AgentJourney's core purpose.
_Avoid_: Orchestration, agent management
