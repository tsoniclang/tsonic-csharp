import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpCallableContractIndexesEqual } from "../../../dist/analysis/callables/analyze.js";

const overloaded = `function pass<Value>(value: Value): Value;
function pass<Value>(value: Value): Value { return value; }`;
const cases = [
  ["ordinary", "function pass<Value>(value: Value): Value { return value; }", "pass(7) === 7"],
  ["overloaded-explicit", overloaded, "pass<number>(7) === 7"],
  ["overloaded-inferred", overloaded, "pass(7) === 7"],
  ["overloaded-method", `class Box {
    pass<Value>(value: Value): Value;
    pass<Value>(value: Value): Value { return value; }
  }`, "new Box().pass<number>(7) === 7"],
  ["overloaded-static-method", `class Box {
    static pass<Value>(value: Value): Value;
    static pass<Value>(value: Value): Value { return value; }
  }`, "Box.pass<number>(7) === 7"],
  ["narrow-checked-contract", `function pass(value: number): number;
    function pass(value: number | string): number | string { return value; }`, "pass(7) === 7"],
  ["shadowed-binders", `function outer<Value>(value: Value): Value {
    function pass<Value>(other: Value): Value;
    function pass<Value>(other: Value): Value { return other; }
    return pass(value);
  }`, "outer(7) === 7"],
  ["source-protocol", `interface Echo { pass<Value>(value: Value): Value; }
    class Box implements Echo { pass<Value>(value: Value): Value { return value; } }`, "new Box().pass(7) === 7"],
];

for (const surface of ["native", "js"]) {
  for (const [name, declarations, expression] of cases) {
    test(`${surface} native generic permission origin preserves ${name}`, { timeout: 240_000 }, () => {
      const compiled = compileCsharpSource({ surface,
        sourceText: `${declarations}\nexport function run(): boolean { return ${expression}; }` });
      assertCsharpCompilationSucceeded(compiled);
      assert.equal(compiled.result.program !== undefined, true, `${name}: the actual native program is published`);
      executeCsharpConstruction(compiled, `generic-permission-${surface}-${name}`);
    });
  }

  test(`${surface} an imported source overload retains its originating checked declaration`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpSource({ surface,
      sourceText: `import { pass as choose } from "./source.js";
        export function run(): boolean { return choose<number>(7) === 7; }`,
      files: { "source.ts": `export ${overloaded.replace("\nfunction", "\nexport function")}` } });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `generic-permission-${surface}-import`);
  });

  for (const explicit of [false, true]) {
    test(`${surface} overloaded source permission remains native false (${explicit ? "explicit" : "inferred"})`, () => {
      const compiled = compileCsharpSource({ surface, sourceText: `
        import type { int32 } from "@tsonic/core/types.js";
        import { Span } from "@tsonic/dotnet/System.js";
        ${overloaded}
        export function fail(values: int32[]): int32 {
          return pass${explicit ? "<Span<int32>>" : ""}(new Span<int32>(values)).Length;
        }` });
      assert.equal(compiled.sourceDiagnosticsText, "", "the actual source generic instantiation is checked");
      assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_GENERIC_ARGUMENT"), true,
        "the proved ordinary source slot retains its actual native no-ref-struct permission");
      assert.equal(compiled.result.diagnostics.some(issue => issue.code === "CSHARP_REFLIKE_METADATA_NOT_PROVEN"), false,
        "an exact checked project overload no longer lacks its producer contract");
      assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0, true,
        "the invalid native instantiation is refused before publication");
    });
  }
}

test("callable contract equality includes every required generic permission without changing source binder identity", () => {
  const declaration = Object.freeze({});
  const contract = Object.freeze({ sourceDeclaration: declaration,
    methodTypeParameterIdentities: Object.freeze(["source:identity:0"]),
    methodAllowsRefLikeTypeArguments: Object.freeze([false]), parameters: Object.freeze([]),
    returnType: Object.freeze({ kind: "source-primitive", name: "int32" }) });
  const index = selected => Object.freeze({ contracts: Object.freeze([selected]), declarationContracts: Object.freeze([selected]),
    closedInputType: () => undefined, get: identity => identity.declaration === declaration ? selected : undefined });
  assert.equal(csharpCallableContractIndexesEqual(index(contract), index({ ...contract })), true,
    "identical required permission metadata is stable");
  assert.equal(csharpCallableContractIndexesEqual(index(contract),
    index({ ...contract, methodAllowsRefLikeTypeArguments: Object.freeze([true]) })), false,
  "a changed actual slot permission cannot be treated as the same contract");
  assert.equal(csharpCallableContractIndexesEqual(index(contract),
    index({ ...contract, methodAllowsRefLikeTypeArguments: Object.freeze([]) })), false,
  "a missing slot is not silently normalized to native false");
});
