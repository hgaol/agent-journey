# Separate logical Projects from evidenced Workspaces

A Workspace is an exact working location evidenced by a Journey, while a Project is a stable user-facing grouping that can contain multiple checkouts, worktrees, clones, and Host Environments. AgentJourney may suggest groupings from repository evidence, but users can merge, split, rename, or reassign them and ambiguity remains unassigned rather than guessed. This adds mapping behavior, but avoids path-based fragmentation and preserves source paths as evidence instead of turning them into mutable Project identity.
