import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { TriggeredAlert } from "../db/alerts";

let configured = false;

async function ensureReady(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!configured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    configured = true;
  }
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** Show local notifications for triggered price alerts. */
export async function notifyTriggeredAlerts(alerts: TriggeredAlert[]): Promise<void> {
  if (alerts.length === 0) return;
  if (!(await ensureReady())) return;

  for (const t of alerts) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${t.cardName} ${t.alert.direction === "above" ? "hit" : "dropped to"} $${t.currentPrice.toFixed(2)}`,
        body: `Your alert: ${t.alert.direction} $${t.alert.threshold.toFixed(2)}`,
      },
      trigger: null,
    });
  }
}
