# AgentJourney Archive and Package Format

## Local archive

The deep Archive module stores:

- SQLite metadata, Journey identities, immutable revisions, Interpretations, Activity Graph indexes, Review Overlays, Projects, exclusions, retention settings, and FTS5 search data.
- Gzip-compressed content-addressed objects keyed by SHA-256 for exact Source Bundle bytes and manifests.

Compression never changes object identity: hashes are calculated from original bytes and reads restore those bytes exactly. Revisions and Interpretations use deterministic content identities. Revision identity is based on the content multiset rather than source paths, while every distinct observed file layout and Source Provenance is retained as a revision observation. Append-compatible updates become ordinary revisions; divergent evidence claiming one Native Session Identity is preserved and flagged as an Identity Conflict. The archive is intentionally unencrypted and created with owner-only permissions where the Host Environment supports POSIX modes.

## `.agentjourney` Journey Package

A Journey Package is a ZIP transport with:

- `manifest.json` — version, Journey identities, entry sizes, and SHA-256 checksums.
- `archive.json` — data-only Journey, revision, Interpretation, provenance, and Review Overlay relationships.
- `evidence/...` — exact source files.

Every entry is path-checked, size-bounded, and checksum-verified before import begins. Plugin code is never included or installed. Imported Interpretations retain external provenance; users can run a compatible local adapter to verify/reinterpret the same Source Evidence.

Journey Packages are lossless and unencrypted. They may contain credentials and private code.

## HTML Presentation Export

Presentation HTML receives a presentation-redacted Stage Document. User and source content is HTML-escaped, CSS external-resource constructs are stripped, and third-party renderer JavaScript is excluded. Only AgentJourney's fixed inline review/replay controls execute. The result is derived presentation, not Source Evidence and not re-importable as a Journey Package.
