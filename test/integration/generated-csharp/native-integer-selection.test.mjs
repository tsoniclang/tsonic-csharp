import assert from "node:assert/strict";
import test from "node:test";
import { nativeIntegerSelectionSource } from "../../../../tsonic/test/fixtures/native-integer-selection.mjs";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpJsGlobalCallPolicies } from "../../../dist/policy/operations/source-profiles/js/globals.js";
import { callEvidence, directProviderHost } from "../../fixtures/dotnet-provider/direct-provider-selection.helpers.mjs";

test("floor policy selects the argument's exact integer carrier, not a floating round trip", () => {
  const policy = csharpJsGlobalCallPolicies.find(row => row.source.declaringName === "Math" && row.source.name === "floor");
  assert(policy);
  for (const name of ["int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "native-int", "native-uint", "float32", "float64"]) {
    const carrier = { kind: "source-primitive", name };
    const call = callEvidence({ argumentTypes: [{}], receiver: false });
    const fixture = directProviderHost({ nodeTypes: [[call.evidence.sourceArguments[0].expression, carrier]] });
    const selected = policy.select({ host: fixture.host, sourceFile: fixture.sourceFile, source: call.evidence });
    assert.equal(selected.kind, "resolved");
    const integral = !name.startsWith("float");
    assert.deepEqual(selected.call.targetMember.returnType, integral ? carrier : { kind: "source-primitive", name: "float64" });
    assert.equal(selected.call.targetMember.csharpInvocation?.kind, integral ? "numeric-conversion" : undefined);
  }
});

test("native counters, conditional joins and integer floor preserve exact carriers and fractional controls", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: nativeIntegerSelectionSource });
  assertCsharpCompilationSucceeded(compiled);
  const output = compiled.artifacts.get("src/Index.cs");
  const counted = output.slice(output.indexOf("string counted("), output.indexOf("string growing("));
  assert.match(counted, /for \(int index = 0;/u);
  assert.doesNotMatch(counted, /double|Convert\.To/u);
  const floor = output.slice(output.indexOf("int integralFloor("), output.indexOf("double fractionalFloor("));
  assert.doesNotMatch(floor, /Math\.floor|double/u);
  executeCsharpConstruction(compiled, "native-integer-selection");
});
