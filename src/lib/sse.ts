/**
 * Minimal Datastar SSE helpers.
 *
 * Datastar expects Server-Sent Events with specific event names and data formats.
 * https://data-star.dev/reference/sse_events
 */

import type { Response } from "express";

export function startSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();
}

/** Patch (merge) an HTML fragment into the DOM. */
export function patchElements(
  res: Response,
  html: string,
  options: { selector?: string; mode?: string } = {}
): void {
  let data = `elements ${html}`;
  if (options.selector) data = `selector ${options.selector}\n${data}`;
  if (options.mode) data = `mode ${options.mode}\n${data}`;

  res.write(`event: datastar-patch-elements\n`);
  for (const line of data.split("\n")) {
    res.write(`data: ${line}\n`);
  }
  res.write("\n");
}

/** Push signal updates to the client store. */
export function patchSignals(
  res: Response,
  signals: Record<string, unknown>
): void {
  const data = `signals ${JSON.stringify(signals)}`;
  res.write(`event: datastar-patch-signals\n`);
  res.write(`data: ${data}\n\n`);
}

/** Redirect the browser. v1 has no dedicated script-execution event, so this
 * patches in a <script> element, which Datastar evaluates on insertion. */
export function redirect(res: Response, url: string): void {
  patchElements(
    res,
    `<script>window.location.href = ${JSON.stringify(url)}</script>`,
    { selector: "body", mode: "append" }
  );
}

export function endSSE(res: Response): void {
  res.end();
}
