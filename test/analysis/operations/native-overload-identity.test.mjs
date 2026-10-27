import assert from "node:assert/strict";
import test from "node:test";
import { compareInstantiatedProviderCalls } from "../../../dist/analysis/operations/members/calls/instantiation.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native provider ranking keeps the argument's exact physical identity before comparing conversion targets", () => {
  const unexpected = () => assert.fail("an exact native identity preference needs no provider or inheritance query");
  const host = { projectTypes: { directSupertypes: unexpected }, providers: { resolveRelation: unexpected } };
  const candidate = (sourceType, targetType) => ({ kind: "resolved", argumentMappings: [{
    kind: "by-value", effectiveArgumentIndex: 0, sourceType, targetType,
    conversion: sourceType === targetType ? { kind: "identity" }
      : { kind: "implicit", proof: sourceType.name === "int32" && targetType.name === "uint32" ? "literal" : "numeric" },
  }] });
  for (const [sourceName, otherName] of [
    ["int32", "uint32"], ["uint32", "int64"], ["int64", "float64"],
    ["float32", "float64"],
  ]) {
    const source = csharpSourcePrimitiveTargetType(sourceName);
    const other = csharpSourcePrimitiveTargetType(otherName);
    assert.equal(compareInstantiatedProviderCalls(host, candidate(source, source), candidate(source, other)), "left",
      `${sourceName}: the native identity conversion beats a different viable native target`);
    assert.equal(compareInstantiatedProviderCalls(host, candidate(source, other), candidate(source, source)), "right",
      `${sourceName}: relation enumeration order cannot choose the other target`);
    assert.equal(compareInstantiatedProviderCalls(host, candidate(source, source), candidate(source, source)), "equivalent",
      `${sourceName}: two genuinely exact targets stay tied rather than choosing the first relation`);
  }
});

for (const surface of ["native", "js"]) {
  test(`ordinary native overloads preserve exact integer and floating inputs on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import { Console } from "@tsonic/dotnet/System.js";
import type { int32, uint32, int64, float32, float64 } from "@tsonic/core/types.js";
export function run(): boolean {
  Console.WriteLine(0);
  Console.WriteLine(1 as int32);
  Console.WriteLine(2 as uint32);
  Console.WriteLine(9007199254740993n as int64);
  Console.WriteLine(1.5 as float32);
  Console.WriteLine(2.5 as float64);
  return true;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const output = executeCsharpConstruction(compiled, `native-overload-identity-${surface}`);
    assert.equal(output.replace(/\r\n/gu, "\n"), "0\n1\n2\n9007199254740993\n1.5\n2.5\n",
      "native overload execution keeps the exact integer above2^53 and floating values");
  });
}
