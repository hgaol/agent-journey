# AgentJourney Plugin Runtime

Installed `.agentjourney-plugin` files are inert JSON documents containing a manifest, integrity hash, scoped CSS, and optional precompiled JavaScript.

Renderer and Source Adapter JavaScript execute in an embedded QuickJS sandbox without browser DOM, Node, filesystem, process, environment, package-resolution, or network globals. Renderers return a validated declarative tree that the trusted stage runtime creates inside an opaque-origin iframe.

Adapter packages register:

```js
globalThis.agentJourneyAdapter = {
  discover({ files }) { return []; },
  interpret({ candidate, files }) { return interpretationDocument; }
};
```

Methods are synchronous and exchange only JSON-compatible documents.
