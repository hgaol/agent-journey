# Use React and Vite for the Web UI

The Platform Shell uses React and TypeScript with Vite, TanStack Router for typed routes, TanStack Query for host state, and TanStack Virtual for large Journeys. Verification uses Vitest, Testing Library, and Playwright. Shell styling starts from plain CSS variables and a small owned design system rather than a heavyweight component framework, while Renderer Plugins retain control of Journey Stage presentation. This chooses a familiar ecosystem and strong virtualization/testing support at the cost of React's runtime and dependency surface.
