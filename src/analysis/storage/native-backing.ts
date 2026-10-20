import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpNativeArrayMemoryLayoutRejection, selectCsharpNativeMemoryLayout, selectCsharpRawLocation } from "../../policy/operations/pointers/native-memory.js";
import type { CsharpNativeMemoryLayout } from "../../target-model/operations/native-memory.js";
import { csharpNativeMemoryLayoutsEqual } from "../../target-model/operations/native-memory.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpStructuralObjectShapeIdentity } from "../../target-model/types/object-shape-identity.js";
import type { CsharpSourceEvidenceAnalysis } from "../source-evidence/model.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpNativeArrayStorage, CsharpStorageIssue } from "../../target-model/records/storage.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/object-shapes.js";
import { createCsharpNativeFieldBacking } from "./native-field-backing.js";
import { createCsharpTypeParameterEnvironment } from "../../policy/constraints/type-parameter-environment.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

interface CsharpNativeFieldDemand {
  readonly call: Node;
  readonly expression: Node;
  readonly layout: CsharpNativeMemoryLayout;
}

export function prepareCsharpNativeBacking(
  policy: CsharpPolicyContext, evidence: CsharpSourceEvidenceAnalysis,
  operations: CsharpTargetOperationClassifications,
) {
  const backings = new Map<Node, CsharpNativeMemoryLayout>();
  const fieldDemands: CsharpNativeFieldDemand[] = [];
  const arrays = new Map<Node, CsharpNativeArrayStorage>();
  const issues: CsharpStorageIssue[] = [];
  const reject = (node: Node, message: string): void => {
    issues.push(Object.freeze({ node, code: "CSHARP_NATIVE_BACKING_NOT_PROVEN", message }));
  };
  for (const { origin, layout } of evidence.pointerBackingDemands) {
    const layoutFile = policy.ast.getSourceFile(layout.call);
    const originFile = policy.ast.getSourceFile(origin.call);
    if (layoutFile === undefined || originFile === undefined) {
      reject(origin.call, "The native backing descriptor and origin require exact source files.");
      continue;
    }
    const selected = selectCsharpNativeMemoryLayout(policy, layout, layoutFile);
    if (selected === undefined) {
      reject(origin.call, csharpNativeArrayMemoryLayoutRejection(layout) ??
        "Physical backing requires an exact closed all-bit-pattern native layout.");
      continue;
    }
    if (origin.operation === "reinterpret") {
      const restored = selectCsharpRawLocation(policy, origin.call, originFile);
      if (restored?.kind !== "raw-location" || !csharpNativeMemoryLayoutsEqual(selected, restored.layout)) {
        reject(origin.call, "The reinterpreted location does not prove the demanded physical layout.");
      }
      continue;
    }
    const operation = operations.typedLocation.get(origin.call);
    if ((operation?.kind !== "location-allocate" && operation?.kind !== "location-address") ||
      !targetTypeRefEquals(selected.pointeeType, operation.pointeeType)) {
      reject(origin.call, "The physical storage origin and layout have different exact native value types.");
      continue;
    }
    let subject = origin.call;
    if (operation.kind === "location-address") {
      const storage = operation.storage;
      if (storage.kind === "reference-element-storage") {
        const component = evidence.inspectClosedArrayStorage(storage.expression);
        if (component.kind !== "closed") { reject(origin.call, component.reason); continue; }
        const subjects: [Node, CsharpNativeArrayStorage["kind"]][] = [
          ...component.declarations.map(node => [node, "binding"] as [Node, "binding"]),
          ...component.references.map(node => [node, "reference"] as [Node, "reference"]),
          ...component.literals.map(node => [node, "literal"] as [Node, "literal"]),
          ...component.elements.map(element => [element.expression, "element"] as [Node, "element"]),
        ];
        const valid = component.declarations.every(node => {
          const carrier = evidence.storageTargetType.get(node);
          return carrier?.kind === "array" && targetTypeRefEquals(carrier.element, selected.pointeeType);
        }) && component.elements.every(element => {
          const target = operations.selectedElement.get(element.expression);
          return target?.receiverType?.kind === "array" && targetTypeRefEquals(target.receiverType.element, selected.pointeeType);
        }) && subjects.every(([node]) => {
          const previous = arrays.get(node);
          return previous === undefined || previous.stride === layout.stride && csharpNativeMemoryLayoutsEqual(previous.layout, selected);
        });
        if (!valid) { reject(origin.call, "Native array aliases require one exact element carrier, stride and layout."); continue; }
        for (const [subject, kind] of subjects) arrays.set(subject, Object.freeze({ kind, layout: selected, stride: layout.stride }));
        continue;
      }
      if (storage.kind === "reference-property-storage") {
        fieldDemands.push(Object.freeze({ call: origin.call, expression: storage.expression, layout: selected }));
        continue;
      }
      if (storage.kind !== "direct-storage" || storage.identity.kind !== "local-storage" ||
        (!policy.ast.is.IsVariableDeclaration(storage.identity.declaration) && !policy.ast.is.IsParameterDeclaration(storage.identity.declaration)) ||
        !policy.ast.is.IsIdentifier(storage.expression)) {
        reject(origin.call, "This addressable storage requires a native field, element, parameter or provider backing contract.");
        continue;
      }
      subject = storage.identity.declaration;
      if (policy.ast.is.IsParameterDeclaration(subject)) {
        const owner = policy.ast.parent(subject);
        if (owner === undefined || (!policy.ast.is.IsFunctionDeclaration(owner) && !policy.ast.is.IsMethodDeclaration(owner)) ||
          policy.ast.body(owner) === undefined || !policy.ast.is.IsIdentifier(policy.ast.name(subject))) {
          reject(origin.call, "Native parameter backing requires an exact by-value source function or method parameter.");
          continue;
        }
      } else {
        const list = policy.ast.parent(subject);
        const statement = list === undefined ? undefined : policy.ast.parent(list);
        const container = statement === undefined ? undefined : policy.ast.parent(statement);
        if (statement === undefined || !policy.ast.is.IsVariableStatement(statement) ||
          container === undefined || !policy.ast.is.IsBlock(container) ||
          policy.ast.as.AsVariableDeclaration(subject)?.Initializer === undefined) {
          reject(origin.call, "Native local backing requires an initialized block-local binding.");
          continue;
        }
      }
    }
    const previous = backings.get(subject);
    if (previous !== undefined && !csharpNativeMemoryLayoutsEqual(previous, selected)) {
      reject(origin.call, "One exact storage declaration has incompatible native layout requirements.");
    } else backings.set(subject, selected);
  }
  let finalized = false;
  Object.freeze(fieldDemands);
  return Object.freeze({ issues: Object.freeze(issues),
    arrays: Object.freeze([...arrays].map(([subject, storage]) => Object.freeze({ subject, storage }))),
    array: (node: Node) => arrays.get(node),
    finalize(objectShapes: CsharpObjectShapeClassifications) {
      if (finalized) return failTargetAnalysisInvariant("tsonic-csharp", "Native field backing finalizes exactly once per complete representation iteration.");
      finalized = true;
      return finalizeCsharpNativeFieldBacking(policy, evidence, operations, objectShapes, fieldDemands);
    },
    entries: Object.freeze([...backings].map(([subject, layout]) => Object.freeze({ subject, layout }))),
    get: (subject: Node) => backings.get(subject) });
}

