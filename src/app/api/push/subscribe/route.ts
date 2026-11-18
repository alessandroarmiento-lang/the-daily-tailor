import {
  removePushSubscription,
  savePushSubscription,
  type PushSubscriptionJSON,
} from "@/lib/push/subscriptions";
import { getVapidPublicKey } from "@/lib/push/send";

export const dynamic = "force-dynamic";

function asSubscription(body: unknown): PushSubscriptionJSON | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const endpoint = typeof o.endpoint === "string" ? o.endpoint : "";
  const keys = o.keys;
  if (!endpoint || !keys || typeof keys !== "object") return null;
  const k = keys as Record<string, unknown>;
  const p256dh = typeof k.p256dh === "string" ? k.p256dh : "";
  const auth = typeof k.auth === "string" ? k.auth : "";
  if (!p256dh || !auth) return null;
  return {
    endpoint,
    expirationTime:
      typeof o.expirationTime === "number" ? o.expirationTime : null,
    keys: { p256dh, auth },
  };
}

/** Register this device for the 06:00 edition-ready push. */
export async function POST(request: Request) {
  if (!getVapidPublicKey()) {
    return Response.json(
      { ok: false, error: "Push non configurato su questo host" },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON non valido" }, { status: 400 });
  }
  const sub = asSubscription(body);
  if (!sub) {
    return Response.json(
      { ok: false, error: "Subscription non valida" },
      { status: 400 },
    );
  }
  await savePushSubscription(sub);
  return Response.json({ ok: true });
}

/** Drop a subscription (permission revoked / unsubscribe). */
export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "JSON non valido" }, { status: 400 });
  }
  const endpoint =
    body && typeof body === "object" && "endpoint" in body
      ? String((body as { endpoint?: unknown }).endpoint ?? "")
      : "";
  if (!endpoint) {
    return Response.json({ ok: false, error: "endpoint mancante" }, { status: 400 });
  }
  await removePushSubscription(endpoint);
  return Response.json({ ok: true });
}
