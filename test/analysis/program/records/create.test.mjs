import assert from "node:assert/strict";
import test from "node:test";
import { createTargetSourceProgram } from "@tsonic/target-api/source";
import { analyzeCsharpTargetProgram } from "../../../../dist/analysis/program/index.js";
import { createCsharpTargetConfiguration } from "../../../../dist/options/csharp-target-options.js";
import { createCsharpProviderRelationResolver } from "../../../../dist/providers/native/relations/resolver.js";
import { checkCsharpSource, assertCsharpCheckingSucceeded } from "../../../helpers/direct-csharp-session.mjs";

function fixture(surface) {
  const checked = checkCsharpSource({ surface, sourceText: `
    import type { int32 } from "@tsonic/core/types.js";
    export function add(left: int32, right: int32): int32 { return left + right; }
    export const total: int32 = add(2, 3);
  ` });
  assertCsharpCheckingSucceeded(checked);
  const source = createTargetSourceProgram(checked.source);
  const analyzed = analyzeCsharpTargetProgram({
    input: { source, sourcePackages: checked.sourcePackages, project: checked.project, target: checked.target,
      runtimeActivatedCapabilityIds: [], runtimeReferences: [], paths: checked.paths },
    configuration: createCsharpTargetConfiguration(checked.target, checked.paths.projectRoot, checked.paths.targetOutputRoot),
    providers: createCsharpProviderRelationResolver({ providers: [], providerPolicies: [] }),
  });
  assert.equal(analyzed.kind === "resolved", true, `${surface}: valid source analysis`);
  const program = analyzed.value;
  const nodes = [];
  const pending = [...program.sourceFiles];
  while (pending.length > 0) {
    const node = pending.pop();
    nodes.push(node);
    source.ast.forEachChild(node, child => { if (child !== undefined) pending.push(child); });
  }
  const call = nodes.find(node => source.ast.is.IsCallExpression(node));
  const declaration = nodes.find(node => source.ast.is.IsFunctionDeclaration(node));
  assert.equal(call !== undefined && declaration !== undefined, true, `${surface}: exact source subjects`);
  return { program, call, declaration };
}

for (const surface of ["native", "js"]) {
  test(`one frozen C# record reader preserves exact facts and absent values in ${surface}`, () => {
    const { program, call, declaration } = fixture(surface);
    assert.equal(Object.isFrozen(program) && Object.isFrozen(program.records), true, "sealed program and record port");
    const families = Object.entries(program.records);
    assert.equal(families.length, 118, "every current record family is assembled");
    for (const [name, family] of families) {
      assert.equal(Object.isFrozen(family) && typeof family.get === "function", true, `${name}: frozen typed reader`);
      assert.equal(Object.hasOwn(family, "set"), false, `${name}: no public write path`);
    }
    const selected = program.records.selectedCall.get(call);
    assert.equal(selected !== undefined, true, "exact source call is classified");
    assert.equal(program.records.selectedCall.get(call) === selected, true, "repeated lookup preserves fact identity");
    const refinement = program.records.valueRefinement.get(call);
    assert.equal(program.records.valueRefinement.get(call) === refinement, true, "source refinement identity is unchanged");
    assert.equal(program.records.selectedCall.get(declaration) === undefined, true, "unrelated declaration has no call fact");
    assert.equal(program.records.nativeGuardResult.get(declaration) === undefined, true, "optional booleans stay absent");
    assert.equal(program.records.exactCatchRethrow.get(declaration), false, "guaranteed false is not optionalized");
    const type = program.records.nodeTargetType.get(call);
    assert.equal(type?.kind === "source-primitive" && type.name === "int32", true, "native integer carrier is preserved");
  });

  test(`C# records remove superseded aggregate readers and retain services in ${surface}`, () => {
    const { program, call } = fixture(surface);
    for (const name of ["sourceEvidence", "operations", "declarations", "storage", "expectedTypes", "captureStorage",
      "classInitialization", "numericRepresentations", "attributeApplications", "safetyApplications", "typeProjections", "callableAdapters"]) {
      assert.equal(Object.hasOwn(program, name), false, `${name}: superseded program reader removed`);
    }
    assert.throws(() => program.records.valueRefinement(call), TypeError, "flat callable form is not supported");
    assert.equal(typeof program.names.resolve === "function", true, "name service stays separate");
    assert.equal(typeof program.sourceNavigation.referenceFor === "function", true, "source navigation stays separate");
    assert.equal(Object.hasOwn(program, "conversions"), false, "union relations are validated at admission; no computing service is published");
    assert.throws(() => program.conversions.matchesUnionMapping, TypeError, "the removed conversion service cannot be reached");
    assert.throws(() => { program.conversions = {}; }, TypeError, "the sealed program cannot gain a conversion service");
    assert.equal(Object.hasOwn(program.records.conversion, "select"), false, "conversion lookup has one record reader");
    assert.equal(Object.hasOwn(program.records, "closedArrayStorage"), false, "unused private analysis resolver is not a final record");
    assert.equal(Object.hasOwn(program.records, "inspectClosedArrayStorage"), false, "private native-backing inspection never crosses the seal");
    assert.equal(Array.isArray(program.classFactories) && Array.isArray(program.captureFrames), true, "catalog data is separate");
  });
}
