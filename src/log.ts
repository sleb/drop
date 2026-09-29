import { configure, getConsoleSink, getLogger, getTextFormatter } from "@logtape/logtape";

export const logger = getLogger(["drop"]);

// Log a line verbatim. The tagged template keeps braces in commands and file
// contents from being read as placeholders.
export const info = (line: string): void => logger.info`${line}`;

export const setupLogging = async (): Promise<void> => {
  const formatter = getTextFormatter({
    timestamp: "date-time-tz",
    // Print interpolated strings as-is instead of quoted.
    value: (v, inspect) => (typeof v === "string" ? v : inspect(v)),
  });
  await configure({
    sinks: { console: getConsoleSink({ formatter }) },
    loggers: [
      { category: ["drop"], lowestLevel: "info", sinks: ["console"] },
      { category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] },
    ],
  });
};
