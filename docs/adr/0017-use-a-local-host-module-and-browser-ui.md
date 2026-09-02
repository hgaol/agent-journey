# Use a local host module and browser UI

AgentJourney runs a local host module that owns filesystem access, Discovery, Capture Cycles, the Independent Archive, canonical projections, search, and plugin sandboxes. The browser hosts the Platform Shell and Journey Stage across a loopback interface. A future desktop wrapper must reuse this topology rather than fork the product. This is heavier than a browser-only application, but browser security constraints cannot reliably support directory scanning, durable raw-file custody, background reconciliation, or adapter isolation.
