import type { Node } from "@tsonic/tsts";
import { IsTypeSyntaxNode } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpSourceArgument } from "../../source/extension/arguments.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpSourceEvidenceAnalysis } from "../source-evidence/model.js";
import type { CsharpStorageClassifications, CsharpStorageRepresentationClassifications } from "../../target-model/records/storage.js";
import { prepareCsharpNativeBacking } from "./native-backing.js";
import { classifyCsharpNativeLocation } from "./native-locations.js";
import { classifyCsharpModuleFieldDemand } from "./module-fields.js";

export type CsharpCaptureStorageQueries = Pick<CsharpStorageClassifications,
  "storageType" | "nativeBacking" | "nativeArray" | "typedLocationIdentity">;

export interface CsharpStoragePreparation {
  readonly captures: CsharpCaptureStorageQueries;
  readonly representations: CsharpStorageRepresentationClassifications;
  readonly backing: ReturnType<typeof prepareCsharpNativeBacking>;
}

export function prepareCsharpStorage(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceAnalysis,
  operations: CsharpTargetOperationClassifications,
  representations: CsharpStorageRepresentationClassifications,
): CsharpStoragePreparation {
  const backing = prepareCsharpNativeBacking(policy, evidence, operations);
  const identities = new Set(representations.contracts.filter(contract => contract.typedLocationIdentity &&
    backing.get(contract.declaration) === undefined && backing.array(contract.declaration) === undefined)
    .map(contract => contract.declaration));
  const captures: CsharpCaptureStorageQueries = Object.freeze({
    storageType: representations.storageType,
    nativeBacking: Object.freeze({ get: backing.get }),
    nativeArray: Object.freeze({ get: backing.array }),
    typedLocationIdentity: Object.freeze({ get: (declaration: Node) => identities.has(declaration) }),
  });
  return Object.freeze({ captures, backing, representations });
}

export function sealCsharpStorage(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceAnalysis,
  operations: CsharpTargetOperationClassifications,
  objectShapes: CsharpObjectShapeClassifications,
  preparation: CsharpStoragePreparation,
): CsharpStorageClassifications {
  const { representations, backing } = preparation;
  const fields = backing.finalize(objectShapes);
  const issues = [...representations.issues, ...backing.issues, ...fields.issues];
  const nativeLocations = new WeakMap<Node, ReturnType<typeof classifyCsharpNativeLocation>>();
  const sourceFiles = policy.sourceFiles;
  const classifications: CsharpStorageClassifications = {
    ...representations,
    nativeModuleField: Object.freeze({ get: classifyCsharpModuleFieldDemand(policy, evidence) }),
    closedNativeContracts: fields.closedContracts,
    nativeArrays: backing.arrays,
    nativeArray: Object.freeze({ get: backing.array }),
    nativeFields: fields.fields,
    nativeField: Object.freeze({ get: fields.field }),
    nativeBackings: backing.entries,
    nativeBacking: Object.freeze({ get: backing.get }),
    nativeLocation: Object.freeze({ get: expression => nativeLocations.get(expression) }),
    issues,
    typedLocationIdentity: preparation.captures.typedLocationIdentity,
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
        operations.classPropertyStorage.get, classifications, evidence.readStorageTargetType.get));
    }
    const passing = selectCsharpSourceArgument(policy.sourceFacts, node);
    if (passing.kind === "resolved" && passing.argument.passingMode !== "by-value") {
      const expression = passing.argument.storageExpression;
      const declaration = policy.navigation.referenceFor(expression)?.declaration;
      const property = operations.selectedProperty.get(expression)?.sourceOwned;
      const shape = property?.objectShape;
      const member = property?.shapeMember?.kind === "resolved" ? property.shapeMember.member : undefined;
      const field = shape === undefined || member === undefined ? undefined : fields.field(shape.targetType, member.targetName);
      if (backing.array(expression) !== undefined || field !== undefined || declaration !== undefined && backing.get(declaration) !== undefined) {
        issues.push({ node, code: "CSHARP_NATIVE_BACKING_BYREF_NOT_PROVEN",
          message: "A physically backed location cannot be passed as a managed byref without an exact native reference contract." });
      }
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }
}
