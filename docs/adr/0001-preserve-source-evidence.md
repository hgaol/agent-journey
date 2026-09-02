# Preserve source evidence alongside canonical activity

AgentJourney retains lossless, immutable Source Evidence and derives Canonical Activity from it rather than replacing source records during capture. Every manual import and scanner discovery preserves the exact source bytes and relevant file identities as a Source Bundle. This deliberately duplicates sensitive data and uses more storage, but preserves forensic integrity, allows interpretations to be corrected as adapters evolve, and prevents future source-faithful renderers from being limited by fields an earlier importer discarded.
