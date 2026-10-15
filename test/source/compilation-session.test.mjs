import assert from "node:assert/strict";
import test from "node:test";
import { createCsharpTargetPack } from "../../dist/index.js";

test("the C# compilation session enforces one ordered lifecycle and idempotent close", () => {
  const pack = createCsharpTargetPack();
  const target = { id: "csharp", options: {} };
  const first = pack.createCompilationSession(sessionContext(target));

  assert.throws(
    () => first.sourceCompilerContributions(),
    /expected 'profile-contributed'/u,
  );
  first.close();
  first.close();
  assert.throws(
    () => first.sourceProfileContributions(),
    /while in 'closed'/u,
  );

  const second = pack.createCompilationSession(sessionContext(target));
  second.sourceProfileContributions();
  assert.throws(
    () => second.sourceProfileContributions(),
    /expected 'created'/u,
  );
  assert.throws(
    () => second.runtimeContributions(),
    /expected 'compiler-contributed'/u,
  );
  second.sourceCompilerContributions();
  assert.throws(
    () => second.sourceCompilerContributions(),
    /expected 'profile-contributed'/u,
  );
  assert.throws(
    () => second.compile(undefined),
    /expected 'runtime-contributed'/u,
  );
  second.close();
});

test("the C# compilation session rejects foreign capability payloads before provider setup", () => {
  const pack = createCsharpTargetPack();
  const context = sessionContext({ id: "csharp", options: {} });

  assert.throws(
    () => pack.createCompilationSession({
      ...context,
      capabilities: [{
        capabilityId: "foreign.capability",
        moduleOwnership: [],
        contributions: [{ kind: "foreign-policy" }],
      }],
    }),
    /unsupported target contribution kind 'foreign-policy'/u,
  );
});

function sessionContext(target) {
  return {
    project: { entryPoint: "src/index.ts", targets: [target] },
    projectDirectory: process.cwd(),
    target,
    paths: {
      projectFilePath: `${process.cwd()}/tsonic.json`,
      projectRoot: process.cwd(),
      outputRoot: `${process.cwd()}/out`,
      targetOutputRoot: `${process.cwd()}/out/csharp`,
      cacheRoot: `${process.cwd()}/.temp/compilation-session-cache`,
    },
    selectedSurfaceIds: [],
    capabilities: [],
  };
}
