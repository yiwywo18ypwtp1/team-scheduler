import "server-only";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import { DomainError } from "@/lib/errors";

const mockEnvSchema = z.object({
  MOCK_LATENCY_MS: z.coerce.number().int().min(0).default(0),
  MOCK_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
});

/**
 * Simulates a slow, unreliable network for the mock API.
 *
 * Called at the start of Route Handlers and Server Actions, i.e. wherever the
 * browser talks to the server. Server Component reads skip it, so a random
 * failure can't take down a whole page.
 *
 * `extraLatencyMs` adds a random delay on top of MOCK_LATENCY_MS
 * (the spec asks for 300-1200 ms on /api/availability).
 */
export async function simulateNetwork(extraLatencyMs?: { min: number; max: number }) {
  // Empty env vars count as "not set".
  const env = mockEnvSchema.parse({
    MOCK_LATENCY_MS: process.env.MOCK_LATENCY_MS || undefined,
    MOCK_FAILURE_RATE: process.env.MOCK_FAILURE_RATE || undefined,
  });

  const extra = extraLatencyMs
    ? extraLatencyMs.min + Math.random() * (extraLatencyMs.max - extraLatencyMs.min)
    : 0;
  const delay = env.MOCK_LATENCY_MS + extra;
  if (delay > 0) await sleep(delay);

  if (Math.random() < env.MOCK_FAILURE_RATE) {
    throw new DomainError("MOCK_FAILURE", "Simulated network failure, please retry");
  }
}
