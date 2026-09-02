# Do not inspect Workspace directories by default

A Workspace path is Source Evidence, not permission to access a repository. AgentJourney reads only approved Source Roots and its own archive; it does not inspect current project files, Git history, or filesystem state to enrich or reconstruct a Journey. Project grouping therefore uses captured metadata and explicit user decisions. This limits automatic enrichment and recovery of externally referenced files, but ensures passive review cannot turn a path mentioned in a session into an implicit repository crawl.
