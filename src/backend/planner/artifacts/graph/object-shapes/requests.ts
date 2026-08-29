import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeCapability,
  CsharpObjectShapeProjection,
  CsharpObjectShapeProjectionKind,
  TargetTypeRef,
} from "../../../../../target-model/types/index.js";
import type { CsharpArtifactGraphScope } from "../engine.js";
import type { CsharpArtifactRequestResult, CsharpObjectShapeProjectionRequestResult, CsharpObjectShapeArtifact } from "../model.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { accepted, rejected } from "../result.js";
import {
  csharpObjectShapeMemberContractKey,
  resolveCsharpObjectShapeAssignmentSourceOrder,
  resolveCsharpObjectShapeMemberBySourceContract,
  resolveCsharpObjectShapePropertyOrder,
  targetTypeRefEquals,
} from "../../../../../target-model/types/index.js";
import { objectShapeArtifactKey, isSourceDeclaredNominalShape } from "./identity.js";
import { objectShapeProjectionKey } from "../../contracts.js";

export function registerObjectShape(
  { addObjectShapesToBatch, addShapeCapabilities, collectCapabilityClosure, commitObjectShapeBatch, dependOn, inheritedObjectShapeCapabilities, prepareObjectShapeBatch, validateObjectShapeBatch }: CsharpArtifactGraphScope,
  fact: CsharpObjectShapeFact,
  requestedMaterialization: "source" | "synthetic",
): CsharpArtifactRequestResult {
  const materialization = isSourceDeclaredNominalShape(fact)
    ? "source"
    : requestedMaterialization;
  const prepared = prepareObjectShapeBatch([{ fact, materialization }]);
  if (prepared.kind === "rejected") {
    return prepared;
  }
  const capabilitiesByShape = new Map<string, Set<CsharpObjectShapeCapability>>();
  for (const capability of inheritedObjectShapeCapabilities(fact)) {
    const closure = collectCapabilityClosure(
      capability,
      fact.targetType,
      fact,
      prepared.batch.shapes,
    );
    if (closure.kind === "rejected") {
      return closure;
    }
    addShapeCapabilities(capabilitiesByShape, closure.shapes, capability);
    const expanded = addObjectShapesToBatch(
      prepared.batch,
      [...closure.shapes.values()].map((shape) => ({
        fact: shape,
        materialization: isSourceDeclaredNominalShape(shape)
          ? "source" as const
          : "synthetic" as const,
      })),
    );
    if (expanded.kind === "rejected") {
      return expanded;
    }
  }
  const projectionsByShape = new Map<
    string,
    Map<string, CsharpObjectShapeProjection>
  >();
  const validation = validateObjectShapeBatch(
    prepared.batch,
    capabilitiesByShape,
    projectionsByShape,
    new Map(),
  );
  if (validation.kind === "rejected") {
    return validation;
  }
  const committed = commitObjectShapeBatch(
    prepared.batch,
    capabilitiesByShape,
    projectionsByShape,
    new Map(),
  );
  if (committed.kind === "accepted") {
    dependOn(
      objectShapeArtifactKey(fact),
      "object-shape-type-surface",
    );
  }
  return committed;
}


