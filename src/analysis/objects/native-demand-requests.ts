import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeCapability,
  CsharpObjectShapeProjection,
  CsharpObjectShapeProjectionKind,
  TargetTypeRef,
} from "../../target-model/types/index.js";
import type { CsharpObjectShapeDemandScope } from "./native-demand-batches.js";
import { selectCsharpJsonObjectShapeContract } from "../../policy/types/objects/json-object-shapes.js";
import type { CsharpArtifactRequestResult, CsharpObjectShapeProjectionRequestResult } from "./native-demand-batches.js";
import type { CsharpObjectShapeArtifactClosure, CsharpObjectShapeDeclarationNaming, CsharpObjectShapeDemandClosure, CsharpPreparedObjectShapeProjection } from "../../target-model/records/object-shape-demand.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { accepted, rejected } from "./native-demand-batches.js";
import {
  csharpObjectShapeMemberContractKey,
  resolveCsharpObjectShapeMemberBySourceContract,
  resolveCsharpObjectShapeMemberBySourceKey,
  targetTypeRefEquals,
  isCsharpEmptyObjectTargetType,
  isSourceDeclaredNominalShape,
} from "../../target-model/types/index.js";
import { objectShapeArtifactKey } from "../../target-model/records/object-shape-keys.js";
import { objectShapeMaterialization } from "../../policy/types/objects/object-shape-materialization.js";
import { objectShapeProjectionKey } from "../../target-model/records/object-shape-keys.js";
import { csharpObjectShapeMethodDeclaration } from "../../target-model/types/method-values.js";
import type { CsharpObjectShapeDemandHost } from "./native-demand-batches.js";
import type { CsharpObjectShapeProjectionAdmission } from "../../target-model/records/object-shape-demand.js";
import { objectShapeProjectionConversions,
  prepareCsharpObjectShapeProjectionDeclaration } from "./native-demand-declarations.js";
import { prepareCsharpObjectShapeDeclarationNames } from "../names/object-shapes.js";
import {
  collectShapeDependencies,
  prepareObjectShapeBatch,
  addObjectShapesToBatch,
  validateObjectShapeBatch,
  commitObjectShapeBatch,
} from "./native-demand-batches.js";
import {
  collectJsonClosure,
  collectCapabilityClosure,
  addShapeCapabilities,
  validateProjectionShapes,
  addShapeProjection,
  visibleObjectShapes,
  collectJsonType,
  collectJsonShape,
  inheritedObjectShapeCapabilities,
} from "./native-demand-closure.js";

export function registerObjectShape(
  { addObjectShapesToBatch, addShapeCapabilities, collectCapabilityClosure, commitObjectShapeBatch, host, inheritedObjectShapeCapabilities, prepareObjectShapeBatch, validateObjectShapeBatch }: CsharpObjectShapeDemandScope,
  fact: CsharpObjectShapeFact,
  requestedMaterialization: "source" | "synthetic",
): CsharpArtifactRequestResult {
  fact = host.objectShapes.resolveTarget(fact.targetType) ?? fact;
  if (isCsharpEmptyObjectTargetType(fact.targetType)) {
    return fact.members.length === 0 && (fact.implements?.length ?? 0) === 0
      ? accepted
      : rejected("An empty-object carrier cannot contain members or implemented contracts.");
  }
  const materialization = objectShapeMaterialization(fact) === "source"
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
        materialization: objectShapeMaterialization(shape),
      })),
    );
    if (expanded.kind === "rejected") {
      return expanded;
    }
  }
  const projectionsByShape = new Map<
    string,
    Map<string, CsharpObjectShapeProjectionAdmission>
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
  return committed;
}

export function requireObjectShapeCapability(
  { addObjectShapesToBatch, addShapeCapabilities, collectCapabilityClosure, commitObjectShapeBatch, host, prepareObjectShapeBatch, validateObjectShapeBatch }: CsharpObjectShapeDemandScope,
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
      materialization: objectShapeMaterialization(shape),
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
      materialization: objectShapeMaterialization(shape),
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
    Map<string, CsharpObjectShapeProjectionAdmission>
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
  return committed;
}

