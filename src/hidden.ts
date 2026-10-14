// Orders the user hid ("Got it") while Allegro still lists them, e.g. a
// parcel picked up before the carrier reported it. Kept in the HA user's
// frontend data, so it follows them across devices and is shared by every
// card, with one subscription per connection however many cards are open.
// Keys are `<config entry id>:<order key>`, so accounts never mix.

import type { Connection, HomeAssistant } from "./ha-types";

const KEY = "allegro_buyer_cards_hidden";

type Listener = (hidden: ReadonlySet<string>) => void;

interface Store {
  hidden: ReadonlySet<string>;
  listeners: Set<Listener>;
  unsubscribe?: Promise<(() => void | Promise<void>) | undefined>;
}

// Stores outlive their subscriptions, so cards coming back (another view,
// a closed dialog) start from the last known value instead of "nothing hidden".
const stores = new WeakMap<Connection, Store>();

const EMPTY: ReadonlySet<string> = new Set();

const toSet = (value: unknown): Set<string> =>
  new Set(Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : []);

const publish = (store: Store | undefined, hidden: ReadonlySet<string>): void => {
  if (!store) return;
  store.hidden = hidden;
  for (const listener of store.listeners) listener(hidden);
};

const storeFor = (connection: Connection): Store => {
  let store = stores.get(connection);
  if (!store) {
    store = { hidden: EMPTY, listeners: new Set() };
    stores.set(connection, store);
  }
  return store;
};

/** Calls `listener` now and on every change; returns the unsubscribe function. */
export const subscribeHidden = (hass: HomeAssistant, listener: Listener): (() => void) => {
  const connection = hass.connection;
  if (!connection) {
    listener(EMPTY);
    return () => {};
  }
  const store = storeFor(connection);
  store.listeners.add(listener);
  listener(store.hidden);
  if (!store.unsubscribe) {
    store.unsubscribe = connection
      .subscribeMessage<{ value?: unknown }>((message) => publish(store, toSet(message?.value)), {
        type: "frontend/subscribe_user_data",
        key: KEY,
      })
      .catch(async () => {
        // Older cores without the subscription: read it once (keeping what we had if that fails too).
        const result = await hass
          .callWS<{ value?: unknown }>({ type: "frontend/get_user_data", key: KEY })
          .catch(() => undefined);
        if (result) publish(store, toSet(result.value));
        return undefined;
      });
  }
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size === 0 && store.unsubscribe) {
      const pending = store.unsubscribe;
      store.unsubscribe = undefined;
      void pending.then((unsubscribe) => unsubscribe?.());
    }
  };
};

/**
 * Read-modify-write of the stored set, so a change is never made against a
 * stale or not-yet-loaded copy. Every subscribed card sees the result
 * straight away; if saving fails, they go back to the previous set.
 */
export const updateHidden = async (
  hass: HomeAssistant,
  change: (hidden: Set<string>) => void,
): Promise<void> => {
  const store = hass.connection ? stores.get(hass.connection) : undefined;
  const result = await hass.callWS<{ value?: unknown }>({ type: "frontend/get_user_data", key: KEY });
  const previous = toSet(result?.value);
  const next = new Set(previous);
  change(next);
  publish(store, next);
  try {
    await hass.callWS({ type: "frontend/set_user_data", key: KEY, value: [...next] });
  } catch (err) {
    publish(store, previous);
    throw err;
  }
};
