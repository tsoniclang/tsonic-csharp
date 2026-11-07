import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceStorageDomainBoundary, SourceStorageQueries } from "@tsonic/target-api/analysis";
import { sourceTypeDescriptorStructure, type SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { createStructuralObjectShapeTarget } from "../../../policy/types/objects/structural-shape-targets.js";
import { csharpObjectMethodValueStorageKey, csharpStructuralObjectShapeIdentity } from "../../../target-model/types/object-shape-identity.js";
import { csharpObjectShapeMethodDeclaration, csharpObjectShapeMethodRequiresProtocol, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import type { CsharpTypeParameterEnvironment } from "../../../target-model/records/types/type-parameter-constraints.js";
import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";

import { csharpCopiedObjectShapeMembers } from "../../../policy/types/objects/method-environments.js";
import { csharpObjectMethodHasFixedNativeExposure } from "../../../policy/types/objects/object-members.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { objectShapeMethodInvocationName } from "../../../target-model/names/object-members.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { selectCsharpWritableMethodMembers } from "../../../policy/types/objects/writable-methods.js";

/**
 * Inputs of method-value use selection: storage queries (.NET receiver and protocol coverage), published facts (the
 * Host method-value uses, values, exports) and authored syntax (declaration kinds only).
 */
export interface CsharpMethodValueUseInputs {
  readonly storage: SourceStorageQueries;
  readonly facts: SourceProgramFacts;
  readonly ast: AstReader;
}

/** Per storage-query object (one program view): retained and first-class-extracted method declarations. */
const methodValueUses = new WeakMap<SourceStorageQueries, {
  readonly retained: ReadonlySet<Node>;
  readonly extracted: ReadonlySet<Node>;
}>();

function structuralBoundariesAreExportOnly(inputs: CsharpMethodValueUseInputs,
  boundaries: readonly Pick<SourceStorageDomainBoundary, "kind" | "exposure">[] | undefined): boolean {
  const { ast, facts } = inputs;
  return boundaries !== undefined && boundaries.length !== 0 && boundaries.every(boundary => boundary.kind === "external-write" &&
    (ast.is.IsVariableDeclaration(boundary.exposure) || ast.is.IsFunctionDeclaration(boundary.exposure) ||
      ast.is.IsClassDeclaration(boundary.exposure)) && facts.navigation.uses.summary(boundary.exposure).exported);
}

function selectMethodValueUses(inputs: CsharpMethodValueUseInputs) {
  const { storage, ast, facts } = inputs;
  const cached = methodValueUses.get(storage);
  if (cached !== undefined) return cached;
  const values = new Set<Node>();
  const extracted = new Set<Node>();
  const pending: { readonly declaration: Node; readonly extracted: boolean }[] = [];
  const add = (declaration: Node, firstClass: boolean): void => {
    if ((!ast.is.IsMethodDeclaration(declaration) && !ast.is.IsMethodSignatureDeclaration(declaration)) ||
      values.has(declaration) && (!firstClass || extracted.has(declaration))) return;
    values.add(declaration);
    if (firstClass) extracted.add(declaration);
    pending.push({ declaration, extracted: firstClass });
  };
  for (const node of storage.nodes) {
    // A first-class method value read is the canonical Host fact (facts.values.methodValueUse, K-2659); C# never
    // classifies one from annotation, write, alias or call syntax.
    const methodValue = facts.values.methodValueUse(node);
    if (methodValue !== undefined) add(methodValue.declaration, true);
    if (ast.is.IsMethodDeclaration(node) || ast.is.IsMethodSignatureDeclaration(node)) {
      // .NET exposure coverage: a method reachable from outside the closed program, or a method member that is written
      // (`obj.m = f`, the Host use summary), keeps its method-value protocol. A8 moves only the read decision to the Host.
      const uses = facts.navigation.uses.summary(node);
      if (uses.exported || uses.memberWritten) add(node, true);
      else {
        const subject = storage.memberSubjectFor(node);
        const domain = subject.kind === "resolved" ? storage.closedOriginsFor(subject.subject) : undefined;
        if (domain?.kind === "open" && !structuralBoundariesAreExportOnly(inputs, domain.boundaries) &&
          domain.boundaries.some(boundary => boundary.kind === "external-input" || boundary.kind === "external-write" ||
            boundary.kind === "unclassified-exposure")) add(node, true);
      }
    }
    const binding = ast.is.IsBindingElement(node) ? ast.as.AsBindingElement(node) : undefined;
    const pattern = binding?.DotDotDotToken === undefined ? undefined : ast.parent(node);
    const owner = pattern === undefined || !ast.is.IsObjectBindingPattern(pattern) ? undefined : ast.parent(pattern);
    const expression = ast.is.IsSpreadAssignment(node) ? ast.as.AsSpreadAssignment(node)?.Expression
      : owner === undefined ? undefined : ast.is.IsVariableDeclaration(owner) ? ast.as.AsVariableDeclaration(owner)?.Initializer
      : ast.is.IsParameterDeclaration(owner) ? owner : undefined;
    if (expression === undefined) continue;
    const outcome = facts.values.has(expression) ? facts.values.type(expression) : undefined;
    const descriptor = outcome === undefined || outcome.kind === "refused" ? undefined : sourceTypeDescriptorStructure(outcome.type);
    if (descriptor?.kind !== "shape") continue;
    for (const member of descriptor.members) if (member.origin.kind === "declared") add(member.origin.declaration, false);
  }
  for (let index = 0; index < pending.length; index++) {
    const current = pending[index]!;
    const subject = storage.memberSubjectFor(current.declaration);
    if (subject.kind !== "resolved") continue;
    const origins = storage.originSubjectsFor(subject.subject);
    if (origins.kind !== "resolved") continue;
    for (const origin of origins.subjects) {
      add(origin.node, current.extracted);
      for (const component of origin.projection) if (component.kind === "method-value") add(component.declaration, current.extracted);
    }
  }
  const selected = Object.freeze({ retained: values, extracted });
  methodValueUses.set(storage, selected);
  return selected;
}

export function csharpObjectMethodValueIsExtracted(inputs: CsharpMethodValueUseInputs, declaration: Node): boolean {
  return selectMethodValueUses(inputs).extracted.has(declaration);
}

export function resolveCsharpWritableMethodContract(
  shape: CsharpObjectShapeFact,
  writtenMembers: readonly CsharpObjectShapeMemberFact[],
  environment: CsharpTypeParameterEnvironment,
): CsharpObjectShapeFact | undefined {
  const members = selectCsharpWritableMethodMembers(shape, writtenMembers);
  if (members === undefined) return undefined;
  if (members === shape.members) return shape;
  const implemented = Object.freeze([shape.targetType]);
  return Object.freeze({
    targetType: createStructuralObjectShapeTarget(members, implemented, environment, true),
    members,
    implements: implemented,
  });
}

export function resolveCsharpCopiedObjectShape(
  shape: CsharpObjectShapeFact,
  ast: AstReader,
  environment: CsharpTypeParameterEnvironment,
  resolveNode: (node: Node) => CsharpObjectShapeFact | undefined,
  rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
  methodValues: CsharpMethodValueUseInputs,
  source?: CsharpObjectShapeFact,
): CsharpObjectShapeFact | undefined {
  if (source !== undefined) {
    const members = shape.members.map(member => {
      if (member.memberKind !== "method") return member;
      const selected = resolveCsharpObjectShapeMemberBySelectedSubject(source,
        [...member.sourceSubjects ?? [], ...member.sourceDeclarations ?? []]);
      if (selected.kind !== "resolved" || selected.member.methodValueContract === undefined ||
        selected.member.methodValueStorage !== undefined || !targetTypeRefEquals(selected.member.type, member.type)) return member;
      const { methodValueStorage: _storage, ...retained } = member;
      return Object.freeze({ ...retained, methodValueContract: selected.member.methodValueContract });
    });
    if (members.some((member, index) => member !== shape.members[index])) shape = {
      ...shape, members: Object.freeze(members),
      targetType: createStructuralObjectShapeTarget(members, shape.implements, environment,
        shape.targetType.kind === "target-named" && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true),
    };
  }
  const contract = shape.targetType.kind === "target-named" &&
    ((shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
      (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface");
  const nativeLayout = shape.targetType.kind === "target-named" &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpGeneratedStructuralStorage === true &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpValueType !== true &&
    shape.members.some(member => member.memberKind === "method");
  if (!contract && shape.methodImplementation === undefined && !nativeLayout) return shape;
  shape = retainCsharpMethodValueContracts(shape, rememberTargetShape, environment, methodValues);
  const original = shape.methodImplementation === undefined ? undefined : resolveNode(shape.methodImplementation.declaration);
  const receiver = selectCsharpCopiedMethodReceiver(shape.members, original === undefined ? [shape] : [original], ast, methodValues.facts);
  if (receiver.kind === "rejected") return undefined;
  if (receiver.kind === "selected") return receiver.shape;
  const members = csharpCopiedObjectShapeMembers(shape);
  const implemented = contract ? [shape.targetType] : shape.implements;
  return rememberTargetShape({
    targetType: createStructuralObjectShapeTarget(members, implemented, environment),
    members,
    ...(implemented === undefined ? {} : { implements: implemented }),
  });
}

export function retainCsharpMethodValueContracts(
  shape: CsharpObjectShapeFact, remember: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
  environment: CsharpTypeParameterEnvironment,
  methodValues: CsharpMethodValueUseInputs,
): CsharpObjectShapeFact {
  const sourceStorage = methodValues.storage;
  if (csharpStructuralObjectShapeIdentity(shape.targetType) === undefined &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") return shape;
  const nativeInterface = shape.targetType.kind === "target-named" &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface";
  const implemented = new Map((shape.implements ?? []).filter(type => !shape.members.some(member =>
    member.methodValueContract !== undefined && targetTypeRefEquals(member.methodValueContract, type)))
    .map(type => [targetTypeRefKey(type), type]));
  const members = shape.members.map(member => {
    const signature = csharpPresentObjectShapeMethod(member);
    if (signature === undefined) return member;
    if (member.methodValueContract === undefined && member.methodValueStorage?.kind === "delegate") return member;
    const declaration = csharpObjectShapeMethodDeclaration(shape, member);
    const subject = declaration === undefined ? undefined : sourceStorage.memberSubjectFor(declaration);
    const writes = subject?.kind === "resolved" ? sourceStorage.memberWritesFor(subject.subject) : undefined;
    const quantified = (member.typeParameters?.length ?? 0) > 0;
    const requiresProtocol = quantified || member.methodValueContract !== undefined;
    const nativeMethod = csharpObjectMethodHasFixedNativeExposure(writes);
    const valueUses = !nativeInterface && !requiresProtocol && !nativeMethod && (member.sourceDeclarations?.length ?? 0) > 0
      ? selectMethodValueUses(methodValues).retained : undefined;
    const needsValue = member.methodValueStorage?.kind === "delegate" ||
      member.sourceDeclarations?.some(source => valueUses?.has(source) === true) === true;
    if (!requiresProtocol && !nativeMethod && (member.optional === true || needsValue || declaration !== undefined)) {
      const { methodValueContract: _contract, ...value } = member;
      return { ...value, methodValueStorage: Object.freeze({ kind: "delegate" as const,
        type: member.optional === true ? csharpNullableTargetType(member.type) : member.type }) };
    }
    const selfContract = shape.members.length === 1 && shape.targetType.kind === "target-named" &&
      (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true;
    if (!requiresProtocol && !nativeMethod && declaration === undefined && !selfContract) return member;
    let contract = member.methodValueContract;
    if (contract === undefined) {
      const required = csharpObjectShapeMethodRequiresProtocol(member);
      if (!required && !nativeMethod && !selfContract) return declaration === undefined ? member : {
        ...member, methodValueStorage: Object.freeze({ kind: "delegate", type: member.type }) };
      const protocol = createStructuralObjectShapeTarget([signature], undefined, environment, true);
      const ownProtocol = targetTypeRefEquals(shape.targetType, protocol);
      if (!required && !nativeMethod && !ownProtocol) return declaration === undefined ? member : {
        ...member, methodValueStorage: Object.freeze({ kind: "delegate", type: member.type }) };
      contract = protocol;
      if (!ownProtocol) remember({ targetType: contract, members: [{ ...signature, methodValueContract: contract }] });
    }
    if (!targetTypeRefEquals(shape.targetType, contract) &&
      (member.optional !== true || csharpObjectShapeMethodDeclaration(shape, member) !== undefined)) {
      implemented.set(targetTypeRefKey(contract), contract);
    }
    const storage = declaration === undefined || nativeMethod ? member.methodValueStorage
      : Object.freeze({ kind: "protocol" as const, type: member.optional === true ? csharpNullableTargetType(contract) : contract,
        invocationName: objectShapeMethodInvocationName(member) });
    return { ...member, methodValueContract: contract, ...(storage === undefined ? {} : { methodValueStorage: storage }) };
  });
  const { implements: _implemented, ...retained } = shape;
  const contracts = implemented.size === 0 ? undefined : [...implemented.values()];
  const storageChanged = members.some((member, index) => csharpObjectMethodValueStorageKey(member.methodValueStorage) !==
    csharpObjectMethodValueStorageKey(shape.members[index]!.methodValueStorage));
  const targetType = storageChanged &&
    csharpStructuralObjectShapeIdentity(shape.targetType) !== undefined
    ? createStructuralObjectShapeTarget(members, contracts, environment,
      shape.targetType.kind === "target-named" && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true,
      shape.methodImplementation)
    : shape.targetType;
  return { ...retained, targetType, members, ...(contracts === undefined ? {} : { implements: contracts }) };
}
