import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import test from "node:test";

test("concurrent native construction keeps transitive runtime artifacts fixture-local", { timeout: 300_000 }, async () => {
  const [first, second] = await Promise.all([
    construct("parallel-construction-first"),
    construct("parallel-construction-second"),
  ]);
  assert.notEqual(first.fixtureRoot, second.fixtureRoot);
  assert.notEqual(first.artifactRoot, second.artifactRoot);
});

function construct(name) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../fixtures/native-construction-isolation.mjs", import.meta.url), {
      workerData: { name },
      env: { ...process.env, DOTNET_PROCESSOR_COUNT: "1" },
    });
    let result;
    let failure;
    worker.once("message", (message) => { result = message; });
    worker.once("error", (error) => { failure = error; });
    worker.once("exit", (code) => {
      if (failure !== undefined) reject(failure);
      else if (code !== 0) reject(new Error(`Parallel native construction exited ${code}.`));
      else if (result === undefined) reject(new Error("Parallel native construction produced no result."));
      else resolve(result);
    });
  });
}
