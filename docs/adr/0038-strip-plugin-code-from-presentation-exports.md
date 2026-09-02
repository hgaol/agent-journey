# Strip Renderer Plugin code from Presentation Exports

Self-contained HTML Presentation Exports never embed third-party executable code. A Renderer Plugin supplies an export-safe representation inside its sandbox; AgentJourney removes scripts, event handlers, external URLs, and unsafe CSS, then adds only its trusted inline runtime for replay, search, collapsing, and redaction controls. A plugin that cannot produce safe output falls back to the neutral exporter. This limits custom export interactions, but avoids turning a shared presentation into an implicit plugin-execution package.