function finalizeCsharpNativeFieldBacking(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceAnalysis,
  operations: CsharpTargetOperationClassifications,
  objectShapes: CsharpObjectShapeClassifications,
  fieldDemands: readonly CsharpNativeFieldDemand[],
) {
  const demands = fieldDemands.map(demand => {
    const source = operations.selectedProperty.get(demand.expression)?.sourceOwned;
    const shape = source?.objectShape === undefined ? undefined : objectShapes.resolveTarget(source.objectShape.targetType);
    const member = source?.shapeMember?.kind === "resolved" ? source.shapeMember.member : undefined;
    return Object.freeze({ ...demand, shape, member });
  });
  const fields = createCsharpNativeFieldBacking(objectShapes.knownShapes(),
    createCsharpTypeParameterEnvironment(policy.ast, declaration => evidence.typeParameterConstraints.get(declaration)));
  const issues: CsharpStorageIssue[] = [];
  for (const demand of demands) {
    const { shape, member, layout } = demand;
    if (shape === undefined || csharpStructuralObjectShapeIdentity(shape.targetType) === undefined ||
      member === undefined || member.bound === true || member.memberKind !== "property" || member.readonly || member.optional ||
      member.accessor !== undefined || !targetTypeRefEquals(member.type, layout.pointeeType)) {
      issues.push(Object.freeze({ node: demand.call, code: "CSHARP_NATIVE_BACKING_NOT_PROVEN",
        message: "Native field backing requires one complete compiler-owned mutable data field." }));
      continue;
    }
    const result = fields.select(shape, member, layout);
    if (result.kind === "rejected") issues.push(Object.freeze({ node: demand.call,
      code: "CSHARP_NATIVE_BACKING_NOT_PROVEN", message: result.reason }));
  }
  return Object.freeze({ issues: Object.freeze(issues), fields: fields.values(),
    closedContracts: fields.closedContracts(), field: fields.get });
}
