import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpMemoryAnalysisHost, CsharpMemoryOutcome } from "../../policy/model/memory.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpStorageClassifications, CsharpStorageRepresentationClassifications } from "../../target-model/records/storage/storage.js";
import type { CsharpNativeLocationSelection } from "../../target-model/records/native/native-locations.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { prepareCsharpNativeBacking, type CsharpNativeBackingPreparation } from "./native-backing.js";
import { classifyCsharpNativeLocation } from "./native-locations.js";
import { classifyCsharpModuleFieldDemand } from "./module-fields.js";

export type CsharpCaptureStorageQueries = Pick<CsharpStorageClassifications,
  "storageType" | "nativeBacking" | "nativeArray" | "typedLocationIdentity">;

export interface CsharpStoragePreparation {
  readonly captures: CsharpCaptureStorageQueries;
  readonly representations: CsharpStorageRepresentationClassifications;
  readonly backing: CsharpNativeBackingPreparation;
}

export function prepareCsharpStorage(input: CsharpMemoryAnalysisHost, evidence: CsharpSourceEvidenceIndex,
  operations: CsharpTargetOperationClassifications, representations: CsharpStorageRepresentationClassifications):
  CsharpMemoryOutcome<CsharpStoragePreparation> {
  const selected = prepareCsharpNativeBacking(input, evidence, operations);
  if (selected.kind !== "represented") return selected;
  const backing = selected.value;
  const identities = new Set(representations.contracts.filter(contract => contract.typedLocationIdentity &&
    backing.get(contract.declaration) === undefined && backing.array(contract.declaration) === undefined)
    .map(contract => contract.declaration));
  const captures: CsharpCaptureStorageQueries = Object.freeze({ storageType: representations.storageType,
    nativeBacking: Object.freeze({ get: backing.get }), nativeArray: Object.freeze({ get: backing.array }),
    typedLocationIdentity: Object.freeze({ get: (declaration: Node) => identities.has(declaration) }) });
  return represented(Object.freeze({ captures, backing, representations }));
}

export function sealCsharpStorage(input: CsharpMemoryAnalysisHost, evidence: CsharpSourceEvidenceIndex,
  objectShapes: CsharpObjectShapeClassifications, preparation: CsharpStoragePreparation): CsharpMemoryOutcome<CsharpStorageClassifications> {
  const { representations, backing } = preparation;
  const fields = backing.finalize(objectShapes);
  const issues = [...representations.issues, ...backing.issues, ...fields.issues];
  const nativeLocations = new Map<Node, CsharpNativeLocationSelection>();
  const moduleFields = classifyCsharpModuleFieldDemand(input, evidence);
  if (moduleFields.kind !== "represented") return moduleFields;
  const classifications: CsharpStorageClassifications = Object.freeze({ ...representations,
    nativeModuleField: Object.freeze({ get: moduleFields.value }), closedNativeContracts: fields.closedContracts,
    nativeArrays: backing.arrays, nativeArray: Object.freeze({ get: backing.array }),
    nativeFields: fields.fields, nativeField: Object.freeze({ get: fields.field }),
    nativeBackings: backing.entries, nativeBacking: Object.freeze({ get: backing.get }),
    nativeLocation: Object.freeze({ get: (expression: Node) => nativeLocations.get(expression) }),
    issues, typedLocationIdentity: preparation.captures.typedLocationIdentity });
  for (const node of input.sourceStorage.nodes) {
    if (evidence.compileTimeMetadata.get(node)) continue;
    if (evidence.nodeTargetType.get(node) !== undefined && (input.ast.is.IsIdentifier(node) ||
      input.ast.is.IsPropertyAccessExpression(node) || input.ast.is.IsElementAccessExpression(node) ||
      input.ast.is.IsCallExpression(node) || input.ast.is.IsParenthesizedExpression(node))) {
      const file = input.ast.getSourceFile(node);
      if (file === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An enrolled Native value must retain its original Source file.", node);
      const location = classifyCsharpNativeLocation(input, node, file, classifications);
      if (location.kind !== "represented") return location;
      nativeLocations.set(node, location.value);
    }
    const passing = evidence.sourceArgument.get(node);
    if (passing === undefined || passing.argument.passingMode === "by-value") continue;
    const expression = passing.argument.storageExpression;
    const place = sourceOutcome(input.facts.protocols.storage(expression));
    if (place.kind !== "represented") return place;
    const declaration = place.value.kind === "present" && place.value.value.kind === "binding" ? place.value.value.declaration : undefined;
    if (!nativeLocations.has(expression)) {
      const file = input.ast.getSourceFile(expression);
      if (file === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted byref argument requires its original storage Source file.", expression);
      const location = classifyCsharpNativeLocation(input, expression, file, classifications);
      if (location.kind !== "represented") return location;
      nativeLocations.set(expression, location.value);
    }
    const location = nativeLocations.get(expression);
    const field = location?.kind === "resolved" && location.nativeCell?.kind === "field";
    if (backing.array(expression) !== undefined || field || declaration !== undefined && backing.get(declaration) !== undefined) {
      issues.push(Object.freeze({ node, code: "CSHARP_NATIVE_BACKING_BYREF_NOT_PROVEN",
        message: "A physically backed location cannot be passed as a managed byref without an exact native reference contract." }));
    }
  }
  Object.freeze(issues);
  return represented(classifications);
}
