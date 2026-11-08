import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCsharpSource, checkCsharpSource, assertCsharpCheckingSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../../dist/target-model/types/index.js";
import { csharpTargetNamedType } from "../../../dist/target-model/types/factories.js";
import { analyzeCsharpTypeEmission } from "../../../dist/analysis/source-evidence/types/emission.js";
import { recursiveOptionalCollectionUnionFiles, recursiveOptionalCollectionUnionJsFiles } from "../../../../tsonic/test/fixtures/recursive-source-unions.mjs";

test("Native type sealing retains every callable member, receiver, helper dependency and completed constraint", () => {
  const checked = checkCsharpSource({ sourceText: "export {};" });
  assertCsharpCheckingSucceeded(checked);
  const named = name => csharpTargetNamedType(`Native.Metadata.${name}`, [], { kind: "named", name },
    { allowsRefLikeTypeArguments: [] });
  const receiver = named("Receiver");
  const firstParameter = named("FirstParameter");
  const firstResult = named("FirstResult");
  const secondParameter = named("SecondParameter");
  const secondResult = named("SecondResult");
  const helper = named("Helper");
  const carrierConstraint = named("CarrierConstraint");
  const methodConstraint = named("MethodConstraint");
  const parameter = Object.freeze({ kind: "type-parameter", identity: "native:CarrierValue", name: "CarrierValue",
    csharpRequirementDependencies: Object.freeze([helper]),
    csharpConstraints: Object.freeze({ kind: "resolved", constraints: Object.freeze([{ kind: "type", type: carrierConstraint }]) }) });
  const callable = Object.freeze({ ...csharpTargetNamedType("Native.Metadata.Callable`1", [parameter],
    { kind: "named", name: "Callable", genericArity: 1 }, { allowsRefLikeTypeArguments: [false] }),
    csharpCallableMembers: Object.freeze([
      Object.freeze({ name: "Invoke", typeParameters: Object.freeze([{ identity: "native:MethodValue", name: "MethodValue",
        constraints: Object.freeze([{ kind: "type", type: methodConstraint }]) }]),
        signature: Object.freeze({ kind: "call", receiver: Object.freeze({ type: receiver, passingMode: "byref-readonly" }),
          parameters: Object.freeze([firstParameter]), parameterPassingModes: Object.freeze(["byref-readwrite"]),
          returnType: firstResult, returnPassing: "byref-readonly" }) }),
      Object.freeze({ name: "Construct", typeParameters: Object.freeze([]),
        signature: Object.freeze({ kind: "construct", parameters: Object.freeze([secondParameter]),
          parameterPassingModes: Object.freeze(["by-value"]), returnType: secondResult }) }),
    ]),
  });
  const result = analyzeCsharpTypeEmission({ ast: checked.source.ast, nodes: [], languageDialect: "csharp14",
    extraTypes: [callable], evidence: { targetTypes: [], typeParameterConstraints: new WeakMap() },
    values: { valueRead: new WeakMap() }, storage: { storageType: new WeakMap() },
    shapes: { targetShapes: Object.freeze({}) }, admitted: () => false });
  assert.equal(result.issues.length, 0, "complete physical Native metadata needs no Source inference");
  for (const carrier of [callable, parameter, receiver, firstParameter, firstResult, secondParameter, secondResult,
    helper, carrierConstraint, methodConstraint]) {
    assert.equal(result.records.typeEmission.get(carrier) !== undefined, true,
      carrier.kind === "type-parameter" ? carrier.identity : carrier.id);
  }
  assert.equal(result.records.typeEmission.get(callable).lambda === undefined, true,
    "a complete multi-member contract is not its first callable signature");
  assert.equal(Object.isFrozen(result.records), true, "only sealed Native data leaves the producer");
});

for (const surface of [undefined, "js"]) {
  test(`optional recursive member projections publish native receiver types before sealing on ${surface ?? "native"}`, () => {
    const files = surface === undefined ? recursiveOptionalCollectionUnionFiles : recursiveOptionalCollectionUnionJsFiles;
    const checked = analyzeCsharpSource({ surface, sourceText: files["index.ts"], files: { "tree.ts": files["tree.ts"] } });
    assert.equal(checked.sourceDiagnosticsText, "", "the unchanged recursive fixture is valid checked source");
    assert.equal(checked.analysis.kind, "resolved", "the native analysis admits the recursive collection members");
    const program = checked.analysis.value;
    let elementProjections = 0;
    let propertyProjections = 0;
    const visit = node => {
      const element = program.records.selectedElement.get(node);
      const property = program.records.selectedProperty.get(node);
      const projection = element?.receiverProjection ?? property?.receiverProjection;
      if (projection !== undefined) {
        if (element !== undefined) elementProjections++;
        if (property !== undefined) propertyProjections++;
        assert.equal(projection.conversion.kind, "runtime-union-projection", "the receiver uses its admitted native union projection");
        assert.equal(program.records.typeEmission.get(projection.source) !== undefined, true,
          "the physical source receiver owns a sealed type-emission plan");
        const target = program.records.typeEmission.get(projection.target);
        assert.equal(target !== undefined, true, "the projected native receiver owns its sealed type-emission plan");
        const present = getCsharpNullableElementTargetType(projection.target);
        assert.equal(present !== undefined, true, "the selected optional receiver retains the native absence state");
        assert.equal(targetTypeRefEquals(target.optionalStorage.present, present), true,
          "the optional receiver plan retains the exact native present carrier");
        assert.equal(target.optionalStorage.kind, "native", "the receiver uses native absence storage without a new wrapper");
      }
      program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    for (const file of program.source.sourceFiles) visit(file);
    assert.equal(elementProjections, 3, "all three element projections include direct and effectful receivers");
    assert.equal(propertyProjections, surface === "js" ? 1 : 0, "the JS length property uses the same type-emission closure");
  });
}
