import { expect, it } from "vitest";
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

it("handles done message", async () => {
  const server = new WebSocketServer({ port: WEBSOCKET_PORT });

  server.on("connection", (socket) => {
    setTimeout(() => {
      socket.send(JSON.stringify({ type: "done" }));
    }, 0);
  });

  const watcher = new CrawlWatcher({
    crawlId: "123",
    apiKey: faker.string.uuid(),
    apiUrl: API_URL,
  });

  const event = await waitForEvent(watcher, "done");

  expect(event.detail.status).toBe("completed");

  server.close();
});

it("handles error message", async () => {
  const server = new WebSocketServer({ port: WEBSOCKET_PORT });

  server.on("connection", (socket) => {
    setTimeout(() => {
      socket.send(JSON.stringify({ type: "error", error: "Test error" }));
    }, 0);
  });

  const watcher = new CrawlWatcher({
    crawlId: "123",
    apiKey: faker.string.uuid(),
    apiUrl: API_URL,
  });

  const event = await waitForEvent(watcher, "error");

  expect(event.detail.status).toBe("failed");
  expect(event.detail.error).toBe("Test error");

  server.close();
});

it("handles catchup message", async () => {
  const server = new WebSocketServer({ port: WEBSOCKET_PORT });

  const data = [{ url: "http://example.com" }];
  server.on("connection", (socket) => {
    setTimeout(() => {
      socket.send(
        JSON.stringify({ type: "catchup", data: { status: "scraping", data } }),
      );
    }, 0);
  });

  const watcher = new CrawlWatcher({
    crawlId: "123",
    apiKey: faker.string.uuid(),
    apiUrl: API_URL,
  });

  const event = await waitForEvent(watcher, "document");

  expect(event.detail).toEqual(data[0]);

  server.close();
});

it("handles document message", async () => {
  const server = new WebSocketServer({ port: WEBSOCKET_PORT });

  const data = { url: "http://example.com" };
  server.on("connection", (socket) => {
    setTimeout(() => {
      socket.send(JSON.stringify({ type: "document", data }));
    }, 0);
  });

  const watcher = new CrawlWatcher({
    crawlId: "123",
    apiKey: faker.string.uuid(),
    apiUrl: API_URL,
  });

  const event = await waitForEvent(watcher, "document");

  expect(event.detail).toEqual(data);

  server.close();
});
