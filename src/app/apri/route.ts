import {
  isAllowedNativeScheme,
  nativeSchemeFromApriParams,
} from "@/lib/apple/deep-links";

export const dynamic = "force-dynamic";

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Same-origin handoff for iPhone PWA / Safari.
 * Custom schemes in the Home Screen webview show “indirizzo non è valido”;
 * opening this HTTPS page (often via target=_blank → Safari) then redirecting
 * lets the system open Reminders / Calendar.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = nativeSchemeFromApriParams(url.searchParams);

  if (!target || !isAllowedNativeScheme(target)) {
    return new Response(
      `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>Link non valido</title></head><body style="font:16px/1.4 system-ui;padding:1.5rem"><p>Link non valido.</p><p><a href="/">Torna al giornale</a></p></body></html>`,
      {
        status: 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const attr = escapeAttr(target);
  const json = JSON.stringify(target);
  const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="refresh" content="0;url=${attr}"/>
<title>Apertura…</title>
<script>location.replace(${json})</script>
</head>
<body style="font:16px/1.4 system-ui;padding:1.5rem;color:#111">
<p>Apertura nell’app…</p>
<p><a href="${attr}">Tocca qui se non si apre</a></p>
<p style="margin-top:1.5rem"><a href="/">Torna al giornale</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
