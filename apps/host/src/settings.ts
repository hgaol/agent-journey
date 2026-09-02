import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SourceRootSetting {
  sourceAgent: string;
  root: string;
  scanPolicy: "manual" | "automatic";
}

interface SettingsDocument {
  version: 1;
  sourceRoots: SourceRootSetting[];
}

const EMPTY_SETTINGS: SettingsDocument = { version: 1, sourceRoots: [] };

export class SettingsStore {
  private document: SettingsDocument = structuredClone(EMPTY_SETTINGS);

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Partial<SettingsDocument>;
      this.document = {
        version: 1,
        sourceRoots: Array.isArray(parsed.sourceRoots)
          ? parsed.sourceRoots.filter(
              (item): item is SourceRootSetting =>
                typeof item?.sourceAgent === "string" &&
                typeof item.root === "string" &&
                (item.scanPolicy === "manual" || item.scanPolicy === "automatic")
            )
          : []
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.document = structuredClone(EMPTY_SETTINGS);
    }
  }

  listSourceRoots(): readonly SourceRootSetting[] {
    return this.document.sourceRoots;
  }

  rootFor(sourceAgent: string): SourceRootSetting | undefined {
    return this.document.sourceRoots.find((setting) => setting.sourceAgent === sourceAgent);
  }

  async approveSourceRoot(setting: SourceRootSetting): Promise<void> {
    const others = this.document.sourceRoots.filter(({ sourceAgent }) => sourceAgent !== setting.sourceAgent);
    this.document = { version: 1, sourceRoots: [...others, setting] };
    await this.save();
  }

  async revokeSourceRoot(sourceAgent: string): Promise<void> {
    this.document = {
      version: 1,
      sourceRoots: this.document.sourceRoots.filter((setting) => setting.sourceAgent !== sourceAgent)
    };
    await this.save();
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.document, null, 2)}\n`, { mode: 0o600 });
    try {
      await rename(temporary, this.filePath);
    } catch (error) {
      if (process.platform !== "win32") throw error;
      await rm(this.filePath, { force: true });
      await rename(temporary, this.filePath);
    }
    if (process.platform !== "win32") await chmod(this.filePath, 0o600);
  }
}
