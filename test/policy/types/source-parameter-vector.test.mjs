import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpSourceParameterVector, selectCsharpSourceParameterEvidenceVector } from "../../../dist/policy/types/callables/parameter-vector.js";
import { csharpStringTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { selectCsharpConversion } from "../../../dist/policy/conversions/core.js";
import { admitCsharpSourceConversion } from "../../../dist/policy/conversions/source-admission.js";
import { getCsharpCallableMembers } from "../../../dist/target-model/types/carriers/delegates.js";

const integer = Object.freeze({ kind: "source-primitive", name: "int32" });
const wide = Object.freeze({ kind: "source-primitive", name: "int64" });
const text = csharpStringTargetType();
const tuple = Object.freeze({ kind: "tuple", elements: Object.freeze([integer, wide, text]) });
const parameter = Object.freeze({ name: "values", type: tuple, passingMode: "by-value", paramsArray: true });

test("source tuple-rest projection uses one ordered exact native slot vector", () => {
  const selected = selectCsharpSourceParameterVector(parameter,
    [{ elementKind: "required" }, { elementKind: "required" }, { elementKind: "optional" }]);
  assert.equal(selected?.length, 3, "all finite source tuple positions become actual native arguments");
  assert.equal(selected[0].type === integer && selected[1].type === wide && selected[2].type === text, true,
    "the original exact native field carriers and order survive projection");
  assert.equal(selected.every(slot => slot.passingMode === "by-value" && slot.paramsArray !== true), true,
    "a finite rest tuple is not a native params ValueTuple");
  assert.deepEqual(selected.map(slot => slot.optional === true), [false, false, true], "checked omission belongs to its expanded slot");
  assert.equal(Object.isFrozen(selected) && selected.every(Object.isFrozen), true, "the vector is immutable");
});

function sourceFixture() {
  const compiled = analyzeCsharpSource({ sourceText: `
    export type Arguments = [number, bigint, string];
    export declare function inspect(
      source: (first: unknown, second: unknown, third: unknown) => void,
      target: (...values: Arguments) => void
    ): void;
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved");
  const source = compiled.source;
  const program = compiled.analysis.value;
  const declaration = source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file))
    .flatMap(file => source.ast.statements(file)).find(node => source.ast.is.IsFunctionDeclaration(node));
  const endpoints = source.ast.parameters(declaration).map(site => {
    const evidence = resolvedSourceValue(source.facts.values.declaredSlot(site), "the actual callable parameter").type;
    const selected = program.representation.represent(evidence, "storage", site);
    assert.equal(selected.kind, "represented");
    return { evidence, carrier: selected.value.carrier, site };
  });
  return { source, program, endpoints };
}

test("an authored tuple alias projects identical registered child evidence in its actual physical order", () => {
  const input = sourceFixture();
  const target = input.endpoints[1];
  const view = input.source.facts.descriptors;
  const callable = target.evidence.type.kind === "declared"
    ? resolvedSourceValue(view.definition(target.evidence), "the original callable definition") : target.evidence;
  const signature = callable.type.calls[0];
  const parameter = resolvedSourceValue(view.component(callable,
    { kind: "parameter", signature: signature.identity, index: 0 }), "the original rest parameter");
  const represented = input.program.representation.represent(parameter, "storage", target.site);
  assert.equal(represented.kind, "represented");
  const selected = selectCsharpSourceParameterEvidenceVector(view, parameter,
    { name: "values", type: represented.value.carrier, passingMode: "by-value", paramsArray: true }, target.site);
  assert.equal(selected.kind, "represented");
  assert.equal(selected.value.length, 3);
  const tuple = parameter.type.kind === "declared"
    ? resolvedSourceValue(view.definition(parameter), "the actual alias tuple definition") : parameter;
  assert.equal(selected.value.every((entry, index) => entry.evidence === resolvedSourceValue(view.component(tuple,
    { kind: "tuple-element", index }), "the exact original tuple child")), true);
  assert.equal(getCsharpCallableMembers(target.carrier)[0].signature.parameters.length, 3);
});

test("expanded tuple adapter boxing carries each original child category rather than the callable anchor", () => {
  const input = sourceFixture();
  const [source, target] = input.endpoints;
  const relation = selectCsharpConversion(input.program.analysis.policy, source.carrier, target.carrier, "implicit");
  assert.equal(relation.kind, "delegate-adapter");
  const admitted = admitCsharpSourceConversion({ representation: input.program.representation,
    source, destination: target, relation, site: target.site });
  assert.equal(admitted.kind, "represented");
  assert.equal(admitted.value.kind, "delegate-adapter");
  assert.deepEqual(admitted.value.parameterConversions.map(conversion => {
    assert.equal(conversion.kind, "js-value-box");
    assert.equal(conversion.category.kind, "known");
    return conversion.category.category;
  }), ["number", "bigint", "string"]);
});

test("ordinary tuple and array parameters retain their single native input", () => {
  const ordinary = Object.freeze({ ...parameter, paramsArray: false });
  assert.equal(selectCsharpSourceParameterVector(ordinary, undefined)[0] === ordinary, true,
    "a tuple value is not a source rest-argument list");
  const array = Object.freeze({ ...parameter, type: Object.freeze({ kind: "array", element: wide }) });
  assert.equal(selectCsharpSourceParameterVector(array, undefined)[0] === array, true,
    "an open-ended array rest remains one native array input");
  assert.equal(selectCsharpSourceParameterVector(parameter, undefined), undefined, "missing checked slot metadata is not guessed");
  assert.equal(selectCsharpSourceParameterVector(parameter, [{ elementKind: "required" }]), undefined,
    "checked and physical tuple widths must correspond exactly");
});
