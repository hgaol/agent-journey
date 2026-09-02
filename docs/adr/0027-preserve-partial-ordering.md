# Preserve partial ordering across Agent Threads

The Activity Graph preserves Source Order within native streams, explicit causal relationships across streams, and timestamps only where evidenced. Unrelated concurrent Activities retain unknown relative order rather than being forced into a global chronology; timelines may use lanes or simultaneity groups, while list presentations use a deterministic Display Order that is not represented as observed fact. This complicates traversal and playback, but prevents missing, coarse, duplicated, or skewed clocks from manufacturing a false sequence.
