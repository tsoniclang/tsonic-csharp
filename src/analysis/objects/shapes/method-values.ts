import type { AstReader, Node } from "@tsonic/tsts";
import type { SourceStorageDomainBoundary, SourceStorageQueries } from "@tsonic/target-api/analysis";
import type { SourceDescriptorView, SourcePresence, SourceTypeEvidence, SourceValueFacts, TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, CsharpTargetNamedTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { createStructuralObjectShapeTarget } from "./construction.js";
import { csharpObjectMethodValueStorageKey, csharpStructuralObjectShapeIdentity } from "../../../target-model/types/object-shape-identity.js";
import { csharpObjectShapeMethodDeclaration, csharpPresentObjectShapeMethod } from "../../../target-model/types/method-values.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { represented, sourceOutcome } from "../../../policy/types/source-type-flow/representation-results.js";
import { selectCsharpCopiedMethodReceiver } from "../copied-methods.js";

import { csharpCopiedObjectShapeMembers } from "../../../policy/types/objects/method-environments.js";
import { csharpObjectMethodHasFixedNativeExposure } from "../../../policy/types/objects/object-members.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { resolveCsharpObjectShapeMemberBySelectedSubject } from "../../../target-model/types/object-shape-members.js";
import { selectCsharpWritableMethodMembers } from "../../../policy/types/objects/writable-methods.js";

export interface CsharpObjectMethodUseIndex {
  readonly retained: ReadonlySet<Node>;
  readonly extracted: ReadonlySet<Node>;
}

function structuralBoundariesAreExportOnly(source: TargetSourceProgram,
  boundaries: readonly Pick<SourceStorageDomainBoundary, "kind" | "exposure">[] | undefined): boolean {
  const { ast } = source;
  return boundaries !== undefined && boundaries.length !== 0 && boundaries.every(boundary => boundary.kind === "external-write" &&
    (ast.is.IsVariableDeclaration(boundary.exposure) || ast.is.IsFunctionDeclaration(boundary.exposure) ||
      ast.is.IsClassDeclaration(boundary.exposure)) && source.facts.navigation.declarationUseSummary(boundary.exposure).exported);
}

export function createCsharpObjectMethodUseIndex(storage: SourceStorageQueries, view: SourceDescriptorView,
  publications: SourceValueFacts): CsharpRepresentationOutcome<CsharpObjectMethodUseIndex> {
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
      const uses = source.facts.navigation.declarationUseSummary(node);
      if (uses.firstClassUseCount > 0 || uses.exported || uses.memberWritten) add(node, true);
      else {
        const subject = storage.memberSubjectFor(node);
        if (subject.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: subject });
        const domain = subject.kind === "resolved" ? storage.closedOriginsFor(subject.subject) : undefined;
        if (domain?.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: domain });
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
    const outcome = sourceOutcome(publications.type(expression));
    if (outcome.kind !== "represented") return outcome;
    let value: SourceTypeEvidence = outcome.value;
    if (value.type.kind === "optional") {
      const present = sourceOutcome(view.component(value, { kind: "optional-value" }));
      if (present.kind !== "represented") return present;
      value = present.value;
    }
    if (value.type.kind === "declared" || value.type.kind === "projection" || value.type.kind === "intersection") {
      const definition = sourceOutcome(view.definition(value));
      if (definition.kind !== "represented") return definition;
      value = definition.value;
    }
    const descriptor = value.type;
    if (descriptor.kind !== "shape") continue;
    for (const member of descriptor.members) if (member.origin.kind === "declared") add(member.origin.declaration, false);
  }
  for (let index = 0; index < pending.length; index++) {
    const current = pending[index]!;
    const subject = storage.memberSubjectFor(current.declaration);
    if (subject.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: subject });
    if (subject.kind !== "resolved") continue;
    const origins = storage.originSubjectsFor(subject.subject);
    if (origins.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: origins });
    if (origins.kind !== "resolved") continue;
    for (const origin of origins.subjects) {
      add(origin.node, current.extracted);
      for (const component of origin.projection) if (component.kind === "method-value") add(component.declaration, current.extracted);
    }
  }
  return represented(Object.freeze({ retained: values, extracted }));
}

export function csharpObjectMethodValueIsExtracted(index: CsharpObjectMethodUseIndex, declaration: Node): boolean {
  return index.extracted.has(declaration);
}

export function resolveCsharpWritableMethodContract(
  shape: CsharpObjectShapeFact,
  writtenMembers: readonly CsharpObjectShapeMemberFact[],
): CsharpObjectShapeFact | undefined {
  const members = selectCsharpWritableMethodMembers(shape, writtenMembers);
  if (members === undefined) return undefined;
  if (members === shape.members) return shape;
  const implemented = Object.freeze([shape.targetType]);
  return Object.freeze({
    targetType: createStructuralObjectShapeTarget(members, implemented, true),
    members,
    implements: implemented,
  });
}

