import "server-only";
import type { Member } from "@/types/domain";
import { db } from "./db";

export function listMembers(): Member[] {
  return db.members;
}

export function getMember(id: string): Member | undefined {
  return db.members.find((member) => member.id === id);
}
