import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@/shared/types";
import { usePlayerStore } from "../store/playerStore";
import { QueueMemory } from "./queueMemory";
import { ShuffleControl } from "./shuffleControl";
import type { SmartShuffle } from "./smartShuffle";

const track = (id: string, queueSource?: Track["queueSource"]): Track => ({ id, title: id, artists: "", durationMs: 1, coverUrl: "", playCount: 0, queueSource });
const queueIds = () => usePlayerStore.getState().queue.map((item) => item.id);

describe("ShuffleControl", () => {
  let memory: QueueMemory;
  let smartSlots: { fill: ReturnType<typeof vi.fn> };
  let control: ShuffleControl;
  const queue = ["a", "b", "c", "d", "e", "f"].map((id) => track(id));

  beforeEach(() => {
    usePlayerStore.setState({ queue, currentIndex: 0, currentTrack: queue[0], shuffle: false, smartShuffle: false, playbackContext: "album:1" });
    memory = new QueueMemory();
    memory.remember(queue, []);
    smartSlots = { fill: vi.fn().mockResolvedValue(undefined) };
    control = new ShuffleControl({ memory, smartSlots: smartSlots as unknown as SmartShuffle, onQueueChanged: vi.fn() });
  });

  it("shuffles after the current track and restores the order when turned off", () => {
    control.setShuffle(true);
    expect(queueIds()[0]).toBe("a");
    expect([...queueIds()].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    control.setShuffle(false);
    expect(queueIds()).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("cycles off, shuffle, smart shuffle and back", () => {
    control.cycle();
    expect(usePlayerStore.getState()).toMatchObject({ shuffle: true, smartShuffle: false });
    control.cycle();
    expect(usePlayerStore.getState()).toMatchObject({ shuffle: true, smartShuffle: true });
    expect(smartSlots.fill).toHaveBeenCalled();
    control.cycle();
    expect(usePlayerStore.getState()).toMatchObject({ shuffle: false, smartShuffle: false });
  });

  it("skips smart shuffle on a station", () => {
    usePlayerStore.setState({ playbackContext: "radio:seed" });
    control.cycle();
    control.cycle();
    expect(usePlayerStore.getState()).toMatchObject({ shuffle: false, smartShuffle: false });
  });

  it("takes the upcoming smart picks out when smart shuffle ends", () => {
    usePlayerStore.setState({ shuffle: true, smartShuffle: true, queue: [track("a"), track("p", "smart"), track("b")] });
    control.setSmartShuffle(false);
    expect(queueIds()).toEqual(["a", "b"]);
  });
});
