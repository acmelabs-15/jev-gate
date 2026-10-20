/**
 * The call to Jev and the reading of its answers. The request and response follow TypeSafe's
 * `/v1/systemone` format: `state` plus typed `questions` in, one typed answer per question out.
 */

import type { Config } from "./config";
import type { BlockingSignal, Question, Signal } from "./questions";
import { BLOCKING } from "./questions";

export type JevAnswer = {
  type: "noul" | "score" | "choice";
  noul?: number;
  score?: number;
  probabilities?: Record<string, number>;
  confidence?: number;
};

export type Answers = Record<string, JevAnswer>;

export type Scores = Partial<Record<Signal, number>>;

const ERROR_BODY_CHARS = 200;

/** Posts one request. Throws on a timeout, a non-2xx status, or a body with no answers. */
export async function callJev(
  config: Config,
  state: unknown,
  questions: Record<string, Question>,
): Promise<Answers> {
  const response = await fetch(`${config.baseUrl}/v1/systemone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: config.model, state, questions }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    const body = raw.slice(0, ERROR_BODY_CHARS);
    throw new Error(`HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }
  const data = (await response.json()) as { answers?: unknown };
  if (data.answers === null || typeof data.answers !== "object") {
    throw new Error("response had no answers");
  }
  return data.answers as Answers;
}

/** One number from 0 to 1 per signal. A score answer is divided by its top level. */
export function toScores(answers: Answers, questions: Record<string, Question>): Scores {
  const scores: Scores = {};
  for (const [id, question] of Object.entries(questions)) {
    const answer = answers[id];
    if (question.type === "noul" && typeof answer?.noul === "number") {
      scores[id as Signal] = answer.noul;
    }
    if (question.type === "score" && typeof answer?.score === "number") {
      const top = question.criteria.length - 1;
      scores[id as Signal] = top > 0 ? answer.score / top : answer.score;
    }
  }
  return scores;
}

/** The blocking signals at or above the threshold. */
export function flaggedSignals(scores: Scores, threshold: number): BlockingSignal[] {
  return BLOCKING.filter((signal) => (scores[signal] ?? 0) >= threshold);
}
