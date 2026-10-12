import "server-only";
import type { Member } from "@/types/domain";
import { getDb, memberFromRow, type MemberRow } from "./db";

export function listMembers(): Member[] {
  const rows = getDb().prepare("SELECT * FROM members ORDER BY name").all() as MemberRow[];
  return rows.map(memberFromRow);
}

export function getMember(id: string): Member | undefined {
  const row = getDb().prepare("SELECT * FROM members WHERE id = ?").get(id) as
    | MemberRow
    | undefined;
  return row && memberFromRow(row);
}
