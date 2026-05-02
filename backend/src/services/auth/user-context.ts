import { AsyncLocalStorage } from "node:async_hooks";

const defaultSingleUserId = 1;
const userContext = new AsyncLocalStorage<number>();

export function runWithUser<T>(userId: number, callback: () => T): T {
  return userContext.run(userId, callback);
}

export function currentUserId() {
  return userContext.getStore() ?? defaultSingleUserId;
}

export function normalizeUserId(userId?: number | string) {
  const numeric = Number(userId ?? currentUserId());
  return Number.isFinite(numeric) && numeric > 0 ? numeric : defaultSingleUserId;
}
