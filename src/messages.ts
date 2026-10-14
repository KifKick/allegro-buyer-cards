// Message threads as the integration exposes them: the `details` attribute of
// its unread-messages and invoices sensors (MessageThread.as_attributes in the
// integration's messages.py). Parsed defensively, like the orders.

import { MESSAGE_CATEGORIES, type MessageCategory } from "./const";
import type { HassEntity } from "./ha-types";

export interface Thread {
  id: string;
  seller: string;
  category: MessageCategory;
  /** ms (Date.parse), when Allegro sends a usable timestamp. */
  time?: number;
  read: boolean;
  preview: string;
}

const text = (value: unknown): string =>
  value === null || value === undefined ? "" : String(value).trim();

/** The integration's `thread_id` format (services.py THREAD_ID_SCHEMA). */
const THREAD_ID = /^[A-Za-z0-9_-]{1,128}$/;

const parseThread = (raw: Record<string, any>): Thread | undefined => {
  const id = text(raw.thread_id);
  if (!THREAD_ID.test(id)) return undefined;
  const category = text(raw.category) as MessageCategory;
  const time = Date.parse(text(raw.timestamp));
  return {
    id,
    seller: text(raw.seller),
    category: MESSAGE_CATEGORIES.includes(category) ? category : "other",
    time: Number.isNaN(time) ? undefined : time,
    read: raw.read === true,
    preview: text(raw.preview),
  };
};

const parsed = new WeakMap<HassEntity, Thread[]>();

export const parseThreads = (stateObj?: HassEntity): Thread[] => {
  if (!stateObj) return [];
  let threads = parsed.get(stateObj);
  if (!threads) {
    const details = stateObj.attributes?.details;
    threads = (Array.isArray(details) ? details : [])
      .filter((raw): raw is Record<string, any> => typeof raw === "object" && raw !== null)
      .map(parseThread)
      .filter((thread): thread is Thread => Boolean(thread));
    parsed.set(stateObj, threads);
  }
  return threads;
};

/** Threads a person wrote or that carry an invoice: the ones worth a banner. */
export const needsReading = (threads: Thread[]): Thread[] =>
  threads.filter((thread) => thread.category !== "order_status");
