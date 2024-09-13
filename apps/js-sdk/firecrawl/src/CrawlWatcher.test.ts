import { vi, expect, describe, it } from "vitest";
import { WebSocketServer } from "ws";
import { CrawlWatcher } from "./CrawlWatcher";
import type { CrawlWatcherEvents } from "./types";
import { faker } from "@faker-js/faker";

const WEBSOCKET_PORT = 8080;
const API_URL = `http://localhost:${String(WEBSOCKET_PORT)}`;

function waitForEvent<T extends keyof CrawlWatcherEvents>(
  watcher: CrawlWatcher,
  event: T,
): Promise<CrawlWatcherEvents[T]> {
  return new Promise((resolve) => {
    watcher.addEventListener(event, (e) => {
      resolve(e);
    });
  });
}

it("sends an api key", async () => {
  const apiKey = faker.string.uuid();
  const server = new WebSocketServer({ port: WEBSOCKET_PORT });
  let sentApiKey: string | null = null;

  server.on("connection", (socket) => {
    sentApiKey = socket.protocol;

    setTimeout(() => {
      socket.close(1000, JSON.stringify({ type: "done" }));
    }, 0);
  });

  const watcher = new CrawlWatcher({
    crawlId: "123",
    apiKey,
    apiUrl: API_URL,
  });

  await waitForEvent(watcher, "done");

  expect(sentApiKey).toBe(apiKey);

  server.close();
});