export function requireObjectShapeProjection(
  { addShapeProjection, commitObjectShapeBatch, host, records, prepareObjectShapeBatch, validateObjectShapeBatch, validateProjectionShapes,
    projections: publishedProjections }: CsharpObjectShapeDemandScope,
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
  if (!["keys", "values", "entries", "has-own", "assign"].includes(projectionKind)) {
    return rejected("Object-shape projection requires an exact native enumeration or assignment contract.");
  }
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
    ? host.objectShapes.assignmentSourceOrder(assignmentShape!)
    : host.objectShapes.propertyOrder(
        preferredShape,
        node,
        projectionKind,
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
  const conversions = objectShapeProjectionConversions(host, preferredShape, projection);
  if (conversions.kind === "rejected") return conversions;
  const previous = node === undefined ? undefined : publishedProjections.get(node);
  if (previous !== undefined && (!targetTypeRefEquals(previous.receiver.targetType, preferredShape.targetType) ||
      objectShapeProjectionKey(previous.selection) !== objectShapeProjectionKey(projection))) {
    return rejected("One native object-shape projection requires one exact admitted projection contract.");
  }
  const projectionsByShape = new Map<
    string,
    Map<string, CsharpObjectShapeProjectionAdmission>
  >();
  const published = previous?.selection ?? records.get(objectShapeArtifactKey(preferredShape))?.projections.get(objectShapeProjectionKey(projection))?.selection ?? projection;
  addShapeProjection(projectionsByShape, projectedShapes, Object.freeze({ selection: published, conversions: conversions.conversions, emission: conversions.emission }));
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
  if (committed.kind === "rejected") return committed;
  if (node !== undefined) publishedProjections.set(node, Object.freeze({ receiver: preferredShape, selection: published }));
  return { kind: "accepted", projection: published };
}

export function requireObjectShapeMethodReceiver(
  { commitObjectShapeBatch, prepareObjectShapeBatch, validateObjectShapeBatch }: CsharpObjectShapeDemandScope,
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
    materialization: objectShapeMaterialization(fact),
  }]);
  if (prepared.kind === "rejected") {
    return prepared;
  }
  const receiverBoundMethodsByShape = new Map<string, Set<string>>();
  const nativeReceiver = exactMember.methodValueContract !== undefined && exactMember.methodStorageType === undefined &&
    csharpObjectShapeMethodDeclaration(fact, exactMember) !== undefined;
  if (!nativeReceiver) {
    receiverBoundMethodsByShape.set(objectShapeArtifactKey(fact), new Set([memberKey]));
    if (fact.declarationTemplate !== undefined) {
      const selected = resolveCsharpObjectShapeMemberBySourceKey(fact.declarationTemplate, exactMember.sourceKey,
        "checked-object-literal-property");
      if (selected.kind !== "resolved" || selected.member.memberKind !== "method" || selected.member.targetName !== exactMember.targetName) {
        return failTargetAnalysisInvariant("tsonic-csharp", "A closed method receiver requires its exact native declaration member.");
      }
      receiverBoundMethodsByShape.set(objectShapeArtifactKey(fact.declarationTemplate),
        new Set([csharpObjectShapeMemberContractKey(selected.member)]));
    }
  }
  const capabilitiesByShape = new Map<string, Set<CsharpObjectShapeCapability>>();
  const projectionsByShape = new Map<
    string,
    Map<string, CsharpObjectShapeProjectionAdmission>
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
  return committed;
}

