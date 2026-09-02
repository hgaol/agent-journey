# Do not encrypt the local archive

AgentJourney does not provide application-level encryption for Source Bundles, Canonical Activity, search indexes, or Artifacts. The archive instead uses owner-only filesystem permissions, verifies those permissions where possible, binds its interface to loopback, and clearly relies on the host account and operating system's disk protection. This avoids incomplete encryption claims and cross-platform key-recovery complexity, but users with at-rest protection requirements must secure the host environment itself.
