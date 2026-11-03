import type { Node } from "@tsonic/tsts";
import { tsonicDataLayoutFactKey } from "@tsonic/source-core/facts";
import type { TsonicDataLayoutFact, TsonicMemoryLayoutFact } from "@tsonic/source-core/facts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { csharpNativeArrayMemoryLayoutRejection, selectCsharpDeclaredNativeMemoryLayout, selectCsharpNativeMemoryLayout, selectCsharpRawLocation } from "../operations/pointers/native-memory.js";
import type { CsharpNativeMemoryLayout } from "../../target-model/operations/native-memory.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import { csharpNativeMemoryLayoutsEqual } from "../../target-model/operations/native-memory.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpStructuralObjectShapeIdentity } from "../../target-model/types/object-shape-identity.js";
import type { CsharpSourceEvidenceAnalysis } from "../source-evidence/model.js";
import type { CsharpPropertyClassification, CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpNativeArrayStorage, CsharpStorageIssue } from "../../target-model/records/storage/storage.js";
import type { CsharpObjectShapeFact } from "../../target-model/types/model.js";
import { createCsharpNativeFieldBacking } from "./native-field-backing.js";
import { createCsharpTypeParameterEnvironment } from "../source-evidence/types/resolution/type-parameter-environment.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

interface CsharpNativeFieldDemand {
  readonly call: Node;
  readonly expression: Node;
  readonly layout: CsharpNativeMemoryLayout;
  readonly stride: bigint;
  readonly source: CsharpPropertyClassification["sourceOwned"];
}

interface CsharpNativeBackingGeometry {
  readonly layout: CsharpNativeMemoryLayout;
  readonly stride: bigint;
}

