import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTestWorkspace } from "../../../../../tsonic/test/scripts/test-workspaces.mjs";
import {
  csharpRuntimeNativeArrayTargetType, csharpRuntimeNativeLayoutTargetType,
  csharpRuntimeRecordFieldTargetType,
} from "../../../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpTypeFromTargetTypeRef } from "../../../../dist/backend/planner/types/target-types.js";
import { planCsharpNativeMemoryCall } from "../../../../dist/backend/planner/expressions/native-memory.js";

test("native runtime type applications preserve their exact C# payload and native AST", () => {
  const value = { kind: "source-primitive", name: "int64" };
  for (const [name, create] of [["RecordField", csharpRuntimeRecordFieldTargetType],
    ["NativeLayout", csharpRuntimeNativeLayoutTargetType], ["NativeArray", csharpRuntimeNativeArrayTargetType]]) {
    const carrier = create(value);
    assert.equal(carrier.typeArguments[0] === value, true, name);
    assert.deepEqual(csharpTypeFromTargetTypeRef(carrier), {
      kind: "QualifiedName", left: { kind: "QualifiedName", left: {
        kind: "QualifiedName", left: { kind: "IdentifierName", name: "Tsonic" }, name: "CSharp",
      }, name: "Runtime" }, name, typeArguments: [{ kind: "PredefinedType", name: "long" }],
    }, name);
    assert.equal(csharpTypeFromTargetTypeRef(create({ kind: "opaque", id: "unrenderable" })) === undefined, true, name);
  }
});

test("native memory static qualification is literal item data and emits the exact existing C# call AST", () => {
  const pointeeType = { kind: "source-primitive", name: "uint32" };
  const layout = { kind: "scalar", pointeeType, size: 4, alignment: 4, width: 64, littleEndian: true, fields: [] };
  const qualifier = { kind: "QualifiedName", left: { kind: "QualifiedName", left: {
    kind: "QualifiedName", left: { kind: "IdentifierName", name: "Tsonic" }, name: "CSharp",
  }, name: "Runtime" }, name: "NativeLocation" };
  const layoutQualifier = { ...qualifier, name: "NativeLayout" };
  const value = { kind: "IdentifierName", name: "value" };
  for (const method of ["Allocate", "ToRaw", "Reinterpret"]) {
    assert.deepEqual(planCsharpNativeMemoryCall(undefined, method, value, layout), {
      kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: qualifier,
        name: method, typeArguments: [{ kind: "PredefinedType", name: "uint" }] },
      arguments: [{ kind: "Argument", expression: value }, { kind: "Argument", expression: {
        kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver: layoutQualifier,
          name: "Scalar", typeArguments: [{ kind: "PredefinedType", name: "uint" }] },
        arguments: [4, 4, 64].map(value => ({ kind: "Argument", expression: { kind: "NumericLiteralExpression", value } }))
          .concat([{ kind: "Argument", expression: { kind: "LiteralExpression", value: true } }]),
      } }],
    }, method);
  }
});

test("native item qualifiers cannot use the removed carrier export or optional layout arity", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const host = path.resolve(root, "../tsonic");
  const directory = createTestWorkspace(path.join(root, ".temp/carrier-owner"), "native-layout-arity-");
  const source = path.join(directory, "arity.ts");
  writeFileSync(source, `import { csharpRuntimeNativeLayoutTargetType, csharpRuntimeNativeLocationTargetType } from ${JSON.stringify(path.join(root,
    "dist/target-model/types/carriers/runtime-carriers.js"))};
csharpRuntimeNativeLayoutTargetType();
csharpRuntimeNativeLayoutTargetType(undefined);
csharpRuntimeNativeLayoutTargetType({ kind: "source-primitive", name: "int32" });
`);
  const config = path.join(directory, "tsconfig.json");
  writeFileSync(config, JSON.stringify({ files: [source], compilerOptions: {
    strict: true, noEmit: true, skipLibCheck: true, module: "NodeNext", moduleResolution: "NodeNext", target: "ESNext", types: [],
    paths: { "@tsonic/tsts": [path.join(host, "packages/tsts/dist/src/index.d.ts")],
      "@tsonic/target-api": [path.join(host, "packages/target-api/dist/public/index.d.ts")] },
  } }));
  const result = spawnSync(path.join(host, "node_modules/.bin/tsgo"), ["-p", config, "--pretty", "false"], {
    encoding: "utf8", timeout: 30_000, maxBuffer: 65_536,
  });
  assert.equal(result.error === undefined, true, "native declaration checking completes");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.deepEqual([...`${result.stdout}${result.stderr}`.matchAll(/error TS(\d+):/gu)].map(match => Number(match[1])),
    [2724, 2554, 2345]);
});
