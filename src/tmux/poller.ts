import type { TmuxSnapshot } from "../types.ts";
import { collectTmuxSnapshot } from "./snapshot.ts";

export type TmuxPollerHandle = {
  getLatest(): TmuxSnapshot | undefined;
  refreshNow(): Promise<TmuxSnapshot>;
  stop(): void;
};

export function startTmuxPoller(
  sessionName: string,
  intervalMs: number,
  onSnapshot: (snapshot: TmuxSnapshot) => void | Promise<void>,
): TmuxPollerHandle {
  let latest: TmuxSnapshot | undefined;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<TmuxSnapshot> | undefined;

  const runRefresh = async () => {
    const snapshot = await collectTmuxSnapshot(sessionName);
    if (stopped) return snapshot;
    latest = snapshot;
    await onSnapshot(snapshot);
    return snapshot;
  };

  const refreshSerial = async () => {
    if (inFlight) return inFlight;

    inFlight = runRefresh().finally(() => {
      inFlight = undefined;
    });

    return inFlight;
  };

  const tick = () => {
    void refreshSerial().catch((error) => {
      console.error("tmux poller refresh failed", error);
    });
  };

  tick();
  timer = setInterval(tick, intervalMs);

  return {
    getLatest() {
      return latest;
    },
    refreshNow() {
      return refreshSerial();
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
