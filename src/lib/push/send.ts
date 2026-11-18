import webpush from "web-push";
import {
  listPushSubscriptions,
  removePushSubscription,
  type PushSubscriptionJSON,
} from "@/lib/push/subscriptions";

export type PushNotifyResult = {
  configured: boolean;
  sent: number;
  failed: number;
  removed: number;
};

function vapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  if (!publicKey || !privateKey) return null;
  const subject =
    (process.env.VAPID_SUBJECT ?? "").trim() ||
    "mailto:the-daily-tailor@localhost";
  return { publicKey, privateKey, subject };
}

export function getVapidPublicKey(): string | null {
  return vapidConfig()?.publicKey ?? null;
}

/**
 * After morning-warm: wake subscribed iPhone PWAs so the service worker
 * can download today's edition into Cache API + IndexedDB before the
 * first tap of the day.
 */
export async function notifyEditionReady(input: {
  dateKey: string;
  productName: string;
}): Promise<PushNotifyResult> {
  const vapid = vapidConfig();
  if (!vapid) {
    return { configured: false, sent: 0, failed: 0, removed: 0 };
  }

  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const subs = await listPushSubscriptions();
  if (subs.length === 0) {
    return { configured: true, sent: 0, failed: 0, removed: 0 };
  }

  const payload = JSON.stringify({
    type: "edition-ready",
    dateKey: input.dateKey,
    title: input.productName,
    body: `Edizione ${input.dateKey} pronta offline`,
    url: "/",
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub: PushSubscriptionJSON) => {
      try {
        await webpush.sendNotification(sub, payload, {
          TTL: 60 * 60 * 12,
          urgency: "high",
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        // Gone / expired subscription — drop it.
        if (status === 404 || status === 410) {
          await removePushSubscription(sub.endpoint);
          removed += 1;
        }
      }
    }),
  );

  return { configured: true, sent, failed, removed };
}
