# Use JSON Schema as the source of truth for public contracts

Versioned JSON Schemas define Source Adapter interpretation documents, Renderer stage documents and intents, Journey Packages, loopback HTTP resources, Coverage Reports, and Fidelity Manifests. TypeScript types, runtime validators, OpenAPI descriptions, fixtures, and compatibility tests are generated from those schemas rather than maintained independently. This adds generation tooling, but gives sandbox and package inputs runtime validation and keeps public contracts usable beyond TypeScript without duplicate definitions drifting.
