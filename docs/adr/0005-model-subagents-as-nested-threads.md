# Model subagents as nested Agent Threads

Delegated subagent conversations belong to their parent Journey as nested Agent Threads, linked to the activity that spawned them and to their return point. User-created forks instead become independently addressable Journeys linked to their parent. This preserves delegation and parallelism without flooding the top-level archive with internal workers, at the cost of retaining hierarchical conversation structure across differing source formats.
