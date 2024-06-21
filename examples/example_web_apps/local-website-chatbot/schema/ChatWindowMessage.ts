export type ChatWindowMessage = {
  content: string;
  role: "human" | "ai";
  runId?: string;
  traceUrl?: string;
}