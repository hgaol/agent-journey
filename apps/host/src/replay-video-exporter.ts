import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import {
  canAutoPlayReplay,
  deriveReplayFrames,
  replayFrameDelay,
  type ReplayFrame
} from "@agentjourney/activity-graph";
import type {
  ReplayVideoExportOptionsDocument,
  StageDocument
} from "@agentjourney/contracts";
import type { RendererPlugin } from "@agentjourney/plugin-sdk";
import { buildStageSource, projectStageDocument } from "@agentjourney/portability";
import { chromium, type Browser, type Page } from "playwright-core";

const MAX_UNIQUE_FRAMES = 5_000;
const MAX_DURATION_MS = 2 * 60 * 60 * 1_000;

const QUALITY = {
  "720p": { width: 1280, height: 720, crf: 23, preset: "veryfast" },
  "1080p": { width: 1920, height: 1080, crf: 20, preset: "medium" },
  "1440p": { width: 2560, height: 1440, crf: 18, preset: "slow" }
} as const;

export interface ReplayVideoExportInput {
  stage: StageDocument;
  renderer: RendererPlugin;
  options: ReplayVideoExportOptionsDocument;
}

export interface ReplayVideoExportResult {
  bytes: Uint8Array;
  fileName: string;
  frameCount: number;
  durationMs: number;
}

export interface ReplayVideoExporter {
  exportReplay(input: ReplayVideoExportInput): Promise<ReplayVideoExportResult>;
}

export interface ReplayVideoFramePlan {
  frames: ReplayFrame[];
  durationsMs: number[];
  durationMs: number;
}

export function validateReplayVideoOptions(value: unknown): ReplayVideoExportOptionsDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Video export options are required");
  const input = value as Record<string, unknown>;
  const quality = input.quality;
  const speed = input.speed;
  const fps = input.fps;
  const streamMode = input.streamMode;
  if (typeof input.rendererId !== "string" || !input.rendererId) throw new Error("Renderer is required");
  if (!(["720p", "1080p", "1440p"] as const).includes(quality as never)) throw new Error("Unsupported video quality");
  if (!([0.5, 1, 2, 4, 8, 16] as const).includes(speed as never)) throw new Error("Unsupported video speed");
  if (fps !== 30 && fps !== 60) throw new Error("Unsupported frame rate");
  if (!(["events", "recorded", "simulated"] as const).includes(streamMode as never)) throw new Error("Unsupported streaming mode");
  if (typeof input.reveal !== "boolean") throw new Error("Video redaction selection is required");
  return {
    rendererId: input.rendererId,
    quality: quality as ReplayVideoExportOptionsDocument["quality"],
    speed: speed as ReplayVideoExportOptionsDocument["speed"],
    fps,
    streamMode: streamMode as ReplayVideoExportOptionsDocument["streamMode"],
    reveal: input.reveal,
    ...(typeof input.revisionId === "string" ? { revisionId: input.revisionId } : {}),
    ...(typeof input.interpretationId === "string" ? { interpretationId: input.interpretationId } : {})
  };
}

export function planReplayVideo(
  stage: StageDocument,
  options: Pick<ReplayVideoExportOptionsDocument, "speed" | "streamMode">
): ReplayVideoFramePlan {
  const frames = deriveReplayFrames(stage.activities, { streamMode: options.streamMode });
  if (frames.length === 0) throw new Error("This Journey has no Activities to export");
  if (frames.length > MAX_UNIQUE_FRAMES) {
    throw new Error(`Replay contains ${frames.length} frames; choose Event steps or a shorter Journey (maximum ${MAX_UNIQUE_FRAMES})`);
  }
  if (frames.length > 1 && !canAutoPlayReplay(frames, options.streamMode)) {
    throw new Error("This Journey has no evidenced Replay timing; choose Simulated TUI stream for MP4 export");
  }
  const durationsMs = frames.map((frame, index) => {
    const next = frames[index + 1];
    if (!next) return Math.max(250, 1_200 / options.speed);
    return replayFrameDelay(frame, next, {
      timelineSpeed: options.speed,
      streamingSpeed: options.speed
    });
  });
  const durationMs = durationsMs.reduce((total, duration) => total + duration, 0);
  if (durationMs > MAX_DURATION_MS) throw new Error("Replay video would exceed the two-hour export limit; choose a faster speed");
  return { frames, durationsMs, durationMs };
}

function stageAtFrame(
  stage: StageDocument,
  frame: ReplayFrame,
  streamMode: ReplayVideoExportOptionsDocument["streamMode"]
): StageDocument {
  return projectStageDocument({
    ...stage,
    presentation: {
      ...stage.presentation,
      view: "replay",
      streamMode,
      playheadActivityId: frame.activityId,
      ...(frame.deliveryChunkIndex !== undefined ? { playheadDeliveryChunk: frame.deliveryChunkIndex } : {}),
      ...(frame.simulatedTextLength !== undefined ? { playheadSimulatedTextLength: frame.simulatedTextLength } : {})
    }
  });
}

