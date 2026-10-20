import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpObjectShapeDemand } from "../../target-model/records/object-shape-demand.js";
import { objectShapeArtifactKey } from "../../target-model/records/object-shape-demand.js";
import type { CsharpObjectMemberEmission } from "../../target-model/records/object-members.js";
import type { CsharpCaptureStorage } from "../../target-model/records/capture-storage.js";
import type { CsharpStorageClassifications } from "../../target-model/records/storage.js";
import type { CsharpTargetNamedTypeRef } from "../../target-model/types/model.js";
import { canonicalCsharpObjectShapeMembers, csharpObjectShapeMemberContractKey } from "../../target-model/types/object-shape-identity.js";
import { csharpObjectShapeMethodDeclaration } from "../../target-model/types/method-values.js";
import { selectCsharpObjectMemberEmission } from "../../policy/objects/object-members.js";
import { createCsharpObjectMemberRecords } from "../program/records/object-members.js";

export function analyzeCsharpObjectMemberEmission(input: {
  readonly shapes: CsharpObjectShapeClassifications;
  readonly demand: CsharpObjectShapeDemand;
  readonly captures: CsharpCaptureStorage;
  readonly storage: Pick<CsharpStorageClassifications, "nativeField">;
}) {
  const values = new Map<string, ReadonlyMap<string, CsharpObjectMemberEmission>>();
  const declarations = new Map<string, readonly CsharpObjectMemberEmission[]>();
  const issues: TargetDiagnostic[] = [];
  const shapes = new Map([...input.shapes.knownShapes(), ...input.demand.artifacts.map(artifact => artifact.fact)]
    .map(shape => [objectShapeArtifactKey(shape), shape]));
  for (const [key, shape] of shapes) {
    const artifact = input.demand.get(key);
    const generated = artifact?.materialization === "synthetic" && !(shape.targetType.kind === "target-named" &&
      (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true);
    const deferred = new Set(input.captures.captureFrameShape.get(shape.targetType)?.bindings
      .filter(binding => binding.initialization === "deferred").map(binding => binding.fieldName));
    const members = new Map<string, CsharpObjectMemberEmission>();
    const emitted: CsharpObjectMemberEmission[] = [];
    for (const member of canonicalCsharpObjectShapeMembers(shape.members)) {
      const selection = selectCsharpObjectMemberEmission({ shape, member,
        receiverBound: artifact?.receiverBoundMethodKeys.includes(csharpObjectShapeMemberContractKey(member)) === true,
        authored: csharpObjectShapeMethodDeclaration(shape, member) !== undefined, deferred: deferred.has(member.targetName),
        implementsInterface: (shape.implements?.length ?? 0) !== 0, nativeField: input.storage.nativeField.get(shape.targetType, member.targetName) });
      if (selection.kind === "rejected") {
        if (generated || member.bound === true) issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp",
          sourceNode: member.sourceDeclarations?.[0] ?? shape.methodImplementation?.declaration, message: selection.reason });
        continue;
      }
      members.set(csharpObjectShapeMemberContractKey(member), selection.value);
      emitted.push(selection.value);
    }
    values.set(key, members);
    declarations.set(key, Object.freeze(emitted));
  }
  return Object.freeze({ records: createCsharpObjectMemberRecords(values, declarations), issues: Object.freeze(issues) });
}
