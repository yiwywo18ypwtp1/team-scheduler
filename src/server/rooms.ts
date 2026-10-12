import "server-only";
import type { Room } from "@/types/domain";
import { getDb } from "./db";

export function listRooms(): Room[] {
  return getDb().prepare("SELECT id, name, capacity FROM rooms ORDER BY capacity, name").all() as Room[];
}
