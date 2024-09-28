import * as winston from "winston";

import { configDotenv } from "dotenv";
configDotenv();

export const logger = winston.createLogger({
  level: process.env.LOGGING_LEVEL?.toLowerCase() ?? "trace",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
});
