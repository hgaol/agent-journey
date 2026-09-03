import type { FastifyReply } from "fastify";

export interface HostEvent {
  type: "capture-started" | "capture-progress" | "capture-completed" | "capture-failed" | "archive-changed" | "video-export-progress";
  at: string;
  data: Record<string, unknown>;
}

export class EventHub {
  private readonly clients = new Set<FastifyReply>();

  attach(reply: FastifyReply): void {
    this.clients.add(reply);
    reply.raw.on("close", () => this.clients.delete(reply));
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  }

  publish(event: HostEvent): void {
    const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) client.raw.write(frame);
  }

  heartbeat(): void {
    for (const client of this.clients) client.raw.write(": heartbeat\n\n");
  }
}
