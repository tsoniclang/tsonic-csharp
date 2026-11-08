import assert from "node:assert/strict";
import test from "node:test";
import { selectCsharpFlowReadProjection } from "../../../dist/policy/types/objects/read-projections.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { analyzeCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { resolvedSourceValue } from "../../helpers/published-return-contracts.mjs";
import { createNativeConversionHost } from "../../helpers/native-conversion-host.mjs";

function fixture() {
  const compiled = analyzeCsharpSource({ sourceText: `
    export class Base {}
    export class Derived extends Base { value: number = 1; }
    export class Other {}
    export function read(base: Base, derived: Derived, other: Other): void {}
  ` });
  assertCsharpCheckingSucceeded(compiled);
  assert.equal(compiled.analysis.kind, "resolved", "the real Native program has one representation view");
  const program = compiled.analysis.value;
  const source = program.source;
  const declaration = source.sourceFiles.filter(file => !source.ast.isDeclarationFile(file))
    .flatMap(file => source.ast.statements(file)).find(node => source.ast.is.IsFunctionDeclaration(node));
  assert.equal(declaration !== undefined, true, "one original read declaration");
  const parameters = source.ast.parameters(declaration);
  const endpoints = parameters.map(parameter => {
    const slot = resolvedSourceValue(source.facts.values.declaredSlot(parameter), "original parameter storage");
    const outcome = program.representation.represent(slot.type, "storage", parameter);
    assert.equal(outcome.kind, "represented", "the actual parameter has a Native carrier");
    return Object.freeze({ evidence: slot.type, carrier: outcome.value.carrier });
  });
  const [base, derived, other] = endpoints;
  assert.equal(endpoints.length, 3);
  const policy = createNativeConversionHost({ heritage: [{ carrier: derived.carrier, supertypes: [base.carrier] }] });
  const refinement = selected => Object.freeze({ kind: "represented", value: Object.freeze({
    occurrence: parameters[0], selected, storage: Object.freeze({ kind: "present", value: base }), exact: false,
  }) });
  return { policy, representation: program.representation, base, derived, other, parameters, refinement };
}

test("a distinct narrowed Native receiver retains its exact storage-to-selected cast", () => {
  const { policy, representation, base, derived, refinement } = fixture();
  const outcome = selectCsharpFlowReadProjection(policy, representation, refinement(derived), false, false);
  assert.equal(outcome.kind, "represented");
  const projection = outcome.value;
  assert.equal(projection.kind, "conversion", "different actual carriers require an admitted projection");
  assert.equal(targetTypeRefEquals(projection.source, base.carrier), true, "the original storage ABI is retained");
  assert.equal(targetTypeRefEquals(projection.target, derived.carrier), true, "the selected receiver ABI is retained");
  assert.equal(projection.selection.kind, "cast");
  assert.equal(projection.selection.proof, "reference", "no numeric or structural reinterpretation is introduced");
});

test("an actually identical selected Native receiver remains a zero-adaptation read", () => {
  const { policy, representation, base, refinement } = fixture();
  const outcome = selectCsharpFlowReadProjection(policy, representation, refinement(base), false, false);
  assert.equal(outcome.kind, "represented");
  assert.equal(outcome.value.kind, "identity", "native identity adds no cast, wrapper or copy");
});

test("unrelated Native receiver storage fails precisely and an existing failure forwards unchanged", () => {
  const { policy, representation, other, parameters, refinement } = fixture();
  const failure = selectCsharpFlowReadProjection(policy, representation, refinement(other), false, false);
  assert.equal(failure.kind, "native-refused");
  assert.equal(failure.code, "CSHARP_NATIVE_READ_PROJECTION_UNSUPPORTED");
  assert.equal(failure.site === parameters[0], true, "the actual original read site owns the failure");
  assert.equal(selectCsharpFlowReadProjection(policy, representation, failure, false, false) === failure, true,
    "failure forwarding cannot substitute a second Native read chooser or manufacture identity");
});
