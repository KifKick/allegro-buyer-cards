// Device-based discovery: a card is configured with (at most) a device_id —
// one Allegro account — and finds that account's entities through the
// frontend registries.

import { DOMAIN } from "./const";
import type { DeviceRegistryEntry, HassEntity, HomeAssistant } from "./ha-types";

export const isAllegroDevice = (device: DeviceRegistryEntry): boolean =>
  (device.identifiers ?? []).some(([domain]) => domain === DOMAIN);

export const getAllegroDevices = (hass: HomeAssistant): DeviceRegistryEntry[] =>
  Object.values(hass.devices ?? {})
    .filter(isAllegroDevice)
    .sort((a, b) => deviceName(a).localeCompare(deviceName(b)));

/** The configured device, or the first Allegro account when none is set. */
export const resolveDevice = (
  hass: HomeAssistant,
  deviceId?: string,
): DeviceRegistryEntry | undefined =>
  deviceId ? hass.devices?.[deviceId] : getAllegroDevices(hass)[0];

/** Services take a config_entry_id; the device identifier *is* the entry id. */
export const configEntryId = (device: DeviceRegistryEntry): string | undefined =>
  device.identifiers.find(([domain]) => domain === DOMAIN)?.[1] ?? device.config_entries[0];

export const deviceName = (device: DeviceRegistryEntry): string =>
  device.name_by_user || device.name || "Allegro";

/** `<platform>.<translation_key>` -> entity_id for every entity on the device. */
export type EntityMap = Record<string, string>;

// hass.entities is replaced (not mutated) on registry changes, so it's a
// reliable cache key; set hass() runs on every state change in the system.
const cache = new WeakMap<object, Map<string, EntityMap>>();

export const resolveEntities = (hass: HomeAssistant, deviceId: string): EntityMap => {
  // The frontend loads the registries after the states; until then, nothing.
  if (!hass.entities) return {};
  let perDevice = cache.get(hass.entities);
  if (!perDevice) {
    perDevice = new Map();
    cache.set(hass.entities, perDevice);
  }
  let map = perDevice.get(deviceId);
  if (!map) {
    map = {};
    for (const entry of Object.values(hass.entities ?? {})) {
      if (entry.device_id !== deviceId || entry.platform !== DOMAIN || !entry.translation_key) {
        continue;
      }
      map[`${entry.entity_id.split(".", 1)[0]}.${entry.translation_key}`] = entry.entity_id;
    }
    perDevice.set(deviceId, map);
  }
  return map;
};

const isAllegroUpdate = (stateObj?: HassEntity): boolean =>
  Boolean(stateObj) &&
  (/\/_\/allegro\//.test(String(stateObj!.attributes.entity_picture ?? "")) ||
    /\/home-assistant-allegro\b/.test(String(stateObj!.attributes.release_url ?? "")));

let updateEntityId: string | undefined;
let updateSearchedAt = 0;

/**
 * The integration's HACS update entity, if HACS manages it. It isn't on the
 * account's device, so it's recognised by the brand picture HACS gives it.
 * Remembered once found; a miss is retried at most once a minute (HACS may
 * not have created it yet), not on every state change.
 */
export const findUpdateEntity = (hass: HomeAssistant): HassEntity | undefined => {
  if (updateEntityId && isAllegroUpdate(hass.states[updateEntityId])) {
    return hass.states[updateEntityId];
  }
  const now = Date.now();
  if (now - updateSearchedAt < 60_000) return undefined;
  updateSearchedAt = now;
  updateEntityId = Object.keys(hass.states).find(
    (id) => id.startsWith("update.") && isAllegroUpdate(hass.states[id]),
  );
  return updateEntityId ? hass.states[updateEntityId] : undefined;
};

/** Test hook: forget the remembered update entity. */
export const resetUpdateEntityCache = (): void => {
  updateEntityId = undefined;
  updateSearchedAt = 0;
};
