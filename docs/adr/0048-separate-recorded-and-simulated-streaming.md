# Separate recorded and simulated streaming in Replay

The Terminal Replay Debugger offers event steps, Recorded Streaming, and opt-in Simulated Streaming. Recorded Streaming is available only when Source Evidence yielded Delivery Trace chunks and preserves their order/timing; Simulated Streaming reveals agent output and reasoning in deterministic character chunks but labels every such frame `SIMULATED` and never upgrades the Fidelity Manifest. This provides TUI-like motion for sparse passive histories without presenting invented token cadence as forensic evidence.
