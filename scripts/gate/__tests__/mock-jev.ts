/**
 * A stand-in for `/v1/systemone`. It answers from keywords in the state, so a test can say which
 * signal it expects to fire. `mode` switches it to the failures the gate must fail open on.
 */

export type MockMode = "normal" | "slow" | "error500" | "garbage";

export type MockJev = {
  url: string;
  setMode: (mode: MockMode) => void;
  lastBody: () => MockBody | undefined;
  stop: () => void;
};

export type MockBody = {
  model: string;
  state: Record<string, unknown> & { tool_input: Record<string, unknown>; user_request?: string };
  questions: Record<string, { type: string; criteria?: unknown }>;
};

const SLOW_MS = 3000;

function answersFor(body: MockBody): Record<string, unknown> {
  const state = JSON.stringify(body.state);
  const answers: Record<string, unknown> = {
    destructive: {
      type: "noul",
      noul: /rm -rf|reset --hard|push --force/u.test(state) ? 0.97 : 0.03,
    },
    exfiltration: { type: "noul", noul: /curl -d|curl --data/u.test(state) ? 0.95 : 0.02 },
    secrets: { type: "noul", noul: /\.env|id_rsa/u.test(state) ? 0.93 : 0.05 },
    risk: {
      type: "score",
      score: /rm -rf/u.test(state) ? 3 : 0,
      probabilities: { "0": 0.9, "1": 0.1, "2": 0, "3": 0 },
      confidence: 0.8,
    },
  };
  if (body.questions.off_task !== undefined) {
    answers.off_task = { type: "noul", noul: 0.1 };
  }
  return answers;
}

export function startMockJev(): MockJev {
  let mode: MockMode = "normal";
  let last: MockBody | undefined;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname !== "/v1/systemone") {
        return new Response("not found", { status: 404 });
      }
      last = (await request.json()) as MockBody;
      if (mode === "slow") {
        await Bun.sleep(SLOW_MS);
      }
      if (mode === "error500") {
        return new Response("boom", { status: 500 });
      }
      if (mode === "garbage") {
        return new Response("not json", { status: 200 });
      }
      return Response.json({ object: "decision", model: "jev-1.13.0", answers: answersFor(last) });
    },
  });
  return {
    url: `http://localhost:${server.port}`,
    setMode: (next) => {
      mode = next;
    },
    lastBody: () => last,
    stop: () => {
      server.stop(true);
    },
  };
}
