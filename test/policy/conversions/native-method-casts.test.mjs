import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { csharpNullableTargetType, csharpSourcePrimitiveTargetType, csharpTsValueTargetType } from "../../../dist/policy/types/index.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const refusal = "A boxed value cannot project a native structural method contract. Pass a value with its declared native method interface instead.";

test("boxed METHOD admission uses the completed named contract rather than a generated shape prefix", () => {
  const target = { kind: "target-named", id: "project.Api", csharpSourceDeclarationKind: "interface", csharpStructuralContract: true, csharpAllowsRefLikeTypeArguments: [] };
  const member = { memberKind: "method", targetName: "run" };
  const shape = { targetType: target, members: [member] };
  const policy = { objectShapes: { resolveTarget: selected => selected !== undefined && targetTypeRefEquals(selected, target) ? shape : undefined } };
  for (const mode of ["implicit", "explicit"]) {
    for (const destination of [target, csharpNullableTargetType(target)]) {
      assert.deepEqual(selectCsharpConversion(policy, csharpTsValueTargetType(), destination, mode), {
        kind: "rejected", code: "CSHARP_NATIVE_METHOD_PROJECTION_UNSUPPORTED", reason: refusal,
      });
    }
  }
  assert.deepEqual(selectCsharpConversion(policy, target, target, "explicit"), { kind: "identity" },
    "an actual native method interface keeps its identity conversion");
});

test("boxed data and function-PROPERTY contracts do not acquire the METHOD projection refusal", () => {
  for (const memberKind of ["field", "property"]) {
    const target = { kind: "target-named", id: `project.${memberKind}`, csharpSourceDeclarationKind: "interface", csharpStructuralContract: true, csharpAllowsRefLikeTypeArguments: [] };
    const policy = { objectShapes: { resolveTarget: selected => selected !== undefined && targetTypeRefEquals(selected, target) ? {
      targetType: target, members: [{ memberKind, targetName: "run" }],
    } : undefined } };
    const selected = selectCsharpConversion(policy, csharpTsValueTargetType(), target, "explicit");
    assert.equal(selected.kind !== "rejected", true, "a replaceable function property is not a METHOD protocol");
  }
  const string = csharpSourcePrimitiveTargetType("string");
  assert.equal(selectCsharpConversion({}, csharpTsValueTargetType(), string, "explicit").kind !== "rejected", true,
    "ordinary checked native conversions keep their existing contract");
});

for (const surface of ["native", "js"]) {
  test(`unknown as Api refuses the native METHOD projection at its actual cast boundary (${surface})`, () => {
    const sourceText = "interface Api { run(): number }\nexport function cast(value: unknown): Api { return value as Api; }\n";
    const compiled = compileCsharpSource({ surface, sourceText });
    assert.equal(compiled.sourceDiagnosticsText, "", "the original unknown cast is valid checked source");
    assert.equal(compiled.extensionDiagnostics.length, 0, "the local native projection owner supplies the refusal");
    assert.equal(compiled.result.diagnostics.length, 1, "one actual METHOD conversion is refused");
    const diagnostic = compiled.result.diagnostics[0];
    assert.equal(diagnostic.code, "CSHARP_NATIVE_METHOD_PROJECTION_UNSUPPORTED");
    assert.equal(diagnostic.category, "error");
    assert.equal(diagnostic.message, refusal);
    assert.equal(diagnostic.sourceNode !== undefined, true, "the original conversion subject is retained");
    assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
      "a refused METHOD projection publishes neither a program nor artifacts");
  });

  test(`native METHOD casts preserve the original receiver without a boxed projection (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { int32 } from "@tsonic/core/types.js";
interface Api { value: int32; run(): int32 }
export function run(): boolean {
  const original: Api = { value: 3 as int32, run(): int32 { return this.value; } };
  const view = original as Api;
  view.value = 7;
  return view === original && original.run() === 7;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    assert.equal(/DynamicInvoke|DispatchProxy|Reflection\.Emit/u.test(output), false,
      "the declared native method never gains a runtime projection adapter");
    const observed = executeCsharpConstruction(compiled, `native-method-cast-${surface}`, false, false, [], `
if (!Tsonic.Generated.Index.run()) throw new System.Exception("native METHOD cast receiver");
System.Console.WriteLine("native-method-cast:True");
`);
    assert.equal(observed.includes("native-method-cast:True"), true,
      "native execution retains the same receiver and alias-visible field mutation");
  });
}