export function requireObjectShapeCapability(
  { addObjectShapesToBatch, addShapeCapabilities, collectCapabilityClosure, commitObjectShapeBatch, dependOn, host, prepareObjectShapeBatch, validateObjectShapeBatch }: CsharpArtifactGraphScope,
  node: Node | undefined,
  type: TargetTypeRef,
  sourceFile: SourceFile,
  capability: CsharpObjectShapeCapability,
  rootKind: "value" | "object-shape",
): CsharpArtifactRequestResult {
  const preferredShape = node === undefined
    ? host.objectShapes.resolveTarget(type)
    : host.objectShapes.resolveNode(node, sourceFile) ??
      host.objectShapes.resolveTarget(type);
  if (rootKind === "object-shape" && preferredShape === undefined) {
    return rejected(
      `Selected '${capability}' operation requires an exact closed object-shape argument.`,
    );
  }
  const closure = collectCapabilityClosure(
    capability,
    type,
    preferredShape,
  );
  if (closure.kind === "rejected") {
    return closure;
  }
  const prepared = prepareObjectShapeBatch(
    [...closure.shapes.values()].map((shape) => ({
      fact: shape,
      materialization: isSourceDeclaredNominalShape(shape)
        ? "source" as const
        : "synthetic" as const,
    })),
  );
  if (prepared.kind === "rejected") {
    return prepared;
  }
  const completeClosure = collectCapabilityClosure(
    capability,
    type,
    preferredShape,
    prepared.batch.shapes,
  );
  if (completeClosure.kind === "rejected") {
    return completeClosure;
  }
  const expanded = addObjectShapesToBatch(
    prepared.batch,
    [...completeClosure.shapes.values()].map((shape) => ({
      fact: shape,
      materialization: isSourceDeclaredNominalShape(shape)
        ? "source" as const
        : "synthetic" as const,
    })),
  );
  if (expanded.kind === "rejected") {
    return expanded;
  }
  const capabilitiesByShape = new Map<string, Set<CsharpObjectShapeCapability>>();
  addShapeCapabilities(
    capabilitiesByShape,
    completeClosure.shapes,
    capability,
  );
  const projectionsByShape = new Map<
    string,
    Map<string, CsharpObjectShapeProjection>
  >();
  const validation = validateObjectShapeBatch(
    prepared.batch,
    capabilitiesByShape,
    projectionsByShape,
    new Map(),
  );
  if (validation.kind === "rejected") {
    return validation;
  }
  const committed = commitObjectShapeBatch(
    prepared.batch,
    capabilitiesByShape,
    projectionsByShape,
    new Map(),
  );
  if (committed.kind === "accepted") {
    for (const key of completeClosure.shapes.keys()) {
      dependOn(key, "object-shape-behavior");
    }
  }
  return committed;
}


export function objectShapeHasCapability(
  { dependOn, records }: CsharpArtifactGraphScope,
  fact: CsharpObjectShapeFact,
  capability: CsharpObjectShapeCapability,
): boolean {
  const key = objectShapeArtifactKey(fact);
  dependOn(key, "object-shape-behavior");
  return records.get(key)?.capabilities.has(capability) === true;
}


