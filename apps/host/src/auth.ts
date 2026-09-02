import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";

const COOKIE_NAME = "agentjourney_session";

function sameSecret(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const hostname = host.startsWith("[") ? host.slice(1, host.indexOf("]")) : host.split(":")[0];
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isSafeOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

export class LocalAuth {
  private secret: string;
  private csrf: string;

  private constructor(private readonly secretPath: string, installationSecret: string) {
    this.secret = installationSecret;
    this.csrf = this.deriveCsrf(installationSecret);
  }

  get installationSecret(): string {
    return this.secret;
  }

  get csrfToken(): string {
    return this.csrf;
  }

  static async load(dataDirectory: string): Promise<LocalAuth> {
    const secretPath = path.join(dataDirectory, "local-auth-token");
    await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
    let installationSecret: string;
    try {
      installationSecret = (await readFile(secretPath, "utf8")).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      installationSecret = randomBytes(32).toString("base64url");
      await writeFile(secretPath, `${installationSecret}\n`, { mode: 0o600, flag: "wx" });
    }
    if (process.platform !== "win32") await chmod(secretPath, 0o600);
    return new LocalAuth(secretPath, installationSecret);
  }

  async register(app: FastifyInstance): Promise<void> {
    await app.register(cookie);

    app.addHook("onRequest", async (request, reply) => {
      if (!isLoopbackHost(request.headers.host) || !isSafeOrigin(request.headers.origin)) {
        return reply.code(403).send({ error: "untrusted_local_origin" });
      }
      const pathName = request.url.split("?")[0];
      if (pathName === "/api/v1/health" || pathName === "/api/v1/auth/bootstrap") return;
      if (!pathName?.startsWith("/api/")) return;
      const session = request.cookies[COOKIE_NAME];
      if (!session || !sameSecret(session, this.installationSecret)) {
        return reply.code(401).send({ error: "local_auth_required" });
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        const csrf = request.headers["x-agentjourney-csrf"];
        if (typeof csrf !== "string" || !sameSecret(csrf, this.csrfToken)) {
          return reply.code(403).send({ error: "csrf_required" });
        }
      }
    });

    app.post("/api/v1/auth/bootstrap", async (request, reply) => {
      const body = request.body as { token?: unknown } | null;
      if (typeof body?.token !== "string" || !sameSecret(body.token, this.installationSecret)) {
        return reply.code(401).send({ error: "invalid_local_token" });
      }
      reply.setCookie(COOKIE_NAME, this.installationSecret, {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/"
      });
      return { csrfToken: this.csrfToken };
    });

    app.get("/api/v1/auth/session", async () => ({ csrfToken: this.csrfToken }));
    app.post("/api/v1/auth/rotate", async (_request, reply) => {
      await this.rotate();
      reply.setCookie(COOKIE_NAME, this.installationSecret, {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/"
      });
      return { csrfToken: this.csrfToken };
    });
  }

  private async rotate(): Promise<void> {
    const next = randomBytes(32).toString("base64url");
    await writeFile(this.secretPath, `${next}\n`, { mode: 0o600 });
    if (process.platform !== "win32") await chmod(this.secretPath, 0o600);
    this.secret = next;
    this.csrf = this.deriveCsrf(next);
  }

  private deriveCsrf(secret: string): string {
    return createHash("sha256").update(`csrf\0${secret}`).digest("base64url");
  }
}

export function requestOrigin(request: FastifyRequest): string {
  return `http://${request.headers.host ?? "127.0.0.1"}`;
}
