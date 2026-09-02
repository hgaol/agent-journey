# Local Plugin Development

Create a renderer or source adapter with:

```bash
pnpm plugin:create style-pack example.colors
pnpm plugin:create renderer example.renderer
pnpm plugin:create source-adapter example.agent
```

Each generated directory explains how to compile, package, and validate the plugin. Packages are inert `.agentjourney-plugin` JSON files and can be installed from AgentJourney Settings.
