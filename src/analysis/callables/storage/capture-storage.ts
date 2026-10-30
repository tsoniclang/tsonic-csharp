import type { CsharpCaptureFrame, CsharpCaptureStorage, CsharpCapturedBinding, CsharpCaptureProtocol } from "../../../target-model/records/callables/capture-storage.js";
import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { sourceCallableDefinitionIsDiscarded, sourceBindingScope, sourceNodeIdentity, sourceBindingCapturedBeforeInitialization, sourceBindingCapturedBeforeFirstWrite } from "@tsonic/target-api/source";
import { createHash } from "node:crypto";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpObjectShapeClassifications } from "../../../target-model/records/objects/object-shapes.js";
import type { CsharpStorageIssue } from "../../../target-model/records/storage/storage.js";
import type { CsharpCaptureStorageQueries } from "../../storage/index.js";
import { createStructuralObjectShapeTarget } from "../../objects/shapes/construction.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeNativeArrayTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import { analyzeCsharpNativeCaptures } from "../values/capture-closures.js";
import { type CsharpFrameClosure } from "../../../target-model/records/callables/capture-storage.js";
import { csharpTargetNamedType } from "../../../target-model/types/factories.js";
import { selectCsharpGenericFrameClosures } from "../generics/generic-closures.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { createCsharpTypeParameterEnvironment } from "../../source-evidence/types/resolution/type-parameter-environment.js";

