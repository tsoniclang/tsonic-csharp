import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCsharpObjectShapeMemberReadTargetType,
} from "../dist/policy/types/index.js";
import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("object-shape reads retain exact authored member carriers through utility projections", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      type Point = { x: int; y: int; label: string };
      type Summary = Pick<Point, "x" | "label">;
      type Payload = { extra: int; run(value: int): int };
      export function summarize(value: Summary): string {
        return \`${"${value.label}:${value.x}"}\`;
      }
      export function inspect({ ...rest }: Payload): int {
        return rest.run(rest.extra);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /return \$"\{value\.label\}:\{value\.x\}";/u,
  );
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /return rest\.run\(rest\.extra\);/u,
  );
  assert.match(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    /public required int x;/u,
  );
  assert.match(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    /public required Func<int, int> __tsonic_shape_method_\d+_run;/u,
  );
});

test("object-shape read provenance fails closed for a different selected source type", () => {
  const exactSourceType = {};
  const unrelatedSourceType = {};
  const targetType = { kind: "source-primitive", name: "int32" };
  const member = {
    sourceName: "value",
    sourceTypes: [exactSourceType],
    targetName: "value",
    memberKind: "property",
    type: targetType,
  };

  assert.strictEqual(
    resolveCsharpObjectShapeMemberReadTargetType(member, exactSourceType),
    targetType,
  );
  assert.equal(
    resolveCsharpObjectShapeMemberReadTargetType(member, unrelatedSourceType),
    undefined,
  );
});

test("destructuring assignment expressions retain the right-hand value carrier", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function assign(values: int[]): string {
        let first: int = 0;
        const returned = ([first] = values);
        return \`${"${first}:${returned[1]}"}\`;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.result.diagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /int\[\] returned =/u,
  );
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /return \$"\{first\}:\{returned\[1\]\}";/u,
  );
});
