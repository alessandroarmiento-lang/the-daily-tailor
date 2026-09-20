"use client";

import { config } from "@/lib/config";
import { useLang } from "@/lib/i18n/provider";

export function Masthead() {
  const { t, locale } = useLang();
  const now = new Date();
  const dateLine = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: config.timezone,
  }).format(now);

  return (
    <header className="masthead">
      <p className="masthead__edition">
        {t("personalEdition")} · {dateLine}
      </p>
      <h1 className="masthead__brand">{config.productName}</h1>
      <p className="masthead__tagline">{t("tagline")}</p>
      <div className="masthead__rule" aria-hidden="true" />
    </header>
  );
}
