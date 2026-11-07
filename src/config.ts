import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

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

async function readDeliveryConfig(path: string): Promise<Partial<DeliveryConfig>> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    const result = parseDeliveryConfig(value);
    if (result.warning) return { warning: `tmux-task: ${path}: ${result.warning}` };
    // An empty layer inherits the lower-precedence value.
    return Object.hasOwn(value as object, "notificationDelivery") ? result : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    return { warning: `tmux-task: ${path}: Cannot read valid JSON: ${String(error)}` };
  }
}

export async function loadDeliveryConfig(cwd: string, agentDir = getAgentDir()): Promise<DeliveryConfig> {
  let notificationDelivery = DEFAULT_NOTIFICATION_DELIVERY;
  const warnings: string[] = [];
  for (const path of [join(agentDir, "tmux-task.json"), join(cwd, ".pi", "tmux-task.json")]) {
    const config = await readDeliveryConfig(path);
    if (config.warning) warnings.push(config.warning);
    if (config.notificationDelivery) notificationDelivery = config.notificationDelivery;
  }
  return {
    notificationDelivery,
    ...(warnings.length ? { warning: `${warnings.join("\n")} Using ${notificationDelivery}. Fix the file and /reload.` } : {}),
  };
}
