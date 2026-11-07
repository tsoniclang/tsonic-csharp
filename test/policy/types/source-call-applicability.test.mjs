import assert from "node:assert/strict";
import test from "node:test";
import { createCompilerSessionFromFiles } from "@tsonic/tsts";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { resolveSourceCallContract } from "../../../dist/analysis/source-evidence/types/resolution/call-contracts.js";
import { resolveSourceCallResultWithState } from "../../../dist/analysis/source-evidence/types/resolution/call-api.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";

function fixture(definition, invocation, external = true) {
  const files = external ? {
    "/src/node_modules/@fixture/api/package.json": JSON.stringify({ name: "@fixture/api", version: "1.0.0", types: "index.d.ts" }),
    "/src/node_modules/@fixture/api/index.d.ts": definition,
    "/src/index.ts": `import { invoke } from "@fixture/api"; export const result = ${invocation};`,
  } : { "/src/index.ts": `${definition} export const result = ${invocation};` };
  const checked = createCompilerSessionFromFiles({ currentDirectory: "/src", files,
    compilerOptions: { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" } }).checkSource();
  assert.equal(checked.diagnostics.length === 0, true, "the original invocation has valid checked Source");
  const program = createTargetSourceProgram(checked);
  const file = checked.getSourceFile("/src/index.ts");
  assert.equal(file !== undefined, true, "the exact project source file is retained");
  const calls = [];
  const visit = node => {
    if (program.ast.is.IsCallExpression(node)) calls.push(node);
    program.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  visit(file);
  assert.equal(calls.length === 1, true, "the fixture has one exact checked invocation");
  const source = program.semantics.forFile(file).operations.call(calls[0]);
  assert.equal(source?.call === calls[0], true, "call-contract selection retains the identical original invocation");
  const scope = { host: { ast: program.ast, navigation: program.navigation,
    effectiveTypes: program.effectiveTypes, target: { id: "csharp" },
    moduleCallables: { get: () => undefined },
    projectTypes: () => ({ catalog: { definitionForTarget: () => undefined } }),
    projectTypeCatalog: { definitionForTarget: () => undefined },
    typeDefinitions: { sourceUnionArms: () => undefined },
    semantics: selected => program.semantics.forFile(selected),
    representations: { sourceCallable: () => assert.fail("an unbound callee has no Source body ABI"),
      closedInputContract: () => undefined } },
    resolveSelectedValueWithState: () => undefined, resolveReadStorage: () => undefined };
  scope.resolveSourceCallContract = (...arguments_) => resolveSourceCallContract(scope, ...arguments_);
  return { program, scope, source, file };
}

for (const [name, definition, invocation] of [
  ["function", "export declare function invoke(value: number): number;", "invoke(1)"],
  ["method", "export declare const invoke: { read(value: number): number };", "invoke.read(1)"],
]) test(`a foreign ${name} has explicit nonapplicable Source contract authority`, () => {
  const current = fixture(definition, invocation);
  const selection = current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "implementation");
  assert.equal(selection.kind === "not-applicable" && Object.isFrozen(selection), true,
    "the sole contract owner distinguishes a foreign declaration from invalid stored evidence");
  const outcome = current.program.effectiveTypes.get(current.source.call);
  assert.equal(outcome?.kind === "resolved", true, "the same original call has a published Host result");
  const result = resolveSourceCallResultWithState(current.scope, current.source, current.file, { depth: 0 }, undefined);
  assert.equal(result?.effectiveType === outcome, true, "the actual Host result survives a foreign contract domain");
  assert.equal(targetTypeRefEquals(result?.nativeType, { kind: "source-primitive", name: "float64" }), true,
    "a Native callee classification never replaces the Host-selected width");
  current.scope.host.effectiveTypes = { ...current.program.effectiveTypes, get: () => undefined };
  assert.equal(resolveSourceCallResultWithState(current.scope, current.source, current.file, { depth: 0 }, undefined) === undefined, true,
    "nonapplicable contract authority cannot fabricate a missing Host publication");
});

test("a foreign stored callable still requires its actual native input contract", () => {
  const current = fixture("export declare const invoke: (value: number) => number;", "invoke(1)");
  const selection = current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "implementation");
  assert.equal(selection.kind === "rejected", true, "foreign storage cannot borrow direct declaration applicability");
  assert.equal(resolveSourceCallResultWithState(current.scope, current.source, current.file, { depth: 0 }, undefined) === undefined, true,
    "a published result does not admit missing stored callable evidence");
});

test("an original project method without its required receiver remains rejected", () => {
  const current = fixture("declare const invoke: { read(value: number): number };", "invoke.read(1)", false);
  const selection = current.scope.resolveSourceCallContract(current.source, current.file, { depth: 0 }, "implementation");
  assert.equal(selection.kind === "rejected", true, "a project declaration cannot claim the foreign Native domain");
  assert.equal(resolveSourceCallResultWithState(current.scope, current.source, current.file, { depth: 0 }, undefined) === undefined, true,
    "missing exact project receiver authority cannot be replaced by a Host result");
});
