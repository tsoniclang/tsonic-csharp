import type { Node } from "@tsonic/tsts";
import { IsTypeSyntaxNode } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpSourceArgument } from "../../policy/operations/members/selection/argument-selection.js";
import type { CsharpObjectShapeClassifications } from "../objects/index.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpSourceEvidenceAnalysis } from "../source-evidence/model.js";
import type { CsharpStorageClassifications, CsharpStorageRepresentationClassifications } from "../../target-model/records/storage.js";
import { analyzeCsharpNativeBacking } from "./native-backing.js";
import { classifyCsharpNativeLocation } from "./native-locations.js";
import { classifyCsharpModuleFieldDemand } from "./module-fields.js";

export function sealCsharpStorage(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceAnalysis,
  operations: CsharpTargetOperationClassifications,
  objectShapes: CsharpObjectShapeClassifications,
  representations: CsharpStorageRepresentationClassifications,
): CsharpStorageClassifications {
  const backing = analyzeCsharpNativeBacking(policy, evidence, operations, objectShapes);
  const issues = [...representations.issues, ...backing.issues];
  const nativeLocations = new WeakMap<Node, ReturnType<typeof classifyCsharpNativeLocation>>();
  const sourceFiles = policy.sourceFiles;
  const classifications: CsharpStorageClassifications = {
    ...representations,
    nativeModuleField: Object.freeze({ get: classifyCsharpModuleFieldDemand(policy, evidence) }),
    closedNativeContracts: backing.closedContracts,
    nativeArrays: backing.arrays,
    nativeArray: Object.freeze({ get: backing.array }),
    nativeFields: backing.fields,
    nativeField: Object.freeze({ get: backing.field }),
    nativeBackings: backing.entries,
    nativeBacking: Object.freeze({ get: backing.get }),
    nativeLocation: Object.freeze({ get: expression => nativeLocations.get(expression) }),
    issues,
    typedLocationIdentity: Object.freeze({ get(declaration) {
      return backing.get(declaration) === undefined && backing.array(declaration) === undefined &&
        representations.typedLocationIdentity.get(declaration);
    } }),
  };
  for (const sourceFile of sourceFiles) visit(sourceFile);
  Object.freeze(issues);
  return Object.freeze(classifications);

  function visit(node: Node): void {
    if (evidence.compileTimeMetadata.get(node) || IsTypeSyntaxNode(policy.ast, node)) return;
    if (!policy.types.nativeUnreachable(node) && (policy.ast.is.IsIdentifier(node) ||
      policy.ast.is.IsPropertyAccessExpression(node) || policy.ast.is.IsElementAccessExpression(node) ||
      policy.ast.is.IsCallExpression(node) || policy.ast.is.IsParenthesizedExpression(node))) {
      nativeLocations.set(node, classifyCsharpNativeLocation(policy, node, policy.ast.getSourceFile(node)!,
        operations.classPropertyStorage.get, classifications));
    }
    const passing = selectCsharpSourceArgument(policy.sourceFacts, node);
    if (passing.kind === "resolved" && passing.argument.passingMode !== "by-value") {
      const expression = passing.argument.storageExpression;
      const declaration = policy.navigation.referenceFor(expression)?.declaration;
      const property = operations.selectedProperty.get(expression)?.sourceOwned;
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
