enum LogLevel {
  NONE = 'NONE',    // No logs will be output.
  ERROR = 'ERROR',  // For logging error messages that indicate a failure in a specific operation.
  WARN = 'WARN',    // For logging potentially harmful situations that are not necessarily errors.
  INFO = 'INFO',    // For logging informational messages that highlight the progress of the application.
  DEBUG = 'DEBUG',  // For logging detailed information on the flow through the system, primarily used for debugging.
  TRACE = 'TRACE'   // For logging more detailed information than the DEBUG level.
}
export class Logger {
  static colors = {
    ERROR: '\x1b[31m%s\x1b[0m', // Red
    WARN: '\x1b[33m%s\x1b[0m',  // Yellow
    INFO: '\x1b[34m%s\x1b[0m',  // Blue
    DEBUG: '\x1b[36m%s\x1b[0m', // Cyan
    TRACE: '\x1b[35m%s\x1b[0m'  // Magenta
  };

  static log (message: string, level: LogLevel) {
    const logLevel: LogLevel = LogLevel[process.env.LOGGING_LEVEL as keyof typeof LogLevel] || LogLevel.INFO;
    const levels = [LogLevel.NONE, LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG, LogLevel.TRACE];
    const currentLevelIndex = levels.indexOf(logLevel);
    const messageLevelIndex = levels.indexOf(level);

    if (currentLevelIndex >= messageLevelIndex) {
      const color = Logger.colors[level];
      console[level.toLowerCase()](color, `[${new Date().toISOString()}]${level} - ${message}`);

      // if (process.env.USE_DB_AUTH) {
      // save to supabase? another place?
      // supabase.from('logs').insert({ level: level, message: message, timestamp: new Date().toISOString(), success: boolean });
      // }
    }
  }
  static error(message: string | any) {
    Logger.log(message, LogLevel.ERROR);
  }

  static warn(message: string) {
    Logger.log(message, LogLevel.WARN);
  }

  static info(message: string) {
    Logger.log(message, LogLevel.INFO);
  }

  static debug(message: string) {
    Logger.log(message, LogLevel.DEBUG);
  }

  static trace(message: string) {
    Logger.log(message, LogLevel.TRACE);
  }
}
