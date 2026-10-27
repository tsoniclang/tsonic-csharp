import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { createStructuralObjectShapeTarget } from "./construction.js";
import { csharpStructuralObjectShapeIdentity } from "../../../target-model/types/object-shape-identity.js";
import { csharpObjectShapeMethodDeclaration, csharpObjectShapeMethodRequiresProtocol, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import type { CsharpTypeParameterConstraintResolver } from "../../../target-model/types/generic-references.js";
import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";

import { csharpCopiedObjectShapeMembers } from "../../../policy/types/objects/method-environments.js";
import { csharpObjectMethodHasFixedNativeExposure } from "../../../policy/types/objects/object-members.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { objectShapeMethodInvocationName } from "../../../target-model/names/object-members.js";

const methodValueUses = new WeakMap<SourceStorageQueries, ReadonlySet<Node>>();

function selectMethodValueUses(storage: SourceStorageQueries): ReadonlySet<Node> {
  const cached = methodValueUses.get(storage);
  if (cached !== undefined) return cached;
  const { source } = storage;
  const { ast } = source;
  const values = new Set<Node>();
  const pending: Node[] = [];
  const add = (declaration: Node): void => {
    if ((!ast.is.IsMethodDeclaration(declaration) && !ast.is.IsMethodSignatureDeclaration(declaration)) || values.has(declaration)) return;
    values.add(declaration);
    pending.push(declaration);
  };
  for (const node of storage.nodes) {
    if (ast.is.IsMethodDeclaration(node) || ast.is.IsMethodSignatureDeclaration(node)) {
      const uses = source.navigation.declarationUseSummary(node);
      if (uses.firstClassUseCount > 0 || uses.exported || uses.memberWritten) add(node);
      else {
        const subject = storage.memberSubjectFor(node);
        const domain = subject.kind === "resolved" ? storage.closedOriginsFor(subject.subject) : undefined;
        if (domain?.kind === "open" && domain.boundaries.some(boundary => boundary.kind === "external-input" ||
          boundary.kind === "external-write" || boundary.kind === "unclassified-exposure")) add(node);
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
      for (const declaration of semantics.declarations.symbolDeclarations(property.symbol)) add(declaration);
    }
  }
  for (let index = 0; index < pending.length; index++) {
    const subject = storage.memberSubjectFor(pending[index]!);
    if (subject.kind !== "resolved") continue;
    const origins = storage.originSubjectsFor(subject.subject);
    if (origins.kind !== "resolved") continue;
    for (const origin of origins.subjects) {
      add(origin.node);
      for (const component of origin.projection) if (component.kind === "method-value") add(component.declaration);
    }
  }
  methodValueUses.set(storage, values);
  return values;
}

export function selectCsharpWritableMethodContract(
  shape: CsharpObjectShapeFact,
  writtenMembers: readonly CsharpObjectShapeMemberFact[],
  environment: CsharpTypeParameterConstraintResolver,
): CsharpObjectShapeFact | undefined {
  if (writtenMembers.length === 0) return shape;
  const target = shape.targetType as CsharpTargetNamedTypeRef;
  if (shape.targetType.kind !== "target-named" ||
    (target.csharpStructuralContract !== true && target.csharpSourceDeclarationKind !== "interface") ||
    writtenMembers.some(member => !shape.members.includes(member) || member.memberKind !== "method" ||
      member.readonly === true || csharpPresentObjectShapeMethod(member) === undefined)) return undefined;
  if (writtenMembers.every(member => member.methodValueStorage !== undefined)) return shape;
  const members = shape.members.map(member => {
    if (!writtenMembers.includes(member) || member.methodValueStorage !== undefined) return member;
    if ((member.typeParameters?.length ?? 0) === 0 && member.optional !== true) {
      const { methodValueContract: _contract, ...value } = member;
      return Object.freeze({ ...value, methodValueStorage: Object.freeze({ kind: "delegate" as const, type: member.type }) });
    }
    const contract = member.methodValueContract;
    const storage = contract === undefined
      ? Object.freeze({ kind: "delegate" as const, type: member.type })
      : Object.freeze({ kind: "protocol" as const,
          type: member.optional === true ? csharpNullableTargetType(contract) : contract,
          invocationName: objectShapeMethodInvocationName(member) });
    return Object.freeze({ ...member, methodValueStorage: storage });
  });
  const implemented = Object.freeze([shape.targetType]);
  return Object.freeze({
    targetType: createStructuralObjectShapeTarget(members, implemented, environment, true),
    members: Object.freeze(members),
    implements: implemented,
    ...(shape.sourceType === undefined ? {} : { sourceType: shape.sourceType }),
  });
}

export function resolveCsharpCopiedObjectShape(
  shape: CsharpObjectShapeFact,
  ast: AstReader,
  environment: CsharpTypeParameterConstraintResolver,
  resolveNode: (node: Node) => CsharpObjectShapeFact | undefined,
  rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
  sourceStorage: SourceStorageQueries,
): CsharpObjectShapeFact | undefined {
  const contract = shape.targetType.kind === "target-named" &&
    ((shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true ||
      (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface");
  const nativeLayout = shape.targetType.kind === "target-named" &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpGeneratedStructuralStorage === true &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpValueType !== true &&
    shape.members.some(member => member.memberKind === "method");
  if (!contract && shape.methodImplementation === undefined && !nativeLayout) return shape;
  shape = retainCsharpMethodValueContracts(shape, rememberTargetShape, environment, sourceStorage);
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
  });
}

export function retainCsharpMethodValueContracts(
  shape: CsharpObjectShapeFact, remember: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
  environment: CsharpTypeParameterConstraintResolver,
  sourceStorage: SourceStorageQueries,
): CsharpObjectShapeFact {
  if (csharpStructuralObjectShapeIdentity(shape.targetType) === undefined &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") return shape;
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
    const nativeMethod = csharpObjectMethodHasFixedNativeExposure(writes);
    const requiresProtocol = (member.typeParameters?.length ?? 0) > 0 || member.optional === true ||
      member.methodValueContract !== undefined;
    const valueUses = !requiresProtocol && !nativeMethod && (member.sourceDeclarations?.length ?? 0) > 0
      ? selectMethodValueUses(sourceStorage) : undefined;
    const needsValue = member.methodValueStorage?.kind === "delegate" ||
      member.sourceDeclarations?.some(source => valueUses?.has(source) === true) === true;
    if (!requiresProtocol && !nativeMethod && (needsValue || declaration !== undefined)) {
      const { methodValueContract: _contract, ...value } = member;
      return { ...value, methodValueStorage: Object.freeze({ kind: "delegate" as const, type: member.type }) };
    }
    const selfContract = shape.members.length === 1 && shape.targetType.kind === "target-named" &&
      (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true;
    if (!requiresProtocol && declaration === undefined && !selfContract) return member;
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
  return { ...retained, members, ...(implemented.size === 0 ? {} : { implements: [...implemented.values()] }) };
}