import { csharpCapturedMemberAccess } from "../values/captured-member-access.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function analyzeCsharpCaptureStorage(
  source: TargetSourceProgram,
  shapes: CsharpObjectShapeClassifications,
  storage: CsharpCaptureStorageQueries,
  evidence: CsharpSourceEvidenceIndex,
  classCaptures: readonly import("../../../target-model/records/objects/class-factories.js").CsharpClassCapture[],
): CsharpCaptureStorage {
  const environment = createCsharpTypeParameterEnvironment(source.ast, declaration => evidence.typeParameterConstraints.get(declaration));
  const groups = new Map<Node, Map<Node, TargetTypeRef>>();
  const protocols = new Map<Node, CsharpCaptureProtocol[]>();
  const retainProtocol = (scope: Node, protocol: CsharpCaptureProtocol): void => {
    const previous = protocols.get(scope) ?? [];
    if (!previous.some(selected => selected.kind === protocol.kind && selected.declaration === protocol.declaration)) {
      previous.push(Object.freeze(protocol));
      protocols.set(scope, previous);
    }
  };
  const issues: CsharpStorageIssue[] = [];
  const physicalTypes = new WeakMap<Node, TargetTypeRef | null>();
  const physicalType = (declaration: Node, logicalType: TargetTypeRef): TargetTypeRef => {
    const existing = physicalTypes.get(declaration);
    if (existing !== undefined) return existing ?? logicalType;
    const backing = storage.nativeBacking.get(declaration);
    const array = backing === undefined ? storage.nativeArray.get(declaration) : undefined;
    const selected = backing !== undefined ? csharpRuntimeLocationTargetType(backing.pointeeType)
      : array !== undefined ? csharpRuntimeNativeArrayTargetType(array.layout.pointeeType) : storage.storageType.get(declaration);
    physicalTypes.set(declaration, selected ?? null);
    return selected ?? logicalType;
  };
  for (const shape of shapes.knownShapes()) {
    for (const capture of (shape.declarationTemplate ?? shape).methodImplementation?.captures ?? []) {
      physicalType(capture.declaration, capture.type);
      if (!capture.mutable || storage.nativeBacking.get(capture.declaration) !== undefined) continue;
      const scope = sourceBindingScope(capture.declaration, source.ast);
      if (scope === undefined || source.ast.is.IsSourceFile(scope)) {
        issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_SCOPE_NOT_CLOSED",
          message: "A captured binding requires its exact retained lexical activation scope." });
        continue;
      }
      const bindings = groups.get(scope) ?? new Map<Node, TargetTypeRef>();
      const type = physicalType(capture.declaration, capture.type);
      const existing = bindings.get(capture.declaration);
      if (existing !== undefined && !targetTypeRefEquals(existing, type)) {
        issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_STORAGE_CONFLICT",
          message: "One captured binding cannot have incompatible physical storage contracts." });
      }
      bindings.set(capture.declaration, type);
      groups.set(scope, bindings);
      retainProtocol(scope, { kind: "method", declaration: (shape.declarationTemplate ?? shape).methodImplementation!.declaration });
    }
  }
  for (const capture of classCaptures) {
    physicalType(capture.declaration, capture.type);
    if (!capture.mutable || storage.nativeBacking.get(capture.declaration) !== undefined) continue;
    const scope = sourceBindingScope(capture.declaration, source.ast);
    if (scope === undefined || source.ast.is.IsSourceFile(scope)) {
      issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_SCOPE_NOT_CLOSED",
        message: "A mutable class capture requires its exact lexical activation scope." });
      continue;
    }
    let owner: Node | undefined = capture.reference;
    while (owner !== undefined && !source.ast.is.IsClassDeclaration(owner) && !source.ast.is.IsClassExpression(owner)) {
      owner = source.ast.parent(owner);
    }
    if (owner === undefined) {
      issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_SCOPE_NOT_CLOSED",
        message: "A mutable class capture requires its actual checked class declaration." });
      continue;
    }
    retainProtocol(scope, { kind: "class", declaration: owner });
    const bindings = groups.get(scope) ?? new Map<Node, TargetTypeRef>();
    const type = physicalType(capture.declaration, capture.type);
    const existing = bindings.get(capture.declaration);
    if (existing !== undefined && !targetTypeRefEquals(existing, type)) {
      issues.push({ node: capture.declaration, code: "CSHARP_CAPTURE_STORAGE_CONFLICT",
        message: "One class capture cannot have incompatible native storage contracts." });
    }
    bindings.set(capture.declaration, type);
    groups.set(scope, bindings);
  }
  const creationDemandValues = new Map<Node, boolean>();
  const collectCreationDemand = (node: Node): void => {
    if (evidence.compileTimeMetadata.get(node)) return;
    if (source.ast.is.IsArrowFunction(node) || source.ast.is.IsFunctionExpression(node)) {
      const discarded = sourceCallableDefinitionIsDiscarded(node, source.ast, source.navigation);
      creationDemandValues.set(node, discarded);
      if (discarded) return;
    }
    source.ast.forEachChild(node, child => { if (child !== undefined) collectCreationDemand(child); });
  };
  source.navigation.sourceFiles.forEach(collectCreationDemand);
  const creationDemand = Object.freeze({ get: (declaration: Node) => creationDemandValues.get(declaration) });
  const nativeCaptures = analyzeCsharpNativeCaptures(source, evidence, physicalType, issues, creationDemand);
  const genericClosures = selectCsharpGenericFrameClosures(source, evidence, nativeCaptures.lexicalCaptures, groups, issues);
  for (const closure of genericClosures) for (const capture of closure.captures) {
    const scope = sourceBindingScope(capture, source.ast);
    if (scope !== undefined && groups.get(scope)?.has(capture)) {
      retainProtocol(scope, { kind: "quantified", declaration: closure.declaration });
    }
  }
  const namedSelfBindings = new Map(nativeCaptures.namedSelfBindings.map(binding => [binding.declaration, binding]));
  const byScope = new Map<Node, CsharpCaptureFrame>();
  const byBinding = new Map<Node, CsharpCapturedBinding>();
  const byClosure = new Map<Node, import("../../../target-model/records/callables/capture-storage.js").CsharpCaptureClosure>();
  const retainClosure = (frame: CsharpCaptureFrame, method: CsharpFrameClosure): void => {
    byClosure.set(method.declaration, Object.freeze({ frame, method }));
  };
  const byShape = new Map<string, CsharpCaptureFrame>();
  const buildFrame = (scope: Node): CsharpCaptureFrame => {
    const previous = byScope.get(scope);
    if (previous !== undefined) return previous;
    const group = groups.get(scope)!;
    const methods: readonly CsharpFrameClosure[] = Object.freeze([]);
    const requiredProtocols = protocols.get(scope);
    if (requiredProtocols === undefined || requiredProtocols.length === 0) {
      failTargetAnalysisInvariant("tsonic-csharp", "A capture environment requires its actual class or quantified native protocol.", scope);
    }
    const parents = Object.freeze([]);
    const receivers = Object.freeze([]);
    const bindings = Object.freeze([...group].map(([declaration, type], index) => Object.freeze({
      declaration, type, fieldName: `value${index}`,
      // A binding captured before its initializer or, without one, before its first write is stored in the frame before it
      // holds a value.
      ...(sourceBindingCapturedBeforeInitialization(declaration, source.ast, source.navigation) ||
        sourceBindingCapturedBeforeFirstWrite(declaration, source.ast, source.navigation) ? { initialization: "deferred" as const } : {}),
    })));
    const fields = bindings;
    const members: readonly CsharpObjectShapeMemberFact[] = Object.freeze(fields.map(field => Object.freeze({
      sourceKey: { kind: "property" as const, name: field.fieldName }, sourceName: field.fieldName,
      targetName: field.fieldName, type: field.type, memberKind: "property" as const,
    })));
    const implementations = Object.freeze([]);
    const selectedType = createStructuralObjectShapeTarget(members, implementations, environment);
    const identity = sourceNodeIdentity(source.ast, scope);
    if (identity === undefined || selectedType.kind !== "target-named") failTargetAnalysisInvariant("tsonic-csharp", "A native capture frame requires an exact named source identity.", scope);
    const digest = createHash("sha256").update(identity).digest("hex");
    const type = csharpTargetNamedType(`tsonic.shape:capture_${digest}`, selectedType.typeArguments, { kind: "named", name: `__TsonicCapture_${digest}` }, { allowsRefLikeTypeArguments: (selectedType.typeArguments ?? []).map(() => false),});
    const frame: CsharpCaptureFrame = Object.freeze({ scope, protocols: Object.freeze(requiredProtocols), ownership: "activation", bindings, parents, methods, receivers, shape: Object.freeze({
      targetType: type, members,
      implements: implementations,
    }) });
    byScope.set(scope, frame);
    byShape.set(targetTypeRefKey(type), frame);
    for (const binding of bindings) byBinding.set(binding.declaration, Object.freeze({ frame, fieldName: binding.fieldName }));
    for (const method of methods) retainClosure(frame, method);
    return frame;
  };
  for (const scope of groups.keys()) buildFrame(scope);
  const valueFrames: CsharpCaptureFrame[] = [];
  const valueMethods = genericClosures;
  for (const method of valueMethods) {
    const lexical = nativeCaptures.lexicalCaptures.find(capture => capture.owner === method.declaration);
    if (lexical === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A quantified environment requires its completed original-place capture facts.", method.declaration);
    const captured = lexical.values.map(place => ({ declaration: place.declaration, type: place.type, shared: byBinding.get(place.declaration) }));
    const contract = getCsharpMethodValue(method.type)?.owner;
    const identity = sourceNodeIdentity(source.ast, method.declaration);
    if (contract === undefined || identity === undefined || captured.some(binding => binding === undefined)) {
      issues.push({ node: method.declaration, code: "CSHARP_GENERIC_CALLABLE_OWNER_NOT_CLOSED",
        message: "A generic callable value requires its exact invocation protocol and captured owner fields." });
      continue;
    }
    const bindings = Object.freeze(captured.filter(binding => binding!.shared === undefined).map((binding, index) =>
      Object.freeze({ declaration: binding!.declaration, type: binding!.type, fieldName: `value${index}` })));
    const parents = Object.freeze([...new Set(captured.flatMap(binding => binding!.shared === undefined ? [] : [binding!.shared.frame]))]
      .map((frame, index) => Object.freeze({ frame, fieldName: `parent${index}` })));
    const receivers = Object.freeze(method.receivers.map((receiver, index) => Object.freeze({ ...receiver, fieldName: `receiver${index}` })));
    const fields = [...bindings, ...parents.map(parent => ({ fieldName: parent.fieldName, type: parent.frame.shape.targetType })), ...receivers];
    const members: readonly CsharpObjectShapeMemberFact[] = Object.freeze(fields.map(field => Object.freeze({
      sourceKey: { kind: "property" as const, name: field.fieldName }, sourceName: field.fieldName,
      targetName: field.fieldName, type: field.type, memberKind: "property" as const,
    })));
    const selectedType = createStructuralObjectShapeTarget(members, [contract], environment);
    const digest = createHash("sha256").update(identity).digest("hex");
    const type = csharpTargetNamedType(`tsonic.shape:callable_${digest}`, selectedType.kind === "target-named" ? selectedType.typeArguments : undefined, { kind: "named", name: `__TsonicCallable_${digest}` }, { allowsRefLikeTypeArguments: ((selectedType.kind === "target-named" ? selectedType.typeArguments : undefined) ?? []).map(() => false), typeofRuntimeKind: "function" });
    const frame: CsharpCaptureFrame = Object.freeze({ scope: method.declaration,
      protocols: Object.freeze([Object.freeze({ kind: "quantified" as const, declaration: method.declaration })]), ownership: "value", bindings, parents, methods: Object.freeze([method]), receivers,
      shape: Object.freeze({ targetType: type, members, implements: Object.freeze([contract]) }),
    });
    retainClosure(frame, method);
    byShape.set(targetTypeRefKey(type), frame);
    valueFrames.push(frame);
  }
  const lexicalDeclarations = new Set<Node>();
  for (const capture of nativeCaptures.lexicalCaptures) {
    if (source.ast.is.IsFunctionDeclaration(capture.owner) &&
        !source.ast.is.IsSourceFile(source.ast.parent(capture.owner))) lexicalDeclarations.add(capture.owner);
  }
  const frames = Object.freeze([...byScope.values(), ...valueFrames]);
  const helperMembers = csharpCapturedMemberAccess(source, frames);
  return sealCsharpCaptureStorage({ issues, frames, lexicalCaptures: nativeCaptures.lexicalCaptures,
    byScope, byBinding, byClosure, byShape, physicalTypes, namedSelfBindings,
    helperMembers, lexicalDeclarations });
}

import { sealCsharpCaptureStorage } from "../../program/records/callables/capture-storage.js";
