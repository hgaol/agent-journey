# Author Source Adapter Plugins in TypeScript

Source Adapter Plugins use a typed TypeScript SDK and install as precompiled, dependency-bundled JavaScript. They execute in a restricted embedded JavaScript sandbox with only AgentJourney's virtual source-reading and interpretation interfaces: Node built-ins, package resolution, direct filesystem access, process APIs, and networking are absent. This keeps adapter contribution aligned with the rest of the platform while accepting a constrained runtime and deferring optional WebAssembly support until demonstrated workloads require it.
