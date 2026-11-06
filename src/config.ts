import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type NotificationDelivery = "followUp" | "steer";
export const DEFAULT_NOTIFICATION_DELIVERY: NotificationDelivery = "followUp";

type DeliveryConfig = { notificationDelivery: NotificationDelivery; warning?: string };

export function parseDeliveryConfig(value: unknown): DeliveryConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { notificationDelivery: DEFAULT_NOTIFICATION_DELIVERY, warning: "Expected a JSON object." };
  }
  const config = value as Record<string, unknown>;
  if (Object.keys(config).some((key) => key !== "notificationDelivery")) {
    return { notificationDelivery: DEFAULT_NOTIFICATION_DELIVERY, warning: "Only notificationDelivery is supported." };
  }
  if (!Object.hasOwn(config, "notificationDelivery")) {
    return { notificationDelivery: DEFAULT_NOTIFICATION_DELIVERY };
  }
  if (config.notificationDelivery === "followUp" || config.notificationDelivery === "steer") {
    return { notificationDelivery: config.notificationDelivery };
  }
  return { notificationDelivery: DEFAULT_NOTIFICATION_DELIVERY, warning: 'notificationDelivery must be "followUp" or "steer".' };
}

export async function loadDeliveryConfig(cwd: string): Promise<DeliveryConfig> {
  const path = join(cwd, ".pi", "tmux-task.json");
  let result: DeliveryConfig;
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    result = parseDeliveryConfig(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { notificationDelivery: DEFAULT_NOTIFICATION_DELIVERY };
    }
    result = { notificationDelivery: DEFAULT_NOTIFICATION_DELIVERY, warning: `Cannot read valid JSON: ${String(error)}` };
  }
  if (result.warning) result.warning = `tmux-task: ${path}: ${result.warning} Using followUp. Fix the file and /reload.`;
  return result;
}
