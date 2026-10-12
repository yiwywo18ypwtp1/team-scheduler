// @vitest-environment jsdom
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Question } from "@/types/domain";
import { buildAnswersSchema, emptyAnswers } from "../answers";
import { QuestionFields } from "./QuestionFields";

const questions: Question[] = [
  { id: "name", kind: "text", label: "Name", required: true, maxLength: 50 },
  { id: "topic", kind: "select", label: "Topic", required: true, options: ["Pricing", "Other"], multiple: false },
  { id: "details", kind: "text", label: "Details", required: true, maxLength: 200, showIf: { questionId: "topic", equals: "Other" } },
];

function DynamicForm({ onSubmit }: { onSubmit: (values: unknown) => void }) {
  const schema = z.object({ answers: buildAnswersSchema(questions) });
  const { control, handleSubmit } = useForm({ resolver: zodResolver(schema), defaultValues: { answers: emptyAnswers(questions) } });
  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <QuestionFields questions={questions} control={control} name="answers" />
      <button type="submit">Send</button>
    </form>
  );
}

describe("QuestionFields (runtime questionnaire)", () => {
  it("shows the conditional question only for the matching answer", async () => {
    const user = userEvent.setup();
    render(<DynamicForm onSubmit={vi.fn()} />);
    expect(screen.queryByLabelText(/Details/)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Topic/), "Other");
    expect(screen.getByLabelText(/Details/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Topic/), "Pricing");
    expect(screen.queryByLabelText(/Details/)).not.toBeInTheDocument();
  });

  it("doesn't validate or submit a hidden required question", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DynamicForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/Name/), "Olena");
    await user.selectOptions(screen.getByLabelText(/Topic/), "Other");
    await user.type(screen.getByLabelText(/Details/), "left over");
    await user.selectOptions(screen.getByLabelText(/Topic/), "Pricing"); // hides Details again
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ answers: { name: "Olena", topic: "Pricing" } });
  });

  it("blocks submit when the conditional question is shown and empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DynamicForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/Name/), "Olena");
    await user.selectOptions(screen.getByLabelText(/Topic/), "Other");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("This question is required")).toBeInTheDocument();
    expect(screen.getByLabelText(/Details/)).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
