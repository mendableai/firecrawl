import * as winston from "winston";

import { configDotenv } from "dotenv";
import Transport from "winston-transport";
configDotenv();

const logFormat = winston.format.printf(info => 
  `${info.timestamp} ${info.level} [${info.metadata.module ?? ""}:${info.metadata.method ?? ""}]: ${info.message} ${info.message.includes("not matched by any schema") ? JSON.stringify(
    info.metadata,
    (_, value) => {
      if (value instanceof Error) {
        return {
          ...value,
          name: value.name,
          message: value.message,
          stack: value.stack,
          cause: value.cause,
        }
      } else {
        return value;
      }
    }
  ) : ""}`
)

export const logger = winston.createLogger({
  level: process.env.LOGGING_LEVEL?.toLowerCase() ?? "trace",
  format: winston.format.json({
    replacer(key, value) {
      if (value instanceof Error) {
        return {
          ...value,
          name: value.name,
          message: value.message,
          stack: value.stack,
          cause: value.cause,
          this_is_an_error: "haha",
        }
      } else {
        return value;
      }
    }
  }),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.metadata({ fillExcept: ["message", "level", "timestamp"] }),
        winston.format.colorize(),
        logFormat,
      ),
    }),
  ],
});

export type ArrayTransportOptions = Transport.TransportStreamOptions & {
  array: any[];
  scrapeId?: string;
};

export class ArrayTransport extends Transport {
  private array: any[];
  private scrapeId?: string;

  constructor(opts: ArrayTransportOptions) {
    super(opts);
    this.array = opts.array;
    this.scrapeId = opts.scrapeId;
  }

  log(info, next) {
    setImmediate(() => {
      this.emit("logged", info);
    });

    if (this.scrapeId !== undefined && info.scrapeId !== this.scrapeId) {
      return next();
    }

    this.array.push(info);

    next();
  }
}