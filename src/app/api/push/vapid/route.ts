import { getVapidPublicKey } from "@/lib/push/send";

export const dynamic = "force-dynamic";

/** Public VAPID key for PushManager.subscribe — safe to expose. */
export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return Response.json(
      { ok: false, error: "VAPID_PUBLIC_KEY non configurata" },
      { status: 503 },
    );
  }
  return Response.json({ ok: true, publicKey });
}
