// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BookingPage } from "@/types/domain";
import { settingsToBuilder } from "../builder";
import { QuestionnaireBuilder } from "./QuestionnaireBuilder";

const save = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, data: null })));
// The Server Action module imports server-only code; the builder only needs the call.
vi.mock("../actions", () => ({ saveBookingPageAction: save }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const page: BookingPage = {
  slug: "intro",
  ownerId: "mem_01",
  title: "Intro",
  durationOptions: [30],
  bufferBefore: 0,
  bufferAfter: 0,
  minNotice: 60,
  horizonDays: 14,
  questions: [
    { id: "name", kind: "text", label: "Name", required: true, maxLength: 100 },
    { id: "topic", kind: "select", label: "Topic", required: true, options: ["Pricing", "Other"], multiple: false },
  ],
};

const card = (n: number) => screen.getByRole("listitem", { name: `Question ${n}` });
const preview = () => screen.getByRole("complementary", { name: "Preview" });

describe("QuestionnaireBuilder", () => {
  it("changing a question's type replaces its fields and the preview follows", async () => {
    const user = userEvent.setup();
    render(<QuestionnaireBuilder slug="intro" defaultValues={settingsToBuilder(page)} />);

    expect(within(card(2)).getByRole("textbox", { name: "Option 1" })).toHaveValue("Pricing");
    expect(within(preview()).getByRole("combobox", { name: /Topic/ })).toBeInTheDocument();

    await user.selectOptions(within(card(2)).getByRole("combobox", { name: "Question type" }), "text");
    expect(within(card(2)).queryByRole("textbox", { name: "Option 1" })).not.toBeInTheDocument();
    expect(within(card(2)).getByText("Max length")).toBeInTheDocument();
    expect(within(preview()).getByRole("textbox", { name: /Topic/ })).toBeInTheDocument();

    // Back to a choice: fresh default options, not the old ones.
    await user.selectOptions(within(card(2)).getByRole("combobox", { name: "Question type" }), "select");
    expect(within(card(2)).getByRole("textbox", { name: "Option 1" })).toHaveValue("Option 1");
  });

  it("rejects duplicate options at that question and doesn't save", async () => {
    const user = userEvent.setup();
    render(<QuestionnaireBuilder slug="intro" defaultValues={settingsToBuilder(page)} />);

    const second = within(card(2)).getByRole("textbox", { name: "Option 2" });
    await user.clear(second);
    await user.type(second, "Pricing");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await within(card(2)).findByText("Options must be unique")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("flags a condition that points to a later question after reordering", async () => {
    const user = userEvent.setup();
    render(<QuestionnaireBuilder slug="intro" defaultValues={settingsToBuilder(page)} />);

    await user.click(within(card(2)).getByRole("button", { name: "Show only if…" }));
    await user.selectOptions(within(card(2)).getByRole("combobox", { name: "Depends on question" }), "name");
    await user.type(within(card(2)).getByRole("textbox", { name: "Expected answer" }), "Bob");
    await user.click(within(card(2)).getByRole("button", { name: "Move up" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await within(card(1)).findByText("Must refer to an earlier question")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
