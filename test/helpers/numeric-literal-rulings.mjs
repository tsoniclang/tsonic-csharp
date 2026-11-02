import assert from "node:assert/strict";
import { csharpDelegateTargetType, csharpTaskTargetType } from "../../dist/target-model/types/carriers/delegates.js";
import { csharpNullableTargetType } from "../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefKey } from "../../dist/target-model/types/equality.js";
import { combineCsharpTargetUnionMembers } from "../../dist/target-model/types/carriers/runtime-carriers.js";
import { csharpJsArrayTargetType } from "../../dist/target-model/types/carriers/js.js";

export function assertNumericLiteralRefusal(compiled, expected) {
  assert.equal(compiled.sourceDiagnosticsText, "", "the unchanged original program remains TypeScript-valid");
  const ast = compiled.source.ast;
  const actual = compiled.result.diagnostics.map(issue => {
    const node = issue.sourceNode;
    const file = node === undefined ? undefined : ast.getSourceFile(node);
    const range = node === undefined ? undefined : ast.authoredRange(node);
    return { code: issue.code, message: issue.message,
      text: file === undefined || range?.kind !== "authored" ? undefined :
        ast.getSourceText(file).slice(range.start, range.end).trim() };
  });
  assert.deepEqual(actual, expected, "the original later use is refused with its exact code, native carriers and authored node");
  assert.equal(compiled.result.program === undefined && compiled.result.artifacts.length === 0 && compiled.artifacts.size === 0, true,
    "a refused numeric use publishes no program, artifact, conversion copy or invalid native output");
}

export function numericCompoundRefusal(operator, text) {
  return { code: "CSHARP_UNSUPPORTED_AST",
    message: `C# compound assignment '${operator}' requires an implicit result-to-storage conversion or an exact predefined narrowing with an implicit right-to-storage conversion.`, text };
}

export function numericCarrierRefusal(source, target, text) {
  return { code: "CSHARP_UNSUPPORTED_AST", text,
    message: `No exact C# implicit conversion relates '${targetTypeRefKey(source)}' to '${targetTypeRefKey(target)}'.` };
}

export function numericSpreadRefusal(surface, text) {
  const element = combineCsharpTargetUnionMembers([
    csharpSourcePrimitiveTargetType("float64"), csharpSourcePrimitiveTargetType("int64"),
  ]);
  const expected = csharpSourcePrimitiveTargetType("float64");
  const source = surface === "js" ? csharpJsArrayTargetType(element) : { kind: "array", element };
  const target = surface === "js" ? csharpJsArrayTargetType(expected) : { kind: "array", element: expected };
  return numericCarrierRefusal(source, target, text);
}

export function numericPromiseRefusal(text) {
  const source = csharpTaskTargetType(csharpSourcePrimitiveTargetType("int64"));
  const target = csharpTaskTargetType(csharpSourcePrimitiveTargetType("float64"));
  return { code: "CSHARP_UNSUPPORTED_AST", text,
    message: `Task carriers cannot be unwrapped, reinterpreted, or changed in arity without an exact target conversion relation: '${targetTypeRefKey(source)}' to '${targetTypeRefKey(target)}'.` };
}

export function numericDefaultCallableRefusal(text) {
  const result = csharpSourcePrimitiveTargetType("float64");
  const source = csharpDelegateTargetType("System.Func", [csharpNullableTargetType(csharpSourcePrimitiveTargetType("int64"))],
    result, { optionalParameterIndexes: [0] });
  const target = csharpDelegateTargetType("System.Func", [csharpNullableTargetType(result)], result,
    { optionalParameterIndexes: [0] });
  return { code: "CSHARP_UNSUPPORTED_AST", text,
    message: `C# delegate conversion requires matching call shape and exact implicit parameter/return adaptations; source '${targetTypeRefKey(source)}', target '${targetTypeRefKey(target)}'.` };
}
