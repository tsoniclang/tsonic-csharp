import assert from "node:assert/strict";
import test from "node:test";
import { retainCsharpMethodValueContracts } from "../../../dist/analysis/objects/shapes/method-values.js";
import { createStructuralObjectShapeTarget } from "../../../dist/analysis/objects/shapes/construction.js";
import { csharpDelegateTargetType } from "../../../dist/target-model/types/carriers/delegates.js";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals } from "../../../dist/target-model/types/equality.js";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("selected structural method storage participates in the sole published carrier identity", () => {
  const declaration = Object.freeze({});
  const number = csharpSourcePrimitiveTargetType("float64");
  const member = Object.freeze({ sourceKey: Object.freeze({ kind: "property", name: "read" }),
    sourceName: "read", targetName: "read", memberKind: "method",
    type: csharpDelegateTargetType("System.Func", [number], number),
    sourceDeclarations: Object.freeze([declaration]) });
  const environment = () => assert.fail("the monomorphic method has no generic constraint");
  const targetType = createStructuralObjectShapeTarget([member], undefined, environment, true);
  const storage = Object.freeze({
    source: Object.freeze({ ast: Object.freeze({ is: Object.freeze({
      IsMethodDeclaration: () => false,
      IsMethodSignatureDeclaration: node => node === declaration,
      IsBindingElement: () => false,
      IsSpreadAssignment: () => false,
    }) }), navigation: Object.freeze({ declarationUseSummary: () => Object.freeze({
      firstClassUseCount: 1, exported: false, memberWritten: false,
    }) }) }),
    nodes: Object.freeze([declaration]),
    memberSubjectFor: () => Object.freeze({ kind: "unresolved", reason: "external method value" }),
  });
  const selected = retainCsharpMethodValueContracts({ targetType, members: [member] },
    shape => shape, environment, storage);
  assert.equal(selected.members[0].methodValueStorage?.kind, "delegate",
    "the actual first-class method use selects delegate storage");
  assert.equal(targetTypeRefEquals(selected.targetType, targetType), false,
    "a physical delegate slot cannot reuse the native method-only carrier identity");
  const expected = createStructuralObjectShapeTarget(selected.members, selected.implements, environment, true);
  assert.equal(targetTypeRefEquals(selected.targetType, expected), true,
    "the published carrier is constructed from its final physical members");
  const repeated = retainCsharpMethodValueContracts(selected, shape => shape, environment, storage);
  assert.equal(repeated.targetType === selected.targetType, true,
    "already selected storage keeps one exact published carrier without another identity path");
});

for (const surface of ["native", "js"]) {
  test(`destructured method values share the selected physical carrier on ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
export function invoke({ read }: { read(value: number): number }): number { return read(3); }
export function run(): boolean { return invoke({ read(value: number) { return value + 4; } }) === 7; }
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `method-storage-identity-${surface}`);
  });
}
