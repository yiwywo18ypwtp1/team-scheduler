// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { rruleToRecurrence } from "@/lib/recurrence/rule";
import { newEventFormValues } from "../form-values";
import type { EventFormValues } from "../schema";
import { RecurrenceField } from "./RecurrenceField";

// Starts Mon, Oct 12, 2026 at 10:00 Kyiv (the next half hour after 09:40).
const base = newEventFormValues({
  now: Date.parse("2026-10-12T06:40:00Z"),
  timeZone: "Europe/Kyiv",
  currentUserId: "mem_01",
});

function Editor({ defaults }: { defaults: EventFormValues }) {
  const { control, register } = useForm<EventFormValues>({ defaultValues: defaults });
  return <RecurrenceField control={control} register={register} />;
}

describe("RecurrenceField", () => {
  it("builds 'every 2 weeks on Mon and Wed, 10 times' with a summary and the next 5 dates", async () => {
    const user = userEvent.setup();
    render(<Editor defaults={base} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Repeat" }), "weekly");
    const interval = screen.getByRole("spinbutton", { name: "Interval" });
    await user.clear(interval);
    await user.type(interval, "2");
    await user.click(screen.getByRole("checkbox", { name: "Wed" }));
    await user.click(screen.getByRole("radio", { name: /After/ }));
    const count = screen.getByRole("spinbutton", { name: "Number of occurrences" });
    await user.clear(count);
    await user.type(count, "10");

    expect(screen.getByText("Every 2 weeks on Mon, Wed, 10 times")).toBeInTheDocument();
    const dates = within(screen.getByRole("list")).getAllByRole("listitem").map((item) => item.textContent);
    expect(dates).toEqual([
      "Mon, Oct 12, 2026 · 10:00",
      "Wed, Oct 14, 2026 · 10:00",
      "Mon, Oct 26, 2026 · 10:00",
      "Wed, Oct 28, 2026 · 10:00",
      "Mon, Nov 9, 2026 · 10:00",
    ]);
  });

  it("always includes the start day in a weekly rule", async () => {
    const user = userEvent.setup();
    render(<Editor defaults={base} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeat" }), "weekly");
    const monday = screen.getByRole("checkbox", { name: "Mon" });
    expect(monday).toBeChecked();
    expect(monday).toBeDisabled();
  });

  it("parses an existing RRULE back into the editor", () => {
    const tuesday = { ...base, startDate: "2026-10-13", endDate: "2026-10-13" };
    render(<Editor defaults={{ ...tuesday, recurrence: rruleToRecurrence("FREQ=MONTHLY;BYDAY=2TU;COUNT=3", "2026-10-13") }} />);

    expect(screen.getByRole("combobox", { name: "Repeat" })).toHaveValue("monthly");
    expect(screen.getByRole("combobox", { name: "Monthly on" })).toHaveValue("nthWeekday");
    expect(screen.getByText("Every month on the 2nd Tuesday, 3 times")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
  });

  it("skips months without the 31st and says so", async () => {
    const user = userEvent.setup();
    render(<Editor defaults={{ ...base, startDate: "2027-01-31", endDate: "2027-01-31" }} />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeat" }), "monthly");
    expect(screen.getByText(/months without it are skipped/)).toBeInTheDocument();
    const dates = within(screen.getByRole("list")).getAllByRole("listitem").map((item) => item.textContent);
    expect(dates.some((date) => date?.startsWith("Sun, Feb") || date?.includes("Feb"))).toBe(false);
  });
});
