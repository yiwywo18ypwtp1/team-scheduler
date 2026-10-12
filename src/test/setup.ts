import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount rendered components between tests (no-op in node-only test files).
afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