export function requireObjectShapeProjection(
  { addShapeProjection, commitObjectShapeBatch, dependOn, host, prepareObjectShapeBatch, validateObjectShapeBatch, validateProjectionShapes }: CsharpArtifactGraphScope,
  node: Node | undefined,
  type: TargetTypeRef,
  sourceFile: SourceFile,
  projectionKind: CsharpObjectShapeProjectionKind,
  resultType: TargetTypeRef,
  rootKind: "value" | "object-shape",
  assignmentSource?: {
    readonly node: Node;
    readonly type: TargetTypeRef;
  },
): CsharpObjectShapeProjectionRequestResult {
  const preferredShape = projectionKind === "assign"
    ? host.objectShapes.resolveTarget(type) ??
      (node === undefined ? undefined : host.objectShapes.resolveNode(node, sourceFile))
    : node === undefined
      ? host.objectShapes.resolveTarget(type)
      : host.objectShapes.resolveNode(node, sourceFile) ??
        host.objectShapes.resolveTarget(type);
  if (preferredShape === undefined) {
    return rootKind === "object-shape"
      ? rejected(
          `Selected '${projectionKind}' operation requires an exact closed object-shape argument.`,
        )
      : accepted;
  }
  if (isSourceDeclaredNominalShape(preferredShape)) {
    return rejected(
      `Selected '${projectionKind}' operation requires one exact generated structural object carrier; an open nominal source type cannot prove its runtime own-property set.`,
    );
  }
  const assignmentShape = projectionKind === "assign" && assignmentSource !== undefined
    ? host.objectShapes.resolveNode(assignmentSource.node, sourceFile) ??
      host.objectShapes.resolveTarget(assignmentSource.type)
    : undefined;
  if (projectionKind === "assign" && assignmentShape === undefined) {
    return rejected(
      "Selected 'assign' operation requires one exact generated structural source carrier.",
    );
  }
  if (assignmentShape !== undefined && isSourceDeclaredNominalShape(assignmentShape)) {
    return rejected(
      "Selected 'assign' operation requires one exact generated structural source carrier; an open nominal source type cannot prove its runtime own-property set.",
    );
  }
  if (projectionKind === "assign" && !targetTypeRefEquals(resultType, preferredShape.targetType)) {
    return rejected(
      "Selected 'assign' operation must preserve the exact target object-handle carrier.",
    );
  }
  const propertyOrder = projectionKind === "assign"
    ? resolveCsharpObjectShapeAssignmentSourceOrder(assignmentShape!)
    : resolveCsharpObjectShapePropertyOrder(
        preferredShape,
        node,
        projectionKind,
        host.ast,
      );
  if (propertyOrder.kind === "rejected") {
    return propertyOrder;
  }
  const assignments = projectionKind === "assign"
    ? propertyOrder.propertyOrder.map((sourceName) => {
        const sourceMember = resolveCsharpObjectShapeMemberBySourceContract(
          assignmentShape!,
          sourceName,
          "finalized-object-spread-member",
        );
        const targetMember = resolveCsharpObjectShapeMemberBySourceContract(
          preferredShape,
          sourceName,
          "finalized-object-spread-member",
        );
        return sourceMember.kind === "resolved" &&
            sourceMember.member.memberKind === "property" &&
            sourceMember.member.optional !== true &&
            sourceMember.member.accessor === undefined &&
            targetMember.kind === "resolved" &&
            targetMember.member.memberKind === "property" &&
            targetMember.member.optional !== true &&
            targetMember.member.readonly !== true &&
            targetMember.member.accessor === undefined
          ? Object.freeze({
              sourceName: sourceMember.member.sourceName,
              targetName: targetMember.member.sourceName,
            })
          : undefined;
      })
    : undefined;
  if (assignments?.some((assignment) => assignment === undefined)) {
    return rejected(
      "Selected 'assign' operation requires every exact source data property to resolve to one writable required target data property.",
    );
  }
  const prepared = prepareObjectShapeBatch([
    {
      fact: preferredShape,
      materialization: "synthetic",
    },
    ...(assignmentShape === undefined ||
        targetTypeRefEquals(assignmentShape.targetType, preferredShape.targetType)
      ? []
      : [{ fact: assignmentShape, materialization: "synthetic" as const }]),
  ]);
  if (prepared.kind === "rejected") {
    return prepared;
  }
  if (assignmentShape !== undefined &&
    !targetTypeRefEquals(assignmentShape.targetType, preferredShape.targetType)) {
    const ownerKey = objectShapeArtifactKey(preferredShape);
    const dependencies = prepared.batch.dependencies.get(ownerKey) ?? new Set<string>();
    dependencies.add(objectShapeArtifactKey(assignmentShape));
    prepared.batch.dependencies.set(ownerKey, dependencies);
  }
  const projectedShapes = new Map([
    [objectShapeArtifactKey(preferredShape), preferredShape],
  ]);
  const projection: CsharpObjectShapeProjection = projectionKind === "assign"
    ? Object.freeze({
        kind: "assign",
        resultType,
        sourceShape: assignmentShape!,
        propertyOrder: propertyOrder.propertyOrder,
        assignments: Object.freeze(assignments as readonly {
          readonly sourceName: string;
          readonly targetName: string;
        }[]),
      })
    : Object.freeze({
        kind: projectionKind,
        resultType,
        propertyOrder: propertyOrder.propertyOrder,
      });
  const projectionFailure = validateProjectionShapes(
    projectedShapes,
    projection,
  );
  if (projectionFailure !== undefined) {
    return rejected(projectionFailure);
  }
  const projectionsByShape = new Map<
    string,
    Map<string, CsharpObjectShapeProjection>
  >();
  addShapeProjection(projectionsByShape, projectedShapes, projection);
  const capabilitiesByShape = new Map<string, Set<CsharpObjectShapeCapability>>();
  const validation = validateObjectShapeBatch(
    prepared.batch,
    capabilitiesByShape,
    projectionsByShape,
    new Map(),
  );
  if (validation.kind === "rejected") {
    return validation;
  }
  const committed = commitObjectShapeBatch(
    prepared.batch,
    capabilitiesByShape,
    projectionsByShape,
    new Map(),
  );
  if (committed.kind === "accepted") {
    for (const key of projectedShapes.keys()) {
      dependOn(key, "object-shape-behavior");
    }
  }
  return committed.kind === "rejected"
    ? committed
    : { kind: "accepted", projection };
}


