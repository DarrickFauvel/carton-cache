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

/** Replace or merge an HTML fragment into the DOM. */
export function mergeFragments(
  res: Response,
  html: string,
  options: { selector?: string; mergeMode?: string } = {}
): void {
  let data = `fragments ${html}`;
  if (options.selector) data = `selector ${options.selector}\n${data}`;
  if (options.mergeMode) data = `mergeMode ${options.mergeMode}\n${data}`;

  res.write(`event: datastar-merge-fragments\n`);
  for (const line of data.split("\n")) {
    res.write(`data: ${line}\n`);
  }
  res.write("\n");
}

/** Push signal updates to the client store. */
export function mergeSignals(
  res: Response,
  signals: Record<string, unknown>
): void {
  const data = `signals ${JSON.stringify(signals)}`;
  res.write(`event: datastar-merge-signals\n`);
  res.write(`data: ${data}\n\n`);
}

/** Redirect the browser (Datastar action). */
export function redirect(res: Response, url: string): void {
  res.write(`event: datastar-execute-script\n`);
  res.write(`data: script window.location.href = '${url}'\n\n`);
}

export function endSSE(res: Response): void {
  res.end();
}
