import type { IncomingMessage, ServerResponse } from "node:http";

import type { App } from "../app.js";
import { africasTalking } from "../gateways/africastalking.js";
import type { Gateway } from "../types.js";

export interface NodeHandlerOptions {
  /** Called when a handler throws. The user still gets `errorText`. Default logs to console. */
  onError?: (error: unknown, req: IncomingMessage) => void;
  /** Shown to the user when something throws. Default `Something went wrong. Please try again.` */
  errorText?: string;
}

type RequestWithBody = IncomingMessage & { body?: unknown };

function readRaw(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Parses the body as JSON or form data depending on the content type. */
export async function readBody(req: RequestWithBody): Promise<Record<string, unknown>> {
  if (req.body !== undefined && req.body !== null && typeof req.body === "object") {
    return req.body as Record<string, unknown>;
  }
  const raw = typeof req.body === "string" ? req.body : await readRaw(req);
  const type = String(req.headers["content-type"] ?? "");
  if (type.includes("application/json")) {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

/**
 * Turns an app into a `(req, res)` handler for node:http, Express, Fastify's raw
 * server, or anything else that hands you those two objects.
 *
 * @example
 * createServer(createNodeHandler(app)).listen(3000);
 *
 * @example
 * express().post("/ussd", createNodeHandler(app));
 */
export function createNodeHandler(
  app: App,
  gateway: Gateway<Record<string, unknown>, string> = africasTalking,
  options: NodeHandlerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const onError =
    options.onError ??
    ((error) => {
      console.error("ussdkit: handler failed", error);
    });
  const errorText = options.errorText ?? "Something went wrong. Please try again.";

  return async (req, res) => {
    let output: string;
    try {
      const body = await readBody(req as RequestWithBody);
      const response = await app.handle(gateway.parse(body));
      output = gateway.format(response);
      res.statusCode = 200;
    } catch (error) {
      onError(error, req);
      output = gateway.format({ text: errorText, end: true });
      res.statusCode = 200;
    }
    res.setHeader("content-type", gateway.contentType);
    res.end(output);
  };
}
