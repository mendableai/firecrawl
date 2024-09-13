import { TypedEventTarget } from "typescript-event-target";
import {
  CrawlWatcherMessageType,
  type CrawlStatusResponse,
  type CrawlWatcherEvents,
  type CrawlWatcherMessage,
  type FirecrawlDocument,
} from "./types";
import { WebSocket } from "isows";
import { DEFAULT_API_URL } from "./constants";

/**
 * Watches a crawl and dispatches events for each document and the overall crawl status.
 */
export class CrawlWatcher extends TypedEventTarget<CrawlWatcherEvents> {
  private ws: WebSocket;
  public data: FirecrawlDocument[];
  public status: CrawlStatusResponse["status"];

  /**
   * Creates a new CrawlWatcher to monitor a crawl via WebSocket.
   *
   * @param options - The crawl ID, API key, and optional API URL.
   */
  constructor({
    crawlId,
    apiUrl,
    apiKey,
  }: {
    crawlId: string;
    apiUrl?: string;
    apiKey: string;
  }) {
    super();
    this.ws = new WebSocket(
      `${apiUrl ?? DEFAULT_API_URL}/v1/crawl/${crawlId}`,
      apiKey,
    );
    this.status = "scraping";
    this.data = [];

    const messageHandler = (message: CrawlWatcherMessage) => {
      if (message.type === CrawlWatcherMessageType.Done) {
        this.status = "completed";
        this.dispatchTypedEvent(
          "done",
          new CustomEvent("done", {
            detail: {
              status: this.status,
              data: this.data,
            },
          }),
        );
        return;
      }

      if (message.type === CrawlWatcherMessageType.Error) {
        this.status = "failed";
        this.dispatchTypedEvent(
          "error",
          new CustomEvent("error", {
            detail: {
              status: this.status,
              data: this.data,
              error: message.error,
            },
          }),
        );

        return;
      }

      if (message.type === CrawlWatcherMessageType.Catchup) {
        this.status = message.data.status;
        this.data.push(...message.data.data);
        for (const doc of this.data) {
          this.dispatchTypedEvent(
            "document",
            new CustomEvent("document", {
              detail: doc,
            }),
          );
        }
        return;
      }

      this.dispatchTypedEvent(
        "document",
        new CustomEvent("document", {
          detail: message.data,
        }),
      );
    };

    this.ws.onmessage = ((event: MessageEvent) => {
      if (typeof event.data !== "string") {
        this.ws.close();
        return;
      }

      const message = JSON.parse(event.data) as CrawlWatcherMessage;
      messageHandler(message);
    }).bind(this);

    this.ws.onclose = ((event: CloseEvent) => {
      const message = JSON.parse(event.reason) as CrawlWatcherMessage;
      messageHandler(message);
    }).bind(this);

    this.ws.onerror = (() => {
      this.status = "failed";
      this.dispatchTypedEvent(
        "error",
        new CustomEvent("error", {
          detail: {
            status: this.status,
            data: this.data,
            error: "WebSocket error",
          },
        }),
      );
    }).bind(this);
  }

  /**
   * Closes the underlying WebSocket connection.
   */
  close() {
    this.ws.close();
  }
}
