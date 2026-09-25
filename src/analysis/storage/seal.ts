import type { Node } from "@tsonic/tsts";
import { IsTypeSyntaxNode } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpSourceArgument } from "../../policy/operations/members/selection/argument-selection.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpTargetOperationClassifications } from "../operations/index.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";
import type { CsharpStorageClassifications, CsharpStorageRepresentationClassifications } from "./model.js";
import { analyzeCsharpNativeBacking } from "./native-backing.js";

export function sealCsharpStorage(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications,
  objectShapes: CsharpObjectShapeClassifications,
  representations: CsharpStorageRepresentationClassifications,
): CsharpStorageClassifications {
  const backing = analyzeCsharpNativeBacking(policy, evidence, operations, objectShapes);
  const issues = [...representations.issues, ...backing.issues];
  if (backing.entries.length > 0 || backing.fields.length > 0 || backing.arrays.length > 0) {
    for (const sourceFile of policy.sourceFiles) visit(sourceFile);
  }
  const classifications: CsharpStorageClassifications = {
    ...representations,
    closedNativeContracts: backing.closedContracts,
    nativeArrays: backing.arrays,
    nativeArray: backing.array,
    nativeFields: backing.fields,
    nativeField: backing.field,
    nativeBackings: backing.entries,
    nativeBacking: backing.get,
    issues: Object.freeze(issues),
    requiresTypedLocationIdentity(declaration) {
      return backing.get(declaration) === undefined && backing.array(declaration) === undefined &&
        representations.requiresTypedLocationIdentity(declaration);
    },
  };
  return Object.freeze(classifications);

  function visit(node: Node): void {
    if (evidence.isCompileTimeMetadata(node) || IsTypeSyntaxNode(policy.ast, node)) return;
    const passing = selectCsharpSourceArgument(policy.sourceFacts, node);
    if (passing.kind === "resolved" && passing.argument.passingMode !== "by-value") {
      const expression = passing.argument.storageExpression;
      const declaration = policy.navigation.referenceFor(expression)?.declaration;
      const property = operations.property(expression)?.sourceOwned;
      const shape = property?.objectShape;
      const member = property?.shapeMember?.kind === "resolved" ? property.shapeMember.member : undefined;
      const field = shape === undefined || member === undefined ? undefined : backing.field(shape.targetType, member.targetName);
      if (backing.array(expression) !== undefined || field !== undefined || declaration !== undefined && backing.get(declaration) !== undefined) {
        issues.push({ node, code: "CSHARP_NATIVE_BACKING_BYREF_NOT_PROVEN",
          message: "A physically backed location cannot be passed as a managed byref without an exact native reference contract." });
      }
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }
}
