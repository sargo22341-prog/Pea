import { AsyncLocalStorage } from "node:async_hooks";

export interface YahooUsageSourceContext {
  source: string;
}

const yahooUsageSourceContext = new AsyncLocalStorage<YahooUsageSourceContext>();

export function runWithYahooUsageSource<T>(source: string, callback: () => T): T {
  return yahooUsageSourceContext.run({ source }, callback);
}

export function currentYahooUsageSource() {
  return yahooUsageSourceContext.getStore()?.source;
}
