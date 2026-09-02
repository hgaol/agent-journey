# Run from source with pnpm for now

AgentJourney currently targets source development through a pnpm workspace on Node.js rather than installer, desktop-wrapper, or bundled-runtime work. The host and Vite UI run together with `pnpm dev`; packaging decisions remain outside the implementation scope until the platform behavior is validated. This keeps effort on archive, adapter, renderer, and replay seams while accepting that non-developers do not yet receive an installation path.