export function closeObjectShapeArtifacts(
  { records, host, jsonContracts }: CsharpObjectShapeDemandScope,
): readonly CsharpObjectShapeArtifactClosure[] {
  const declarations = new Map<string, {
    readonly capabilities: Set<CsharpObjectShapeCapability>;
    readonly projections: Map<string, CsharpPreparedObjectShapeProjection>;
    readonly naming: CsharpObjectShapeDeclarationNaming;
  }>();
  for (const record of records.values()) {
    const key = objectShapeArtifactKey(record.fact.declarationTemplate ?? record.fact);
    if (!records.has(key)) return failTargetAnalysisInvariant("tsonic-csharp",
      "An admitted closed shape requires its canonical native declaration artifact.");
    const declaration = declarations.get(key) ?? {
      capabilities: new Set<CsharpObjectShapeCapability>(),
      projections: new Map<string, CsharpPreparedObjectShapeProjection>(),
      naming: prepareCsharpObjectShapeDeclarationNames(host, records.get(key)!.fact),
    };
    for (const capability of record.capabilities) declaration.capabilities.add(capability);
    for (const projection of record.projections.values()) {
      const selected = prepareCsharpObjectShapeProjectionDeclaration(record.fact, projection.selection,
        declaration.naming.parameters, projection.conversions, projection.emission);
      declaration.projections.set(selected.methodName, selected);
    }
    declarations.set(key, declaration);
  }
  return [...records]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, record]) => {
      const declaration = record.fact.declarationTemplate;
      const owner = declaration === undefined ? record : records.get(objectShapeArtifactKey(declaration));
      if (owner === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "An admitted closed shape requires its canonical native declaration artifact.");
      const surface = declarations.get(objectShapeArtifactKey(owner.fact));
      if (surface === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "An admitted shape requires its canonical native declaration surface.");
      const receivers = new Set(record.receiverBoundMethodKeys);
      if (declaration !== undefined) for (const member of declaration.members) {
        if (!owner.receiverBoundMethodKeys.has(csharpObjectShapeMemberContractKey(member))) continue;
        const selected = resolveCsharpObjectShapeMemberBySourceKey(record.fact, member.sourceKey, "checked-object-literal-property");
        if (selected.kind !== "resolved" || selected.member.memberKind !== "method" || selected.member.targetName !== member.targetName) {
          return failTargetAnalysisInvariant("tsonic-csharp", "A closed artifact requires its exact native receiver correspondence.");
        }
        receivers.add(csharpObjectShapeMemberContractKey(selected.member));
      }
      let jsonContract = jsonContracts.get(record.fact);
      if (surface.capabilities.has("json-serialization") && jsonContract === undefined) {
        jsonContract = selectCsharpJsonObjectShapeContract({ shape: record.fact });
        jsonContracts.set(record.fact, jsonContract);
      }
      if (jsonContract?.kind === "rejected" && surface.capabilities.has("json-serialization"))
        return failTargetAnalysisInvariant("tsonic-csharp", "An admitted JSON declaration requires its exact native template contract.", record.fact.methodImplementation?.declaration);
      return Object.freeze({
        jsonContract: surface.capabilities.has("json-serialization") && jsonContract?.kind === "resolved" ? jsonContract.contract : undefined,
        key,
        fact: record.fact,
        materialization: record.materialization,
        capabilities: Object.freeze([...surface.capabilities].sort()),
        projections: Object.freeze(
          [...surface.projections.values()].sort((left, right) =>
            left.methodName.localeCompare(right.methodName)
          ),
        ),
        naming: surface.naming,
        receiverBoundMethodKeys: Object.freeze(
          [...receivers].sort(),
        ),
        dependencies: Object.freeze([...record.dependencies].sort()),
        dependents: Object.freeze([...record.dependents].sort()),
      });
    });
}

