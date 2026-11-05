import { providerVirtualDeclarationFactKey, type Node, type Type, type TypePropertyInfo } from "@tsonic/tsts";
import { ObjectLiteralProperty_Value, sourceClassFieldIsTypeOnly, sourceTypeDescriptorMemberOriginsEqual, sourceTypeDescriptorStructure, type SourceFileSemantics, type SourceStructuralMember, type SourceTypeDescriptor, type SourceTypeDescriptorMember } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { csharpPropertySourceMemberKey, csharpSourceMemberDisplayName, csharpSourceMemberKeysEqual } from "../../../target-model/types/source-member-keys.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { objectShapeMemberTargetNameForKey } from "../../../policy/identities/source-member-names.js";
import { isCsharpNativeSourceProfileMemberDeclaration } from "./source-evidence.js";
import { resolveObjectShapeSourceMemberKey } from "../../../source/extension/member-keys.js";
import { resolveCsharpCallableTypeParameters } from "../../source-evidence/types/resolution/callable-type-parameters.js";
import { csharpMethodValueCoversContract, getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpObjectShapeMemberTypeKey } from "../../../target-model/types/object-shape-identity.js";
import { csharpObjectShapesEqual } from "../../../target-model/types/object-shape-equality.js";
import { resolveProviderObjectLiteralShape } from "./provider-construction.js";

