import type { TmuxSnapshot } from "../types.ts";
import { collectTmuxSnapshot } from "./snapshot.ts";

export type TmuxPollerHandle = {
  getLatest(): TmuxSnapshot | undefined;
  refreshNow(afterInFlight?: boolean): Promise<TmuxSnapshot>;
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

  const refreshSerial = async (afterInFlight = false): Promise<TmuxSnapshot> => {
    if (inFlight) {
      if (!afterInFlight) return inFlight;
      // A launch result needs a read begun after it arrived, not a pre-launch read.
      await inFlight;
      return refreshSerial();
    }

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
    refreshNow(afterInFlight = false) {
      return refreshSerial(afterInFlight);
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
