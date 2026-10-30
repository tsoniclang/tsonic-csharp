import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceStorageDomainBoundary, SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { createStructuralObjectShapeTarget } from "./construction.js";
import { csharpObjectMethodValueStorageKey, csharpStructuralObjectShapeIdentity } from "../../../target-model/types/object-shape-identity.js";
import { csharpObjectShapeMethodDeclaration, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import type { CsharpTypeParameterConstraintResolver } from "../../../target-model/types/generic-references.js";
import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";

import { csharpCopiedObjectShapeMembers } from "../../../policy/types/objects/method-environments.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";

const methodValueUses = new WeakMap<SourceStorageQueries, {
  readonly retained: ReadonlySet<Node>;
  readonly extracted: ReadonlySet<Node>;
}>();

function structuralBoundariesAreExportOnly(source: TargetSourceProgram,
  boundaries: readonly Pick<SourceStorageDomainBoundary, "kind" | "exposure">[] | undefined): boolean {
  const { ast } = source;
  return boundaries !== undefined && boundaries.length !== 0 && boundaries.every(boundary => boundary.kind === "external-write" &&
    (ast.is.IsVariableDeclaration(boundary.exposure) || ast.is.IsFunctionDeclaration(boundary.exposure) ||
      ast.is.IsClassDeclaration(boundary.exposure)) && source.navigation.declarationUseSummary(boundary.exposure).exported);
}

function selectMethodValueUses(storage: SourceStorageQueries) {
  const cached = methodValueUses.get(storage);
  if (cached !== undefined) return cached;
  const { source } = storage;
  const { ast } = source;
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
    if (ast.is.IsMethodDeclaration(node) || ast.is.IsMethodSignatureDeclaration(node)) {
      const uses = source.navigation.declarationUseSummary(node);
      if (uses.firstClassUseCount > 0 || uses.exported || uses.memberWritten) add(node, true);
      else {
        const subject = storage.memberSubjectFor(node);
        const domain = subject.kind === "resolved" ? storage.closedOriginsFor(subject.subject) : undefined;
        if (domain?.kind === "open" && !structuralBoundariesAreExportOnly(source, domain.boundaries) &&
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
    const semantics = source.semantics.forNode(expression);
    const type = semantics.types.expressionType(expression) ?? semantics.types.authoredType(expression);
    if (type === undefined) continue;
    for (const property of semantics.types.propertyInfos(type)) {
      for (const declaration of semantics.declarations.symbolDeclarations(property.symbol)) add(declaration, false);
    }
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

export function csharpObjectMethodValueIsExtracted(storage: SourceStorageQueries, declaration: Node): boolean {
  return selectMethodValueUses(storage).extracted.has(declaration);
}


export function resolveCsharpCopiedObjectShape(
  shape: CsharpObjectShapeFact,
  ast: AstReader,
  environment: CsharpTypeParameterConstraintResolver,
  resolveNode: (node: Node) => CsharpObjectShapeFact | undefined,
  rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
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
  shape = retainCsharpMethodValueContracts(shape, rememberTargetShape, environment);
  const original = shape.methodImplementation === undefined ? undefined : resolveNode(shape.methodImplementation.declaration);
  const receiver = selectCsharpCopiedMethodReceiver(shape.members, original === undefined ? [shape] : [original], ast);
  if (receiver.kind === "rejected") return undefined;
  if (receiver.kind === "selected") return receiver.shape;
  const members = csharpCopiedObjectShapeMembers(shape);
  const implemented = contract ? [shape.targetType] : shape.implements;
  return rememberTargetShape({
    targetType: createStructuralObjectShapeTarget(members, implemented, environment),
    members,
    ...(implemented === undefined ? {} : { implements: implemented }),
    ...(shape.sourceType === undefined ? {} : { sourceType: shape.sourceType }),
  });
}

export function retainCsharpMethodValueContracts(
  shape: CsharpObjectShapeFact, remember: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
  environment: CsharpTypeParameterConstraintResolver,
): CsharpObjectShapeFact {
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
    const declaration = csharpObjectShapeMethodDeclaration(shape, member);
    let contract = member.methodValueContract;
    if (contract === undefined) {
      const protocol = createStructuralObjectShapeTarget([signature], undefined, environment, true);
      const ownProtocol = targetTypeRefEquals(shape.targetType, protocol);
      contract = protocol;
      if (!ownProtocol) remember({ targetType: contract, members: [{ ...signature, methodValueContract: contract }] });
    }
    if (!nativeInterface && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract !== true &&
      !targetTypeRefEquals(shape.targetType, contract) &&
      (member.optional !== true || csharpObjectShapeMethodDeclaration(shape, member) !== undefined)) {
      implemented.set(targetTypeRefKey(contract), contract);
    }
    const storage = declaration === undefined && member.methodValueStorage?.kind === "protocol" ? member.methodValueStorage : undefined;
    const { methodValueStorage: _storage, ...retainedMember } = member;
    return { ...retainedMember, methodValueContract: contract, ...(storage === undefined ? {} : { methodValueStorage: storage }) };
  });
  const { implements: _implemented, ...retained } = shape;
  const contracts = implemented.size === 0 ? undefined : [...implemented.values()];
  const storageChanged = members.some((member, index) => csharpObjectMethodValueStorageKey(member.methodValueStorage) !==
    csharpObjectMethodValueStorageKey(shape.members[index]!.methodValueStorage));
  const targetType = storageChanged && csharpStructuralObjectShapeIdentity(shape.targetType) !== undefined
    ? createStructuralObjectShapeTarget(members, contracts, environment,
      shape.targetType.kind === "target-named" && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true,
      shape.methodImplementation)
    : shape.targetType;
  return { ...retained, targetType, members, ...(contracts === undefined ? {} : { implements: contracts }) };
}