export function prepareCsharpNativeBacking(
  policy: CsharpPolicyContext, evidence: CsharpSourceEvidenceAnalysis,
  operations: CsharpTargetOperationClassifications, valueRead: CsharpValueReadClassifications["valueRead"],
) {
  const backings = new Map<Node, CsharpNativeBackingGeometry>();
  const fieldDemands: CsharpNativeFieldDemand[] = [];
  const arrays = new Map<Node, CsharpNativeArrayStorage>();
  const retainedLayouts = new Map<Node, { readonly layout: CsharpNativeMemoryLayout;
    readonly dataLayout: TsonicDataLayoutFact; readonly stride: bigint }>();
  const rejectedLayouts = new Set<Node>();
  const issues: CsharpStorageIssue[] = [];
  const reject = (node: Node, message: string): void => {
    issues.push(Object.freeze({ node, code: "CSHARP_NATIVE_BACKING_NOT_PROVEN", message }));
  };
  const retainLayout = (origin: Node, use: Node, layout: TsonicMemoryLayoutFact, native: CsharpNativeMemoryLayout): boolean => {
    const previous = retainedLayouts.get(origin);
    if (previous !== undefined && (previous.stride !== layout.stride ||
      !tsonicDataLayoutFactKey.equals(previous.dataLayout, layout.dataLayout) ||
      !csharpNativeMemoryLayoutsEqual(previous.layout, native))) {
      issues.push(Object.freeze({ node: use, code: "CSHARP_POINTER_BACKING_NOT_PROVEN",
        message: "One pointer origin has incompatible physical layout demands." }));
      return false;
    }
    retainedLayouts.set(origin, { layout: native, dataLayout: layout.dataLayout, stride: layout.stride });
    return true;
  };
  for (const use of evidence.pointerBackingUses) {
    const layout = use.layout;
    const layoutFile = policy.ast.getSourceFile(layout.call);
    if (layoutFile === undefined) {
      reject(use.call, "The native backing descriptor and origin require exact source files.");
      continue;
    }
    const descriptor = selectCsharpNativeMemoryLayout(policy, layout, layoutFile);
    if (descriptor === undefined) {
      reject(use.call, csharpNativeArrayMemoryLayoutRejection(layout) ??
        "Physical backing requires an exact closed all-bit-pattern native layout.");
      continue;
    }
    for (const producer of use.producers) {
      const origin = producer.source.operation;
      if (origin.operation === "bind-pointer" || origin.operation === "project-pointer") {
        issues.push(Object.freeze({ node: use.call, code: "CSHARP_POINTER_BACKING_NOT_PROVEN",
          message: "Physical pointer backing requires an allocation, address or reinterpretation, not a logical pointer." }));
        continue;
      }
      const originFile = producer.source.storage.sourceFile;
      if (originFile !== policy.ast.getSourceFile(origin.call)) {
        reject(use.call, "The native backing descriptor and origin require exact source files.");
        continue;
      }
      if (origin.operation === "reinterpret") {
        if (!retainLayout(origin.call, use.call, layout, descriptor)) continue;
        const restored = selectCsharpRawLocation(policy, origin.call, originFile);
        if (restored?.kind !== "raw-location" || !csharpNativeMemoryLayoutsEqual(descriptor, restored.layout)) {
          reject(origin.call, "The reinterpreted location does not prove the demanded physical layout.");
        }
        continue;
      }
      const operation = operations.typedLocation.get(origin.call);
      if ((operation?.kind !== "location-allocate" && operation?.kind !== "location-address") ||
        !targetTypeRefEquals(descriptor.pointeeType, producer.pointeeType) ||
        !targetTypeRefEquals(operation.pointeeType, producer.pointeeType)) {
        reject(origin.call, "The physical storage origin and layout have different exact native value types.");
        continue;
      }
      const storage = operation.kind === "location-address" ? operation.storage : undefined;
      let subject = storage?.kind === "direct-storage" && storage.identity.kind === "local-storage"
        ? storage.identity.declaration : origin.call;
      let declared: CsharpNativeBackingGeometry | undefined = storage?.kind === "reference-element-storage"
        ? arrays.get(storage.expression) : storage?.kind === "reference-property-storage"
          ? fieldDemands.find(demand => demand.call === origin.call) : backings.get(subject);
      if (declared === undefined) {
        const selected = selectCsharpDeclaredNativeMemoryLayout(policy, operation.pointeeType,
          origin.pointeeType, originFile, layout.dataLayout, valueRead);
        if (selected.kind === "rejected") {
          if (!rejectedLayouts.has(use.call)) {
            rejectedLayouts.add(use.call);
            reject(use.call, selected.reason);
          }
          continue;
        }
        declared = Object.freeze({ layout: selected.layout, stride: selected.stride });
      }
      if (declared.stride !== layout.stride || !csharpNativeMemoryLayoutsEqual(declared.layout, descriptor)) {
        if (!rejectedLayouts.has(use.call)) {
          rejectedLayouts.add(use.call);
          reject(use.call, "The raw-use descriptor does not equal the storage's declared native layout.");
        }
        continue;
      }
      const { layout: selected, stride } = declared;
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
            return previous === undefined || previous.stride === stride && csharpNativeMemoryLayoutsEqual(previous.layout, selected);
          });
          if (!valid) { reject(origin.call, "Native array aliases require one exact element carrier, stride and layout."); continue; }
          for (const [subject, kind] of subjects) arrays.set(subject, Object.freeze({ kind, layout: selected, stride }));
          continue;
        }
        if (storage.kind === "reference-property-storage") {
          if (!fieldDemands.some(demand => demand.call === origin.call)) {
            fieldDemands.push(Object.freeze({ call: origin.call, expression: storage.expression, layout: selected, stride,
              source: operations.selectedProperty.get(storage.expression)?.sourceOwned,
            }));
          }
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
      if (previous !== undefined && (previous.stride !== stride || !csharpNativeMemoryLayoutsEqual(previous.layout, selected))) {
        reject(origin.call, "One exact storage declaration has incompatible native layout requirements.");
      } else backings.set(subject, declared);
    }
  }
  let fields: ReturnType<typeof finalizeCsharpNativeFieldBacking> | undefined;
  Object.freeze(fieldDemands);
  return Object.freeze({ issues: Object.freeze(issues),
    arrays: Object.freeze([...arrays].map(([subject, storage]) => Object.freeze({ subject, storage }))),
    array: (node: Node) => arrays.get(node),
    publishFields(shapes: readonly CsharpObjectShapeFact[]): void {
      if (fields !== undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Current native field layout consumes one complete implementing-shape publication.");
      fields = finalizeCsharpNativeFieldBacking(policy, evidence, shapes, fieldDemands);
    },
    get fields() {
      if (fields === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "Native storage reads require completed current field-layout publication.");
      return fields;
    },
    entries: Object.freeze([...backings].map(([subject, geometry]) => Object.freeze({ subject, layout: geometry.layout }))),
    get: (subject: Node) => backings.get(subject)?.layout });
}

function finalizeCsharpNativeFieldBacking(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceAnalysis,
  shapes: readonly CsharpObjectShapeFact[],
  fieldDemands: readonly CsharpNativeFieldDemand[],
) {
  const demands = fieldDemands.map(demand => {
    const source = demand.source;
    const targetType = source?.objectShape?.targetType;
    const shape = targetType === undefined ? undefined
      : shapes.find(shape => targetTypeRefEquals(shape.targetType, targetType));
    const member = source?.shapeMember?.kind === "resolved" ? source.shapeMember.member : undefined;
    return Object.freeze({ ...demand, shape, member });
  });
  const fields = createCsharpNativeFieldBacking(shapes,
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
