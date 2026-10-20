import { describe, expect, test } from "bun:test";

import { BLOCKING, buildQuestions } from "../questions";

describe("buildQuestions", () => {
  test("without a user request there is no off-task question", () => {
    expect(Object.keys(buildQuestions(false)).toSorted()).toEqual([
      "destructive",
      "exfiltration",
      "risk",
      "secrets",
    ]);
  });

  test("with a user request the off-task question is added", () => {
    expect(buildQuestions(true).off_task?.type).toBe("noul");
  });

  test("every blocking signal is a noul, and risk is a four-level score", () => {
    const questions = buildQuestions(true);
    for (const signal of BLOCKING) {
      expect(questions[signal]?.type).toBe("noul");
    }
    const { risk } = questions;
    expect(risk?.type).toBe("score");
    expect(risk?.type === "score" ? risk.criteria : []).toHaveLength(4);
  });

  test("the request stays within systemone's limit of 10 questions", () => {
    expect(Object.keys(buildQuestions(true)).length).toBeLessThanOrEqual(10);
  });
});
