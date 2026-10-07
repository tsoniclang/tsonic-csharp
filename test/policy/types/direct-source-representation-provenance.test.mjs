import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCsharpObjectShapeMemberReadTargetType,
} from "../../../dist/policy/types/index.js";
import {
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";
import { csharpStringTargetType } from "../../../dist/target-model/types/scalar-types.js";
import { csharpTsValueTargetType } from "../../../dist/target-model/types/runtime-carriers.js";

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
  assert.deepEqual(compiled.targetDiagnostics, []);
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
    /public interface ObjectShape_[a-f0-9]{12}<Property0, Property1>\s*\{\s*Property0 label \{ get; set; \}\s*Property1 x \{ get; set; \}/u,
  );
  assert.match(compiled.artifacts.get("src/Index.cs"), /ObjectShape_[a-f0-9]{12}<string, int>/u);
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

test("a checked native string read projects its original reference out of an opaque provider slot", () => {
  const source = {};
  const other = {};
  const string = csharpStringTargetType();
  const storage = csharpTsValueTargetType();
  const member = { sourceName: "checked", sourceTypes: [source], targetName: "native",
    memberKind: "property", type: storage };
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, source, undefined, string) === string,
    true, "a checked reference read remains native string, not a dynamic operation");
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, other, undefined, string) === undefined,
    true, "target expectation alone cannot manufacture source correspondence");
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, source) === storage,
    true, "unrefined unknown provider reads retain their exact opaque storage");
  const integer = { kind: "source-primitive", name: "int64" };
  assert.equal(resolveCsharpObjectShapeMemberReadTargetType(member, source, undefined, integer) === storage,
    true, "opaque numeric fields cannot acquire speculative native storage");
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
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /int\[\] returned =/u,
  );
  assert.match(
    compiled.artifacts.get("src/Index.cs"),
    /return \$"\{first\}:\{returned\[1\]\}";/u,
  );
});
