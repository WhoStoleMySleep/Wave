import { describe, expect, it } from "vitest";
import { TaskQueue } from "./taskQueue";

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe("TaskQueue", () => {
  it("runs no more tasks at once than its limit", async () => {
    const queue = new TaskQueue(2);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const runs = gates.map((gate, index) =>
      queue.run(async () => {
        started.push(index);
        await gate.promise;
      }),
    );
    expect(started).toEqual([0, 1]);
    gates[0].resolve();
    await runs[0];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    gates[1].resolve();
    gates[2].resolve();
    await Promise.all(runs);
  });

  it("starts an urgent task before the waiting ones", async () => {
    const queue = new TaskQueue(1);
    const gate = deferred();
    const started: string[] = [];
    const first = queue.run(() => gate.promise);
    const later = queue.run(async () => void started.push("later"));
    const urgent = queue.run(async () => void started.push("urgent"), { urgent: true });
    gate.resolve();
    await Promise.all([first, later, urgent]);
    expect(started).toEqual(["urgent", "later"]);
  });

  it("goes on after a task fails", async () => {
    const queue = new TaskQueue(1);
    const failed = queue.run(() => Promise.reject(new Error("no")));
    const next = queue.run(async () => "ok");
    await expect(failed).rejects.toThrow("no");
    await expect(next).resolves.toBe("ok");
  });
});