export function connect(
  { records }: CsharpObjectShapeDemandScope,
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

export function createCsharpObjectShapeDemandEngine(host: CsharpObjectShapeDemandHost):
  Pick<CsharpObjectShapeDemandScope, "registerObjectShape" | "requireObjectShapeCapability" |
    "requireObjectShapeProjection" | "requireObjectShapeMethodReceiver"> & {
      readonly close: () => CsharpObjectShapeDemandClosure;
    } {
  let scope: CsharpObjectShapeDemandScope;
  let sealed = false;
  const requireOpen = (): void => {
    if (sealed) throw new Error("C# object-shape artifact demand is sealed.");
  };
  const operations: Omit<CsharpObjectShapeDemandScope, "host" | "records" | "projections" | "jsonContracts"> = {
    registerObjectShape(fact, materialization) {
      requireOpen();
      return registerObjectShape(scope, fact, materialization);
    },
    requireObjectShapeCapability(node, type, file, capability, rootKind) {
      requireOpen();
      return requireObjectShapeCapability(scope, node, type, file, capability, rootKind);
    },
    requireObjectShapeProjection(node, type, file, projection, resultType, rootKind, assignmentSource) {
      requireOpen();
      return requireObjectShapeProjection(scope, node, type, file, projection, resultType, rootKind, assignmentSource);
    },
    requireObjectShapeMethodReceiver(fact, member) {
      requireOpen();
      return requireObjectShapeMethodReceiver(scope, fact, member);
    },
    closeObjectShapeArtifacts: () => closeObjectShapeArtifacts(scope),
    connect: (owner, dependency) => connect(scope, owner, dependency),
    collectShapeDependencies: root => collectShapeDependencies(scope, root),
    prepareObjectShapeBatch: roots => prepareObjectShapeBatch(scope, roots),
    addObjectShapesToBatch: (batch, roots) => addObjectShapesToBatch(scope, batch, roots),
    validateObjectShapeBatch: (batch, capabilities, projections, receivers) =>
      validateObjectShapeBatch(scope, batch, capabilities, projections, receivers),
    commitObjectShapeBatch: (batch, capabilities, projections, receivers) =>
      commitObjectShapeBatch(scope, batch, capabilities, projections, receivers),
    collectJsonClosure: (type, preferred, pending) => collectJsonClosure(scope, type, preferred, pending),
    collectCapabilityClosure: (capability, type, preferred, pending) => collectCapabilityClosure(scope, capability, type, preferred, pending),
    addShapeCapabilities: (target, shapes, capability) => addShapeCapabilities(scope, target, shapes, capability),
    validateProjectionShapes: (shapes, projection) => validateProjectionShapes(scope, shapes, projection),
    addShapeProjection: (target, shapes, projection) => addShapeProjection(scope, target, shapes, projection),
    visibleObjectShapes: pending => visibleObjectShapes(scope, pending),
    collectJsonType: (type, preferred, state) => collectJsonType(scope, type, preferred, state),
    collectJsonShape: (shape, state) => collectJsonShape(scope, shape, state),
    inheritedObjectShapeCapabilities: fact => inheritedObjectShapeCapabilities(scope, fact),
  };
  scope = Object.freeze({ host, records: new Map(), projections: new Map(), jsonContracts: new Map(), ...operations });
  return Object.freeze({
    registerObjectShape: operations.registerObjectShape,
    requireObjectShapeCapability: operations.requireObjectShapeCapability,
    requireObjectShapeProjection: operations.requireObjectShapeProjection,
    requireObjectShapeMethodReceiver: operations.requireObjectShapeMethodReceiver,
    close(): CsharpObjectShapeDemandClosure {
      requireOpen();
      const targetShapes = host.objectShapes.targetShapes;
      if (targetShapes === undefined || !Object.isFrozen(targetShapes)) failTargetAnalysisInvariant("tsonic-csharp",
        "Native artifact demand requires its immutable completed target-shape index before sealing.");
      sealed = true;
      const artifacts = Object.freeze(operations.closeObjectShapeArtifacts());
      const byKey = new Map(artifacts.map(artifact => [artifact.key, artifact]));
      const projectionSubjects = Object.freeze([...scope.projections].map(([subject, selected]) => {
        const projection = byKey.get(objectShapeArtifactKey(selected.receiver))?.projections.find(projection =>
          targetTypeRefEquals(projection.receiver.targetType, selected.receiver.targetType) && projection.selection === selected.selection);
        if (projection === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
          "A selected native projection requires its exact admitted physical declaration.", subject);
        return Object.freeze({ subject, projection });
      }));
      return Object.freeze({ artifacts, targetShapes, projectionSubjects });
    },
  });
}