export function objectShapeProjections(
  { dependOn, records }: CsharpArtifactGraphScope,
  fact: CsharpObjectShapeFact,
): readonly CsharpObjectShapeProjection[] {
  const key = objectShapeArtifactKey(fact);
  dependOn(key, "object-shape-behavior");
  return Object.freeze(
    [...(records.get(key)?.projections.values() ?? [])].sort((left, right) =>
      objectShapeProjectionKey(left).localeCompare(objectShapeProjectionKey(right))
    ),
  );
}


export function requireObjectShapeMethodReceiver(
  { commitObjectShapeBatch, dependOn, prepareObjectShapeBatch, validateObjectShapeBatch }: CsharpArtifactGraphScope,
  fact: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
): CsharpArtifactRequestResult {
  const memberKey = csharpObjectShapeMemberContractKey(member);
  const exactMember = fact.members.find((candidate) =>
    csharpObjectShapeMemberContractKey(candidate) === memberKey
  );
  if (exactMember?.memberKind !== "method") {
    return rejected(
      "A receiver-bound object-shape implementation requires an exact method member from its structural contract.",
    );
  }
  const prepared = prepareObjectShapeBatch([{
    fact,
    materialization: isSourceDeclaredNominalShape(fact)
      ? "source"
      : "synthetic",
  }]);
  if (prepared.kind === "rejected") {
    return prepared;
  }
  const receiverBoundMethodsByShape = new Map([
    [objectShapeArtifactKey(fact), new Set([memberKey])],
  ]);
  const capabilitiesByShape = new Map<string, Set<CsharpObjectShapeCapability>>();
  const projectionsByShape = new Map<
    string,
    Map<string, CsharpObjectShapeProjection>
  >();
  const validation = validateObjectShapeBatch(
    prepared.batch,
    capabilitiesByShape,
    projectionsByShape,
    receiverBoundMethodsByShape,
  );
  if (validation.kind === "rejected") {
    return validation;
  }
  const committed = commitObjectShapeBatch(
    prepared.batch,
    capabilitiesByShape,
    projectionsByShape,
    receiverBoundMethodsByShape,
  );
  if (committed.kind === "accepted") {
    dependOn(objectShapeArtifactKey(fact), "object-shape-type-surface");
  }
  return committed;
}


export function objectShapeMethodUsesReceiver(
  { dependOn, records }: CsharpArtifactGraphScope,
  fact: CsharpObjectShapeFact,
  member: CsharpObjectShapeFact["members"][number],
): boolean {
  const key = objectShapeArtifactKey(fact);
  dependOn(key, "object-shape-type-surface");
  return records.get(key)?.receiverBoundMethodKeys.has(
    csharpObjectShapeMemberContractKey(member),
  ) === true;
}


export function objectShapeArtifacts(
  { records }: CsharpArtifactGraphScope,
): readonly CsharpObjectShapeArtifact[] {
  return [...records]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, record]) => Object.freeze({
      key,
      fact: record.fact,
      materialization: record.materialization,
      capabilities: Object.freeze([...record.capabilities].sort()),
      projections: Object.freeze(
        [...record.projections.values()].sort((left, right) =>
          objectShapeProjectionKey(left).localeCompare(objectShapeProjectionKey(right))
        ),
      ),
      receiverBoundMethodKeys: Object.freeze(
        [...record.receiverBoundMethodKeys].sort(),
      ),
      dependencies: Object.freeze([...record.dependencies].sort()),
      dependents: Object.freeze([...record.dependents].sort()),
    }));
}


export function connect(
  { records }: CsharpArtifactGraphScope,
ownerKey: string, dependencyKey: string): void {
  const owner = records.get(ownerKey);
  const dependency = records.get(dependencyKey);
  if (
    owner === undefined ||
    dependency === undefined ||
    owner.dependencies.has(dependencyKey)
  ) {
    return;
  }
  owner.dependencies.add(dependencyKey);
  dependency.dependents.add(ownerKey);
}
