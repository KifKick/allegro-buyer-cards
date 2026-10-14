// Number and money formatting that follows the user's Home Assistant locale.

import type { HassEntity, HomeAssistant } from "./ha-types";

/** Mirrors HA's numberFormat preference so numbers match the rest of the UI. */
export const numberLocale = (hass?: HomeAssistant): string | string[] | undefined => {
  const language = hass?.locale?.language ?? hass?.language;
  switch (hass?.locale?.number_format) {
    case "comma_decimal":
      return ["en-US", "en"];
    case "decimal_comma":
      return ["de", "es", "it"];
    case "space_comma":
      return ["fr", "sv", "cs"];
    case "system":
      return undefined;
    default:
      return language;
  }
};

export const formatNumber = (hass: HomeAssistant | undefined, value: number, digits = 0): string =>
  new Intl.NumberFormat(numberLocale(hass), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

/** 33.28 PLN -> "33,28 zł" (in Polish) or "PLN 33.28" (in English). */
export const formatMoney = (
  hass: HomeAssistant | undefined,
  amount: number,
  currency: string,
): string => {
  if (/^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat(numberLocale(hass), { style: "currency", currency }).format(amount);
    } catch {
      // Unknown currency code: fall through to a plain number.
    }
  }
  return `${formatNumber(hass, amount, 2)}${currency ? ` ${currency}` : ""}`;
};

export const isUnavailable = (stateObj?: HassEntity): boolean =>
  !stateObj || stateObj.state === "unavailable" || stateObj.state === "unknown";

/** "Thu 16.10, 23:59" in the user's language and Home Assistant's time zone. */
export const formatDateTime = (hass: HomeAssistant | undefined, ms: number): string => {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  const timeZone = hass?.locale?.time_zone === "local" ? undefined : hass?.config?.time_zone;
  try {
    return new Intl.DateTimeFormat(hass?.locale?.language ?? hass?.language, { ...options, timeZone }).format(ms);
  } catch {
    return new Intl.DateTimeFormat(hass?.locale?.language ?? hass?.language, options).format(ms);
  }
};

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "in 5 hours", "2 days ago": the largest whole unit, minutes at the least. */
export const formatRelative = (hass: HomeAssistant | undefined, ms: number, now = Date.now()): string => {
  const diff = ms - now;
  const [unit, size] = UNITS.find(([, size]) => Math.abs(diff) >= size) ?? UNITS[UNITS.length - 1];
  return new Intl.RelativeTimeFormat(hass?.locale?.language ?? hass?.language, { numeric: "auto" }).format(
    Math.trunc(diff / size),
    unit,
  );
};
