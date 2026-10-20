import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";

import { readConfig } from "../config";
import { callJev, flaggedSignals, toScores } from "../jev";
import { buildQuestions } from "../questions";
import type { MockJev } from "./mock-jev";
import { startMockJev } from "./mock-jev";

let jev: MockJev;

beforeAll(() => {
  jev = startMockJev();
});

afterAll(() => {
  jev.stop();
});

beforeEach(() => {
  jev.setMode("normal");
});

describe("callJev", () => {
  test("sends the bearer key, the model, the state and the questions", async () => {
    const config = readConfig({ JEV_API_KEY: "k", JEV_BASE_URL: jev.url, JEV_MODEL: "m" });
    const answers = await callJev(config, { tool_name: "Bash" }, buildQuestions(false));
    expect(jev.lastBody()?.model).toBe("m");
    expect(answers.destructive?.noul).toBe(0.03);
  });

  test("a non-2xx status throws with the status", async () => {
    jev.setMode("error500");
    const config = readConfig({ JEV_API_KEY: "k", JEV_BASE_URL: jev.url });
    await expect(callJev(config, {}, buildQuestions(false))).rejects.toThrow("HTTP 500: boom");
  });
});

describe("toScores", () => {
  test("a noul passes through and a score is divided by its top level", () => {
    const questions = buildQuestions(false);
    const scores = toScores(
      { destructive: { type: "noul", noul: 0.4 }, risk: { type: "score", score: 1.5 } },
      questions,
    );
    expect(scores).toEqual({ destructive: 0.4, risk: 0.5 });
  });

  test("an answer missing from the response is left out", () => {
    expect(toScores({}, buildQuestions(true))).toEqual({});
  });
});

describe("flaggedSignals", () => {
  test("returns blocking signals at or above the threshold, never risk", () => {
    expect(flaggedSignals({ destructive: 0.9, secrets: 0.89, risk: 1 }, 0.9)).toEqual([
      "destructive",
    ]);
  });
});
