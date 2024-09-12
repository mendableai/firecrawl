import { TypedEventTarget } from "typescript-event-target";
import type { CrawlStatusResponse, FirecrawlDocument } from "./types";
import type { FirecrawlApp} from "./FirecrawlApp";
import { WebSocket } from "isows";

interface CrawlWatcherEvents {
  document: CustomEvent<FirecrawlDocument>,
  done: CustomEvent<{
    status: CrawlStatusResponse["status"];
    data: FirecrawlDocument[];
  }>,
  error: CustomEvent<{
    status: CrawlStatusResponse["status"],
    data: FirecrawlDocument[],
    error: string,
  }>,
}

export class CrawlWatcher extends TypedEventTarget<CrawlWatcherEvents> {
  private ws: WebSocket;
  public data: FirecrawlDocument[];
  public status: CrawlStatusResponse["status"];

  constructor(id: string, app: FirecrawlApp) {
    super();
    this.ws = new WebSocket(`${app.apiUrl}/v1/crawl/${id}`, app.apiKey);
    this.status = "scraping";
    this.data = [];

    type ErrorMessage = {
      type: "error",
      error: string,
    }
    
    type CatchupMessage = {
      type: "catchup",
      data: CrawlStatusResponse,
    }
    
    type DocumentMessage = {
      type: "document",
      data: FirecrawlDocument,
    }
    
    type DoneMessage = { type: "done" }
    
    type Message = ErrorMessage | CatchupMessage | DoneMessage | DocumentMessage;

    const messageHandler = (msg: Message) => {
      if (msg.type === "done") {
        this.status = "completed";
        this.dispatchTypedEvent("done", new CustomEvent("done", {
          detail: {
            status: this.status,
            data: this.data,
          },
        }));
      } else if (msg.type === "error") {
        this.status = "failed";
        this.dispatchTypedEvent("error", new CustomEvent("error", {
          detail: {
            status: this.status,
            data: this.data,
            error: msg.error,
          },
        }));
      } else if (msg.type === "catchup") {
        this.status = msg.data.status;
        this.data.push(...(msg.data.data ?? []));
        for (const doc of this.data) {
          this.dispatchTypedEvent("document", new CustomEvent("document", {
            detail: doc,
          }));
        }
      } else if (msg.type === "document") {
        this.dispatchTypedEvent("document", new CustomEvent("document", {
          detail: msg.data,
        }));
      }
    }

    this.ws.onmessage = ((ev: MessageEvent) => {
      if (typeof ev.data !== "string") {
        this.ws.close();
        return;
      }

      const msg = JSON.parse(ev.data) as Message;
      messageHandler(msg);
    }).bind(this);

    this.ws.onclose = ((ev: CloseEvent) => {
      const msg = JSON.parse(ev.reason) as Message;
      messageHandler(msg);
    }).bind(this);

    this.ws.onerror = ((_: Event) => {
      this.status = "failed"
      this.dispatchTypedEvent("error", new CustomEvent("error", {
        detail: {
          status: this.status,
          data: this.data,
          error: "WebSocket error",
        },
      }));
    }).bind(this);
  }

  close() {
    this.ws.close();
  }
}
