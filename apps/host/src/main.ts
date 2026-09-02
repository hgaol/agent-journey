import os from "node:os";
import path from "node:path";
import { SqliteJourneyArchive } from "@agentjourney/archive";
import { builtInAdapters } from "@agentjourney/builtin-adapters";
import { PluginRegistry, SandboxedSourceAdapter } from "@agentjourney/plugin-runtime";
import { LocalAuth } from "./auth.js";
import { CaptureCoordinator } from "./capture-coordinator.js";
import { AutomaticScanner } from "./automatic-scanner.js";
import { EventHub } from "./event-hub.js";
import { createServer } from "./server.js";
import { SettingsStore } from "./settings.js";

const dataDirectory = process.env.AGENTJOURNEY_DATA_DIR
  ? path.resolve(process.env.AGENTJOURNEY_DATA_DIR)
  : path.join(os.homedir(), ".agentjourney");
const port = Number(process.env.AGENTJOURNEY_PORT ?? "4317");
const host = "127.0.0.1";

const archive = await SqliteJourneyArchive.open(path.join(dataDirectory, "archive"));
const settings = new SettingsStore(path.join(dataDirectory, "settings.json"));
await settings.load();
const auth = await LocalAuth.load(dataDirectory);
const events = new EventHub();
const pluginDevelopmentDirectories = (process.env.AGENTJOURNEY_PLUGIN_DEV_DIRS ?? "")
  .split(path.delimiter)
  .map((value) => value.trim())
  .filter(Boolean);
const pluginRegistry = new PluginRegistry(dataDirectory, pluginDevelopmentDirectories);
await pluginRegistry.load();
const builtInSourceAgents = new Set(builtInAdapters.map(({ manifest }) => manifest.sourceAgent));
const thirdPartyAdapters = pluginRegistry.sourceAdapterPackages()
  .map((plugin) => new SandboxedSourceAdapter(plugin))
  .filter(({ manifest }) => !builtInSourceAgents.has(manifest.sourceAgent));
const coordinator = new CaptureCoordinator([...builtInAdapters, ...thirdPartyAdapters], archive, settings, events);
const automaticScanner = new AutomaticScanner(coordinator, settings);
automaticScanner.start();
const app = await createServer({ archive, settings, auth, events, coordinator, automaticScanner, pluginRegistry });
const heartbeat = setInterval(() => events.heartbeat(), 20_000);
heartbeat.unref();

const close = async (): Promise<void> => {
  clearInterval(heartbeat);
  automaticScanner.stop();
  await app.close();
  archive.close();
};
process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));

await app.listen({ host, port });
console.log(`\nAgentJourney: http://${host}:${port}/\n`);
