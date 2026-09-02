import type { CaptureCoordinator } from "./capture-coordinator.js";
import type { SettingsStore } from "./settings.js";

export class AutomaticScanner {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly coordinator: CaptureCoordinator,
    private readonly settings: SettingsStore,
    private readonly intervalMs = 60_000
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runCycle(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async runCycle(): Promise<void> {
    const automatic = this.settings.listSourceRoots().filter(({ scanPolicy }) => scanPolicy === "automatic");
    await Promise.allSettled(automatic.map(({ sourceAgent }) => this.coordinator.capture(sourceAgent)));
  }
}
