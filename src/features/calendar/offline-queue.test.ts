import { describe, expect, it } from "vitest";
import { addMove, parseQueue } from "./offline-queue";

const move = (id: string, version: number, start: number) => ({ id, title: id, version, start, end: start + 1 });

describe("offline move queue", () => {
  it("keeps one move per event with the first base version", () => {
    let queue = addMove([], move("a", 3, 10));
    queue = addMove(queue, move("b", 1, 20));
    queue = addMove(queue, move("a", 4, 30));
    expect(queue).toEqual([move("b", 1, 20), { ...move("a", 3, 30) }]);
  });

  it("ignores broken storage contents", () => {
    expect(parseQueue("not json")).toEqual([]);
    expect(parseQueue('[{"id":1}]')).toEqual([]);
    expect(parseQueue(null)).toEqual([]);
    expect(parseQueue(JSON.stringify([move("a", 1, 5)]))).toEqual([move("a", 1, 5)]);
  });
});
