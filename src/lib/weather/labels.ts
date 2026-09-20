import type { Lang } from "@/lib/i18n/messages";
import { translate } from "@/lib/i18n/messages";
import type { WeatherCondition } from "./types";

const COND_KEYS = {
  clear: "condClear",
  partly_cloudy: "condPartlyCloudy",
  cloudy: "condCloudy",
  fog: "condFog",
  drizzle: "condDrizzle",
  rain: "condRain",
  snow: "condSnow",
  thunderstorm: "condThunderstorm",
  unknown: "condUnknown",
} as const;

export function conditionLabel(
  condition: WeatherCondition,
  lang: Lang,
): string {
  return translate(lang, COND_KEYS[condition]);
}

/** Daily precip summary, e.g. "oggi previsti 2,4 mm" / "today 2.4 mm expected". */
export function formatPrecipTodayMm(mm: number, lang: Lang): string {
  const rounded = Math.round(mm * 10) / 10;
  const body =
    Math.abs(rounded - Math.trunc(rounded)) < 1e-9
      ? String(Math.trunc(rounded))
      : rounded.toFixed(1).replace(".", lang === "it" ? "," : ".");
  return translate(lang, "precipToday", { mm: body });
}