export function resolveCsharpCopiedObjectShape(
  shape: CsharpObjectShapeFact,
  ast: AstReader,
  resolveNode: (node: Node) => CsharpObjectShapeFact | undefined,
  rememberTargetShape: (shape: CsharpObjectShapeFact) => CsharpObjectShapeFact,
  sourceStorage: SourceStorageQueries,
  methodUses: CsharpObjectMethodUseIndex,
  source?: CsharpObjectShapeFact,
): CsharpRepresentationOutcome<SourcePresence<CsharpObjectShapeFact>> {
  if (source !== undefined) {
    const members = shape.members.map(member => {
      if (member.memberKind !== "method") return member;
      const selected = resolveCsharpObjectShapeMemberBySelectedSubject(source,
        [...member.sourceSubjects ?? [], ...member.sourceDeclarations ?? []]);
      if (selected.kind !== "resolved" || selected.member.memberKind !== "method" ||
        selected.member.methodValueStorage !== undefined || !targetTypeRefEquals(selected.member.type, member.type) ||
        member.methodValueStorage === undefined) return member;
      const { methodValueStorage: _storage, ...retained } = member;
      return Object.freeze(retained);
    });
    if (members.some((member, index) => member !== shape.members[index])) shape = {
      ...shape, members: Object.freeze(members),
      targetType: createStructuralObjectShapeTarget(members, shape.implements,
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
  if (!contract && shape.methodImplementation === undefined && !nativeLayout) return represented(Object.freeze({ kind: "present", value: shape }));
  const retained = retainCsharpMethodValueStorage(shape, sourceStorage, methodUses);
  if (retained.kind !== "represented") return retained;
  shape = retained.value;
  const original = shape.methodImplementation === undefined ? undefined : resolveNode(shape.methodImplementation.declaration);
  const receiver = selectCsharpCopiedMethodReceiver(shape.members, original === undefined ? [shape] : [original], ast);
  if (receiver.kind === "rejected") return represented(Object.freeze({ kind: "none" }));
  if (receiver.kind === "selected") return represented(Object.freeze({ kind: "present", value: receiver.shape }));
  const members = csharpCopiedObjectShapeMembers(shape);
  const implemented = contract ? [shape.targetType] : shape.implements;
  return represented(Object.freeze({ kind: "present", value: rememberTargetShape({
    targetType: createStructuralObjectShapeTarget(members, implemented),
    members,
    ...(implemented === undefined ? {} : { implements: implemented }),
  }) }));
}

export function retainCsharpMethodValueStorage(
  shape: CsharpObjectShapeFact,
  sourceStorage: SourceStorageQueries,
  methodUses: CsharpObjectMethodUseIndex,
): CsharpRepresentationOutcome<CsharpObjectShapeFact> {
  if (csharpStructuralObjectShapeIdentity(shape.targetType) === undefined &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind !== "interface") return represented(shape);
  const nativeInterface = shape.targetType.kind === "target-named" &&
    (shape.targetType as CsharpTargetNamedTypeRef).csharpSourceDeclarationKind === "interface";
  const members: CsharpObjectShapeMemberFact[] = [];
  for (const member of shape.members) {
    const signature = csharpPresentObjectShapeMethod(member);
    if (signature === undefined || member.methodValueStorage !== undefined) { members.push(member); continue; }
    const declaration = csharpObjectShapeMethodDeclaration(shape, member);
    const subject = declaration === undefined ? undefined : sourceStorage.memberSubjectFor(declaration);
    if (subject?.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: subject });
    const writes = subject?.kind === "resolved" ? sourceStorage.memberWritesFor(subject.subject) : undefined;
    const nativeMethod = csharpObjectMethodHasFixedNativeExposure(writes);
    if (nativeMethod.kind !== "represented") return nativeMethod;
    const retained = !nativeInterface && member.sourceDeclarations?.some(source => methodUses.retained.has(source)) === true;
    if (nativeMethod.value || member.optional !== true && declaration === undefined && !retained) { members.push(member); continue; }
    members.push(Object.freeze({ ...member, methodValueStorage: Object.freeze({
      type: member.optional === true ? csharpNullableTargetType(member.type) : member.type }) }));
  }
  const storageChanged = members.some((member, index) => csharpObjectMethodValueStorageKey(member.methodValueStorage) !==
    csharpObjectMethodValueStorageKey(shape.members[index]!.methodValueStorage));
  const targetType = storageChanged &&
    csharpStructuralObjectShapeIdentity(shape.targetType) !== undefined
    ? createStructuralObjectShapeTarget(members, shape.implements,
      shape.targetType.kind === "target-named" && (shape.targetType as CsharpTargetNamedTypeRef).csharpStructuralContract === true,
      shape.methodImplementation)
    : shape.targetType;
  return represented(storageChanged ? Object.freeze({ ...shape, targetType, members: Object.freeze(members) }) : shape);
}