export function createCsharpObjectShapeMemberResolver(host: CsharpObjectShapePolicyHost) {
  const completedProviderShapes = new WeakMap<SourceTypeDescriptor, Map<string, CsharpObjectShapeFact | null>>();

  function publishedShapeDescriptor(node: Node): SourceTypeDescriptor | undefined {
    const outcome = host.effectiveTypes.get(node);
    if (outcome === undefined || outcome.kind === "refused" || outcome.provenance.occurrence !== node) return undefined;
    let descriptor = outcome.construction ?? outcome.type;
    while (descriptor.kind === "optional") descriptor = descriptor.value;
    if (descriptor.kind === "callable" && descriptor.calls.length === 0 && descriptor.constructs.length === 1) descriptor = descriptor.constructs[0]!.result;
    return descriptor;
  }

  function retainLiteralMemberEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    objectLiteral: Node,
  ): readonly CsharpObjectShapeMemberFact[] {
    const outcome = host.effectiveTypes.get(objectLiteral);
    if (outcome === undefined || outcome.kind === "refused" || outcome.provenance.occurrence !== objectLiteral) return members;
    const properties = host.ast.properties(objectLiteral);
    const selected = outcome.memberCorrespondence ?? [];
    const descriptor = publishedShapeDescriptor(objectLiteral);
    const structure = descriptor === undefined ? undefined : sourceTypeDescriptorStructure(descriptor);
    const published = structure?.kind === "shape" ? structure.members : [];
    return members.map(member => {
      const matches = published.filter(property => member.origins?.some(origin =>
        sourceTypeDescriptorMemberOriginsEqual(origin, property.origin)) === true);
      const origin = matches.length === 1 ? matches[0]!.origin : undefined;
      const elements = origin === undefined ? [] : selected.filter(evidence => properties.includes(evidence.property) &&
        sourceTypeDescriptorMemberOriginsEqual(origin, evidence.origin));
      if (elements.length === 0) return member;
      return { ...member,
        sourceSubjects: Object.freeze([...new Set([
          ...(member.sourceSubjects ?? []),
          ...elements.map(evidence => evidence.property),
        ])]),
        sourceDeclarations: Object.freeze([...new Set(elements.map(evidence => evidence.property))]),
      };
    });
  }

  function deriveMembers(
    descriptor: SourceTypeDescriptor,
    owner: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    receiver?: TargetTypeRef,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    if (isProviderDescriptor(descriptor)) return publishedShapeDescriptor(owner) !== descriptor || receiver === undefined
      ? undefined : completedProviderShapes.get(descriptor)?.get(targetTypeRefKey(receiver))?.members;
    let structure = sourceTypeDescriptorStructure(descriptor);
    while (structure.kind === "optional" ||
      structure.kind === "callable" && structure.calls.length === 0 && structure.constructs.length === 1) {
      structure = sourceTypeDescriptorStructure(structure.kind === "optional" ? structure.value : structure.constructs[0]!.result);
    }
    if (structure.kind !== "shape" || structure.indexes.length !== 0 || structure.calls.length !== 0 ||
      structure.constructs.length !== 0) return undefined;
    const members: CsharpObjectShapeMemberFact[] = [];
    for (const property of structure.members) {
      const declarations = memberDeclarations(property);
      if (declarations === undefined) return undefined;
      if (declarations.length !== 0 && declarations.every(declaration => sourceClassFieldIsTypeOnly(host.ast, declaration))) continue;
      if (declarations.some(declaration => isCsharpNativeSourceProfileMemberDeclaration(declaration, host.ast))) {
        if (!declarations.every(declaration => isCsharpNativeSourceProfileMemberDeclaration(declaration, host.ast))) return undefined;
        continue;
      }
      const member = deriveMember(property, declarations, owner, queries, state, receiver);
      if (member === undefined || members.some(previous => csharpSourceMemberKeysEqual(previous.sourceKey, member.sourceKey))) return undefined;
      members.push(member);
    }
    return Object.freeze(members);
  }

  function isProviderDescriptor(descriptor: SourceTypeDescriptor): boolean {
    if (completedProviderShapes.has(descriptor)) return true;
    const visited = new Set<SourceTypeDescriptor>();
    while (!visited.has(descriptor)) {
      visited.add(descriptor);
      if (descriptor.kind === "optional") { descriptor = descriptor.value; continue; }
      if (descriptor.kind !== "declared") return false;
      if (host.sourceFacts?.getFact(descriptor.declaration, providerVirtualDeclarationFactKey) !== undefined) return true;
      if (descriptor.definition === undefined) return false;
      descriptor = descriptor.definition;
    }
    return false;
  }

  function resolveProviderShape(
    type: Type,
    descriptor: SourceTypeDescriptor,
    occurrence: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    selectedTarget: TargetTypeRef | undefined,
  ): CsharpObjectShapeFact | undefined {
    if (!isProviderDescriptor(descriptor) && !queries.facts.typeSubjects(type).some(subject =>
      host.sourceFacts?.getFact(subject, providerVirtualDeclarationFactKey) !== undefined)) return undefined;
    let completed = completedProviderShapes.get(descriptor);
    if (completed === undefined) {
      completed = new Map();
      completedProviderShapes.set(descriptor, completed);
    }
    if (selectedTarget === undefined) return undefined;
    const key = targetTypeRefKey(selectedTarget);
    const previous = completed.get(key);
    if (previous === null) return undefined;
    const shape = resolveProviderObjectLiteralShape({ type, descriptor, occurrence, queries, state, selectedTarget,
      host, publishedShapeDescriptor, resolvePublishedProperty });
    const members = shape === undefined ? undefined : retainMemberDeclarationEvidence(shape.members, type, queries);
    if (shape === undefined || members === undefined) {
      if (previous !== undefined) completed.set(key, null);
      return undefined;
    }
    const selected = Object.freeze({ ...shape, members: Object.freeze(members) });
    if (previous !== undefined && (!csharpObjectShapesEqual(previous, selected) ||
      previous.members.some(member => selected.members.filter(candidate => member.origins?.length === 1 &&
        candidate.origins?.length === 1 && sourceTypeDescriptorMemberOriginsEqual(member.origins[0]!, candidate.origins[0]!)).length !== 1))) {
      completed.set(key, null);
      return undefined;
    }
    completed.set(key, selected);
    return selected;
  }

  function memberDeclarations(property: SourceTypeDescriptorMember): readonly Node[] | undefined {
    if (property.origin.kind !== "declared") return [];
    const declaration = property.origin.declaration;
    const file = host.ast.getSourceFile(declaration);
    if (file === undefined || !host.hasSemantics(file)) return undefined;
    const symbol = host.navigation.declarationSymbol(declaration, file);
    const declarations = symbol === undefined ? [] : host.semantics(file).declarations.symbolDeclarations(symbol);
    return declarations.includes(declaration) ? declarations : [declaration];
  }

  function matchesMemberSubjects(member: CsharpObjectShapeMemberFact, selected: SourceStructuralMember): boolean {
    const subjects = [selected.property.symbol, ...selected.property.rootSymbols, ...selected.declarations];
    return member.sourceSubjects?.some(subject => subjects.some(candidate => candidate === subject)) === true ||
      member.sourceDeclarations?.some(declaration => selected.declarations.includes(declaration)) === true;
  }

  function retainMemberDeclarationEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    ownerType: Type,
    queries: SourceFileSemantics,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    const selected = queries.types.structuralMembers(ownerType, ownerType, "correspondence");
    if (selected.kind !== "available") return undefined;
    const retained = members.map(member => {
      const matching = selected.members.filter(pair => pair.kind === "present" &&
        pair.destination.receiverType === ownerType && pair.source.receiverType === ownerType &&
        matchesMemberSubjects(member, pair.destination));
      if (matching.length !== 1) return undefined;
      return { ...member, sourceMemberEvidence: Object.freeze([Object.freeze({ ownerType, sourceType: ownerType,
        correspondence: matching[0]! })]) };
    });
    return retained.some(member => member === undefined) ? undefined : retained as readonly CsharpObjectShapeMemberFact[];
  }

  function retainPublishedMembers(
    members: readonly CsharpObjectShapeMemberFact[],
    descriptor: SourceTypeDescriptor,
    occurrence: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    receiver?: TargetTypeRef,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    if (publishedShapeDescriptor(occurrence) !== descriptor) return undefined;
    const selected = deriveMembers(descriptor, occurrence, queries, state, receiver);
    if (selected === undefined || selected.length !== members.length) return undefined;
    const retained: CsharpObjectShapeMemberFact[] = [];
    for (const member of selected) {
      const origin = member.origins?.length === 1 ? member.origins[0] : undefined;
      const matches = origin === undefined ? [] : members.filter(previous => previous.origins?.some(candidate =>
        sourceTypeDescriptorMemberOriginsEqual(candidate, origin)) === true);
      const previous = matches.length === 1 ? matches[0] : undefined;
      if (previous === undefined || !targetTypeRefEquals(previous.type, member.type) ||
        !csharpSourceMemberKeysEqual(previous.sourceKey, member.sourceKey) || previous.targetName !== member.targetName ||
        previous.memberKind !== member.memberKind || (previous.optional === true) !== (member.optional === true) ||
        (previous.readonly === true) !== (member.readonly === true) || (previous.bound === true) !== (member.bound === true) ||
        csharpObjectShapeMemberTypeKey(previous) !== csharpObjectShapeMemberTypeKey(member)) return undefined;
      const { accessor: _accessor, ...publishedMember } = member;
      retained.push({ ...publishedMember,
        origins: Object.freeze([...previous.origins!]),
        sourceSubjects: Object.freeze([...new Set([...previous.sourceSubjects ?? [], ...member.sourceSubjects ?? []])]),
        ...(previous.exactNumericStorage === true ? { exactNumericStorage: true } : {}),
        ...(previous.accessor === undefined ? {} : { accessor: previous.accessor }),
        ...(previous.methodValueContract === undefined ? {} : { methodValueContract: previous.methodValueContract }),
        ...(previous.methodValueStorage === undefined ? {} : { methodValueStorage: previous.methodValueStorage }),
      });
    }
    return Object.freeze(host.ast.is.IsObjectLiteralExpression(occurrence)
      ? retainLiteralMemberEvidence(retained, occurrence) : retained);
  }

  function deriveMember(
    property: SourceTypeDescriptorMember,
    declarations: readonly Node[],
    occurrence: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    receiver?: TargetTypeRef,
  ): CsharpObjectShapeMemberFact | undefined {
    const sourcePropertyName = property.name;
    const descriptor = property.type;
    const selection = declarations.length !== 1 ? undefined : host.sourceStorage.memberSubjectFor(declarations[0]!);
    const memberState: CsharpTypeResolutionState = { ...state,
      sourceStorageSubject: selection?.kind === "resolved" ? selection.subject : undefined,
    };
    const sourceKey = property.origin.kind === "mapped" && property.origin.key.kind === "unique-symbol" ? undefined
      : property.origin.kind === "declared" ? resolveObjectShapeSourceMemberKey(declarations, sourcePropertyName, host.ast, host.semanticsFor)
        : csharpPropertySourceMemberKey(sourcePropertyName);
    const targetName = sourceKey === undefined
      ? undefined
      : objectShapeMemberTargetNameForKey(sourceKey);
    if (sourceKey === undefined || targetName === undefined) {
      return undefined;
    }
    const method = declarations.some((declaration) =>
      host.ast.is.IsMethodDeclaration(declaration) ||
      host.ast.is.IsMethodSignatureDeclaration(declaration)
    );
    const getters = declarations.filter(declaration => host.ast.is.IsGetAccessorDeclaration(declaration));
    const setters = declarations.filter(declaration => host.ast.is.IsSetAccessorDeclaration(declaration));
    if (getters.length > 1 || setters.length > 1 ||
      (getters.length === 0 && setters.length > 0)) {
      return undefined;
    }
    let memberType = host.typeResolver.resolveDescriptor(descriptor, occurrence, nextState(memberState));
    if (memberType === undefined) {
      return undefined;
    }
    if (method) memberType = getCsharpMethodValue(memberType)?.contract ?? memberType;
    if (!method && declarations.length === 1) {
      const declaration = declarations[0]!;
      const value = host.ast.is.IsPropertyAssignment(declaration) || host.ast.is.IsShorthandPropertyAssignment(declaration)
        ? ObjectLiteralProperty_Value(host.ast, declaration) : host.ast.is.IsPropertyDeclaration(declaration)
          ? host.ast.as.AsPropertyDeclaration(declaration)?.Initializer : undefined;
      const storage = value === undefined ? undefined : host.typeResolver.resolveNode(value, queries.sourceFile, nextState(state));
      if (storage !== undefined && csharpMethodValueCoversContract(storage, memberType)) memberType = storage;
    }
    let callable = descriptor;
    while (callable.kind === "optional") callable = callable.value;
    const methodDeclaration = method && callable.kind === "callable" && callable.calls.length === 1
      ? callable.calls[0]!.declaration : undefined;
    const typeParameters = resolveCsharpCallableTypeParameters(methodDeclaration, queries.sourceFile, {
      ast: host.ast,
      genericProjections: host.representations.genericProjections,
      types: { resolveNode: (node, sourceFile) => {
        const declared = host.typeResolver.resolveNode(node, sourceFile, nextState(state));
        if (declared === undefined) return undefined;
        if (receiver === undefined) return Object.freeze({ kind: "resolved" as const,
          sourceResult: csharpSourceValueResult(declared)! });
        const selected = host.projectTypes().instantiateMemberType(methodDeclaration, receiver, declared);
        const type = selected.kind === "resolved" ? selected.type
          : selected.kind === "not-project-member" ? declared : undefined;
        return type === undefined ? undefined : Object.freeze({ kind: "resolved" as const,
          sourceResult: csharpSourceValueResult(type)! });
      } },
    });
    if (typeParameters === undefined) return undefined;
    const sourceDeclarations = [...new Set([...declarations, ...(methodDeclaration === undefined ? [] : [methodDeclaration])])];
    const optional = property.optional;
    const bound = host.memoryBindings.hasBoundField(declarations);
    if (bound && (optional || descriptorIncludesAbsence(descriptor) || method || getters.length !== 0 || setters.length !== 0)) return undefined;
    return {
      sourceKey,
      sourceName: csharpSourceMemberDisplayName(sourceKey),
      origins: Object.freeze([property.origin]),
      sourceSubjects: declarations,
      ...(sourceDeclarations.length === 0
        ? {}
        : { sourceDeclarations: Object.freeze(sourceDeclarations) }),
      targetName,
      memberKind: method ? "method" : "property",
      type: memberType,
      ...(typeParameters.length === 0 ? {} : {
        typeParameters: Object.freeze(typeParameters as NonNullable<typeof typeParameters[number]>[]),
      }),
      ...(optional ? { optional: true } : {}),
      ...(property.readonly ? { readonly: true } : {}),
      ...(bound ? { bound: true as const } : {}),
      ...(getters.length === 0
        ? {}
        : {
            accessor: {
              getter: true as const,
              setter: setters.length === 1,
            },
          }),
    };
  }

  function descriptorIncludesAbsence(descriptor: SourceTypeDescriptor): boolean {
    const structure = sourceTypeDescriptorStructure(descriptor);
    return structure.kind === "optional" || structure.kind === "intrinsic" && structure.intrinsic === "absence" ||
      structure.kind === "union" && structure.types.some(descriptorIncludesAbsence);
  }

  function resolvePublishedProperty(
    property: TypePropertyInfo,
    descriptor: SourceTypeDescriptor,
    occurrence: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): { readonly member: SourceTypeDescriptorMember; readonly type: TargetTypeRef } | undefined {
    if (publishedShapeDescriptor(occurrence) !== descriptor) return undefined;
    const declarations = [...new Set([property.symbol, ...property.rootSymbols].flatMap(symbol =>
      queries.declarations.symbolDeclarations(symbol)))];
    while (descriptor.kind === "optional") descriptor = descriptor.value;
    const structure = sourceTypeDescriptorStructure(descriptor);
    const members = structure.kind === "shape" ? structure.members : undefined;
    const selected = members?.filter(member => member.origin.kind === "declared" && declarations.includes(member.origin.declaration));
    const member = selected?.length === 1 ? selected[0] : undefined;
    if (member === undefined || member.origin.kind !== "declared" || host.ast.getSourceFile(member.origin.declaration) === undefined) return undefined;
    const type = host.typeResolver.resolveDescriptor(member.type, occurrence, nextState(state));
    return type === undefined ? undefined : Object.freeze({ member, type });
  }

  return { publishedShapeDescriptor, deriveMembers, retainPublishedMembers,
    resolvePublishedProperty, isProviderDescriptor, resolveProviderShape };
}
import { csharpSourceValueResult } from "../../source-evidence/types/resolution/call-results.js";
