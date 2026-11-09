import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpMemoryAnalysisHost } from "../../policy/model/memory.js";
import type { CsharpNativeMemoryLayout } from "../../target-model/operations/native-memory.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations/operations.js";
import type { CsharpStorageIssue } from "../../target-model/records/storage/storage.js";
import type { CsharpNativeArrayStorage } from "../../target-model/records/native/storage-data.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact } from "../../target-model/types/model.js";
import { csharpNativeMemoryLayoutsEqual } from "../../target-model/operations/native-memory.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpNativeMemoryLayout, selectCsharpRawLocation, csharpNativeBackingLayoutRejection } from "../operations/pointers/native-memory.js";
import { selectCsharpShapeMemberByOrigins } from "../objects/shapes/member-origins.js";
import { createCsharpNativeFieldBacking } from "./native-field-backing.js";

interface CsharpNativeBackingGeometry {
  readonly layout: CsharpNativeMemoryLayout;
  readonly stride: bigint;
}

interface CsharpNativeFieldDemand extends CsharpNativeBackingGeometry {
  readonly call: Node;
  readonly expression: Node;
  readonly shape: CsharpObjectShapeFact;
  readonly member: CsharpObjectShapeMemberFact;
}

export function prepareCsharpNativeBacking(input: CsharpMemoryAnalysisHost,
  evidence: CsharpSourceEvidenceIndex, operations: CsharpTargetOperationClassifications) {
  const backings = new Map<Node, CsharpNativeBackingGeometry>();
  const arrays = new Map<Node, CsharpNativeArrayStorage>();
  const origins = new Map<Node, CsharpNativeMemoryLayout>();
  const fieldDemands: CsharpNativeFieldDemand[] = [];
  const issues: CsharpStorageIssue[] = [];
  const reject = (node: Node, message: string): void => {
    issues.push(Object.freeze({ node, code: "CSHARP_NATIVE_BACKING_NOT_PROVEN", message }));
  };
  for (const use of evidence.pointerBackingUses) {
    const selected = selectCsharpNativeMemoryLayout(input, use.layout, use.typeBindings, "raw-storage");
    if (selected.kind !== "represented") return selected;
    const layout = selected.value;
    for (const producer of use.producers) {
      const source = producer.source;
      const origin = source.operation;
      const previous = origins.get(origin.occurrence);
      if (previous !== undefined && !csharpNativeMemoryLayoutsEqual(input.typeIdentity, previous, layout)) {
        reject(use.call, "One pointer origin has incompatible physical layout demands.");
        continue;
      }
      origins.set(origin.occurrence, layout);
      if (origin.operation === "bind-pointer" || origin.operation === "project-pointer") {
        reject(use.call, "Physical pointer backing requires an allocation, address or reinterpretation, not a logical pointer.");
        continue;
      }
      if (origin.operation === "reinterpret") {
        const restored = selectCsharpRawLocation(input, origin.occurrence, source.storage.bindings);
        if (restored.kind !== "represented") return restored;
        if (restored.value?.kind !== "raw-location" || !csharpNativeMemoryLayoutsEqual(input.typeIdentity, layout, restored.value.layout)) {
          reject(origin.occurrence, "The reinterpreted location does not prove the demanded physical layout.");
        }
        continue;
      }
      const operation = operations.typedLocation.get(origin.occurrence);
      if ((operation?.kind !== "location-allocate" && operation?.kind !== "location-address") ||
        !targetTypeRefEquals(input.typeIdentity, layout.pointeeType, producer.pointeeType) ||
        !targetTypeRefEquals(input.typeIdentity, operation.pointeeType, producer.pointeeType)) {
        reject(origin.occurrence, "The physical storage origin and layout have different exact Native value types.");
        continue;
      }
      if (layout.kind === "array") {
        const storageType = sourceOutcome(input.representation.source.substitute(source.storage.type, source.storage.typeBindings));
        if (storageType.kind !== "represented") return storageType;
        const pointer = sourceOutcome(input.facts.protocols.pointerType(storageType.value));
        if (pointer.kind !== "represented") return pointer;
        const pointee = pointer.value.kind === "present" && "pointee" in pointer.value.value ? pointer.value.value.pointee : undefined;
        const extent = pointee?.type.kind === "declared" ? pointee.type.extent : undefined;
        if (extent === undefined || extent.length.toString() !== layout.length) {
          reject(origin.occurrence, "Native array backing requires its own exact declared fixed-array extent.");
          continue;
        }
      }
      const footprint = csharpNativeBackingLayoutRejection(layout);
      if (footprint !== undefined) { reject(use.call, footprint); continue; }
      const geometry = Object.freeze({ layout, stride: layout.valueStride });
      const storage = operation.kind === "location-address" ? operation.storage : undefined;
      if (storage?.kind === "reference-element-storage") {
        const receiver = sourceOutcome(input.facts.objects.use(storage.expression));
        if (receiver.kind !== "represented") return receiver;
        const component = input.sourceStorage.memory.closedArrayStorage.resolve(receiver.value.receiver.occurrence, source.storage.bindings);
        if (component.kind === "refused") return Object.freeze({ kind: "source-refused" as const, refusal: component });
        if (component.kind === "unresolved") return component;
        if (component.value.kind !== "closed") { reject(origin.occurrence, component.value.reason); continue; }
        const subjects: { readonly node: Node; readonly kind: CsharpNativeArrayStorage["kind"] }[] = [
          ...component.value.declarations.map(node => ({ node, kind: "binding" as const })),
          ...component.value.references.map(node => ({ node, kind: "reference" as const })),
          ...component.value.literals.map(node => ({ node, kind: "literal" as const })),
          ...component.value.elements.map(element => ({ node: element.occurrence, kind: "element" as const })),
        ];
        let valid = true;
        for (const declaration of component.value.declarations) {
          const carrier = input.storageTargetType.get(declaration);
          if (carrier === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A closed Native array requires every completed declared storage slot.", declaration);
          valid &&= carrier.kind === "array" && carrier.rank === undefined && targetTypeRefEquals(input.typeIdentity, carrier.element, layout.pointeeType);
        }
        for (const element of component.value.elements) {
          const carrier = input.nativeValue(element.receiver.occurrence);
          if (carrier.kind !== "represented") return carrier;
          valid &&= carrier.value.kind === "array" && carrier.value.rank === undefined && targetTypeRefEquals(input.typeIdentity, carrier.value.element, layout.pointeeType);
        }
        for (const subject of subjects) {
          const prior = arrays.get(subject.node);
          valid &&= prior === undefined || prior.stride === geometry.stride && csharpNativeMemoryLayoutsEqual(input.typeIdentity, prior.layout, layout);
        }
        if (!valid) { reject(origin.occurrence, "Native array aliases require one exact element carrier, stride and layout."); continue; }
        for (const subject of subjects) arrays.set(subject.node, Object.freeze({ kind: subject.kind, ...geometry }));
        continue;
      }
      if (storage?.kind === "reference-property-storage") {
        const use = sourceOutcome(input.facts.objects.use(storage.expression));
        if (use.kind !== "represented") return use;
        const receiver = input.nativeValue(use.value.receiver.occurrence);
        if (receiver.kind !== "represented") return receiver;
        const shape = input.objectShapes.resolveTarget(receiver.value);
        const origins = use.value.arms.flatMap(arm => arm.kind === "member" ? arm.writeOrigins : []);
        const member = shape === undefined ? undefined : selectCsharpShapeMemberByOrigins(shape, origins);
        if (shape === undefined || member === undefined) { reject(origin.occurrence, "A Native-backed field requires all Source write origins to select one completed physical member."); continue; }
        if (!fieldDemands.some(demand => demand.call === origin.occurrence)) fieldDemands.push(Object.freeze({
          ...geometry, call: origin.occurrence, expression: storage.expression, shape, member }));
        continue;
      }
      let subject = origin.occurrence;
      if (storage !== undefined) {
        if (storage.kind !== "direct-storage" || storage.identity.kind !== "local-storage" ||
          !input.ast.is.IsIdentifier(storage.expression)) {
          reject(origin.occurrence, "This addressable storage requires an exact Native field, array, parameter or local backing contract.");
          continue;
        }
        subject = storage.identity.declaration;
        if (!isNativeBinding(input, subject)) { reject(origin.occurrence, "Native backing requires an initialized block-local binding or actual by-value body parameter."); continue; }
      }
      const previousBacking = backings.get(subject);
      if (previousBacking !== undefined && !csharpNativeMemoryLayoutsEqual(input.typeIdentity, previousBacking.layout, layout)) {
        reject(origin.occurrence, "One exact storage declaration has incompatible Native layout requirements.");
      } else backings.set(subject, geometry);
    }
  }
  let open = true;
  return represented(Object.freeze({ issues: Object.freeze(issues),
    arrays: Object.freeze([...arrays].map(([subject, storage]) => Object.freeze({ subject, storage }))),
    array: (node: Node) => arrays.get(node),
    entries: Object.freeze([...backings].map(([subject, geometry]) => Object.freeze({ subject, layout: geometry.layout }))),
    get: (subject: Node) => backings.get(subject)?.layout,
    finalize(objectShapes: CsharpObjectShapeClassifications) {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native field backing finalizes exactly once per representation iteration.");
      open = false;
      const fields = createCsharpNativeFieldBacking(input, objectShapes.knownShapes());
      const issues: CsharpStorageIssue[] = [];
      for (const demand of fieldDemands) {
        const selected = fields.select(demand.shape, demand.member, demand.layout);
        if (selected.kind === "rejected") issues.push(Object.freeze({ node: demand.call, code: "CSHARP_NATIVE_BACKING_NOT_PROVEN", message: selected.reason }));
      }
      return Object.freeze({ issues: Object.freeze(issues), fields: fields.values(), closedContracts: fields.closedContracts(), field: fields.get });
    },
  }));
}

function isNativeBinding(input: CsharpMemoryAnalysisHost, declaration: Node): boolean {
  if (input.ast.is.IsParameterDeclaration(declaration)) {
    const owner = input.ast.parent(declaration);
    return owner !== undefined && (input.ast.is.IsFunctionDeclaration(owner) || input.ast.is.IsMethodDeclaration(owner)) &&
      input.ast.body(owner) !== undefined && input.ast.is.IsIdentifier(input.ast.name(declaration));
  }
  if (!input.ast.is.IsVariableDeclaration(declaration)) return false;
  const list = input.ast.parent(declaration);
  const statement = list === undefined ? undefined : input.ast.parent(list);
  const container = statement === undefined ? undefined : input.ast.parent(statement);
  return statement !== undefined && input.ast.is.IsVariableStatement(statement) && container !== undefined &&
    input.ast.is.IsBlock(container) && input.ast.as.AsVariableDeclaration(declaration)?.Initializer !== undefined;
}

export type CsharpNativeBackingPreparation = Extract<ReturnType<typeof prepareCsharpNativeBacking>,
  { readonly kind: "represented" }>["value"];