async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.AGENTJOURNEY_CHROME_EXECUTABLE;
  if (executablePath) return chromium.launch({ executablePath, headless: true });
  try {
    return await chromium.launch({ headless: true });
  } catch (firstError) {
    try {
      return await chromium.launch({ channel: "chrome", headless: true });
    } catch {
      const detail = firstError instanceof Error ? ` (${firstError.message.split("\n")[0]})` : "";
      throw new Error(`MP4 export requires a local Chromium or Google Chrome installation${detail}`);
    }
  }
}

async function connectStage(page: Page): Promise<void> {
  await page.evaluate(() => {
    const channel = new MessageChannel();
    (window as typeof window & { agentJourneyVideoPort?: MessagePort }).agentJourneyVideoPort = channel.port1;
    channel.port1.start();
    window.postMessage({ type: "agentjourney:init" }, "*", [channel.port2]);
  });
}

async function addExportBadge(
  page: Page,
  options: ReplayVideoExportOptionsDocument,
  rendererName: string
): Promise<void> {
  const mode = options.streamMode === "simulated"
    ? "SIMULATED STREAM"
    : options.streamMode === "recorded"
      ? "RECORDED STREAM"
      : "EVENT REPLAY";
  await page.evaluate(({ label, redaction }) => {
    const badge = document.createElement("div");
    badge.id = "agentjourney-video-badge";
    badge.textContent = `${label} · ${redaction}`;
    document.body.append(badge);
  }, {
    label: `${rendererName.toUpperCase()} · ${options.quality.toUpperCase()} · ${options.fps} FPS · ${mode} · ${options.speed}×`,
    redaction: options.reveal ? "UNREDACTED" : "REDACTED"
  });
  await page.addStyleTag({ content: "#agentjourney-video-badge{position:fixed;z-index:2147483647;top:10px;right:10px;padding:5px 7px;border:1px solid #ffffff2b;border-radius:3px;background:#090b0dcc;color:#d4d4d4;font:10px ui-monospace,monospace;letter-spacing:.06em}" });
}

async function renderStageFrame(page: Page, stage: StageDocument): Promise<void> {
  await page.evaluate((documentValue: unknown) => {
    (window as typeof window & { agentJourneyVideoPort?: MessagePort }).agentJourneyVideoPort?.postMessage({
      type: "render",
      document: documentValue
    });
  }, stage as unknown);
  await page.waitForSelector(".stage");
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
  });
}

function concatPath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replaceAll("'", "'\\''");
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegInstaller.path, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-16_000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (${code ?? "unknown"}): ${stderr.trim().split("\n").at(-1) ?? "unknown error"}`));
    });
  });
}

export class LocalReplayVideoExporter implements ReplayVideoExporter {
  private active = false;

  async exportReplay(input: ReplayVideoExportInput): Promise<ReplayVideoExportResult> {
    if (this.active) throw new Error("Another MP4 export is already running");
    if (input.renderer.javascript) throw new Error("MP4 export currently supports Style Pack renderers only");
    this.active = true;
    let temporaryDirectory: string | undefined;
    let browser: Browser | undefined;
    try {
      temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "agentjourney-video-"));
      const plan = planReplayVideo(input.stage, input.options);
      const quality = QUALITY[input.options.quality];
      browser = await launchBrowser();
      const context = await browser.newContext({
        viewport: { width: quality.width, height: quality.height },
        deviceScaleFactor: 1
      });
      const page = await context.newPage();
      await page.setContent(buildStageSource(input.renderer), { waitUntil: "load" });
      await connectStage(page);
      await addExportBadge(page, input.options, input.renderer.manifest.displayName);
      await page.addStyleTag({ content: "*{animation:none!important;transition:none!important}html{scroll-behavior:auto!important}" });
      const imagePaths: string[] = [];
      for (const [index, frame] of plan.frames.entries()) {
        await renderStageFrame(page, stageAtFrame(input.stage, frame, input.options.streamMode));
        const imagePath = path.join(temporaryDirectory, `frame-${String(index).padStart(5, "0")}.png`);
        await page.screenshot({ path: imagePath, type: "png" });
        imagePaths.push(imagePath);
      }
      const listPath = path.join(temporaryDirectory, "frames.txt");
      const list = imagePaths.flatMap((imagePath, index) => [
        `file '${concatPath(imagePath)}'`,
        `duration ${(plan.durationsMs[index]! / 1_000).toFixed(6)}`
      ]);
      list.push(`file '${concatPath(imagePaths.at(-1)!)}'`);
      await writeFile(listPath, `${list.join("\n")}\n`, "utf8");
      const outputPath = path.join(temporaryDirectory, "replay.mp4");
      await runFfmpeg([
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0", "-i", listPath,
        "-vf", `fps=${input.options.fps},format=yuv420p`,
        "-an", "-c:v", "libx264", "-preset", quality.preset,
        "-crf", String(quality.crf), "-movflags", "+faststart",
        outputPath
      ]);
      const bytes = await readFile(outputPath);
      return {
        bytes,
        fileName: `${input.stage.journeyId.slice(0, 12)}-${input.options.quality}-${input.options.speed}x.mp4`,
        frameCount: plan.frames.length,
        durationMs: plan.durationMs
      };
    } finally {
      await browser?.close().catch(() => undefined);
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
      this.active = false;
    }
  }
}
