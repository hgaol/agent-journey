# AgentJourney Plugins

AgentJourney has two separately trusted plugin roles.

## Renderer Plugins

Executable Renderer Plugins receive one immutable, presentation-redacted `StageDocument` inside the same restricted QuickJS runtime used for untrusted adapter code. They return a validated declarative render tree; AgentJourney creates that tree inside an opaque-origin iframe. Plugin code therefore has no browser DOM, archive, Source Evidence, filesystem, network, browser-storage, or Platform Shell access. Render-tree nodes may carry only typed intents.

- **Style Pack** — scoped CSS only; uses the standard semantic stage renderer.
- **Renderer** — scoped CSS plus precompiled JavaScript for custom stage DOM.

Executable renderers register:

```js
globalThis.agentJourneyRenderer = {
  render(stage) {
    return {
      root: {
        tag: "main",
        className: "custom-stage",
        children: [
          { tag: "h1", text: stage.title || "Journey" },
          ...stage.activities.map((activity) => ({
            tag: "article",
            text: activity.text || activity.nativeName || activity.kind,
            intent: { type: "open-evidence", activityId: activity.id }
          }))
        ]
      }
    };
  }
};
```

A renderer receives only the selected Review/Replay projection. Future Activities are removed from its Stage Document during Replay. Render-tree tags, text, package-local raster asset references, and typed intents are schema-validated before they reach the iframe.

## Source Adapter Plugins

Source Adapters run as dependency-bundled JavaScript in an embedded QuickJS sandbox. Node built-ins, package resolution, processes, environment variables, networking, and direct filesystem access do not exist. The host passes only files within a separately approved Source Root.

```js
globalThis.agentJourneyAdapter = {
  discover({ files }) {
    return [
      {
        sourceAgent: "example-agent",
        nativeSessionId: "native-id",
        relativePaths: files.map((file) => file.path),
        locator: { mainPath: files[0].path }
      }
    ];
  },

  interpret({ candidate, files }) {
    return {
      schemaVersion: "1.0.0",
      adapter: { id: "example.adapter", version: "1.0.0" },
      journey: {
        sourceAgent: "example-agent",
        nativeSessionId: candidate.nativeSessionId
      },
      activities: [],
      threads: [{ id: "main" }],
      coverage: {
        sourceRecordCount: 0,
        dispositions: [],
        missing: []
      },
      fidelity: {
        contentKinds: [],
        timedKinds: [],
        deliveryTraces: false,
        agentThreads: false,
        causalLinks: false,
        terminalStream: false,
        knownGaps: []
      }
    };
  }
};
```

Methods are synchronous and return JSON-compatible documents. Every interpreted source record needs an Evidence Disposition.

## Create, package, and check

```bash
pnpm plugin:create style-pack example.colors
pnpm plugin:create renderer example.renderer
pnpm plugin:create source-adapter example.agent

# Follow the generated README, then:
pnpm plugin:pack plugins/example.renderer
pnpm plugin:check plugins/example.renderer/example.renderer.agentjourney-plugin
```

Installed `.agentjourney-plugin` files are inert JSON containing a manifest, integrity hash, scoped CSS, optional precompiled JavaScript, and optional package-local raster images. AgentJourney never runs package managers or lifecycle scripts.

Use `AGENTJOURNEY_PLUGIN_DEV_DIRS` with the platform path delimiter to load explicit development directories without installing them:

```bash
AGENTJOURNEY_PLUGIN_DEV_DIRS=$PWD/examples/plugins/compact-renderer pnpm dev
```

## Compatibility

Plugin manifests declare a semantic `interfaceVersion` range. The host validates it before activation. Incompatible plugins stay disabled rather than running best-effort. Journey Packages reference renderer identities but never embed or install executable plugins.
