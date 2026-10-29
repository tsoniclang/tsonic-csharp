import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import { ObjectLiteralProperty_Value, sourceClassFieldIsTypeOnly, sourcePropertyTypeEvidenceNodes, sourceTransformedTypeFactEvidenceNodes, sourcePresentCallableType, type SourceFileSemantics, type SourceStructuralMember, type SourceStructuralMemberPair } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectShapeMemberEvidence, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpTypeResolutionState } from "../../source-evidence/types/resolution/model.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { csharpSourceMemberDisplayName } from "../../../target-model/types/source-member-keys.js";
import { nextState } from "../../source-evidence/types/resolution/state.js";
import { objectShapeMemberTargetNameForKey } from "../../../policy/identities/source-member-names.js";
import { typeIncludesNullish } from "./source-evidence.js";
import { resolveObjectShapeSourceMemberKey } from "../../../source/extension/member-keys.js";
import { resolveCsharpCallableTypeParameters } from "../../source-evidence/types/resolution/callable-type-parameters.js";
import { csharpMethodValueCoversContract, getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import { isCsharpIntegralTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import type { CsharpProjectMemberTypeInstantiation } from "../../../target-model/records/types/project-types.js";

export function createCsharpObjectShapeMemberResolver(host: CsharpObjectShapePolicyHost) {
  function retainLiteralMemberEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    objectLiteral: Node,
    queries: SourceFileSemantics,
  ): readonly CsharpObjectShapeMemberFact[] {
    const selected = host.ast.properties(objectLiteral).flatMap(element => {
      const evidence = element === undefined ? undefined : queries.operations.objectLiteralElement(element);
      return evidence === undefined || evidence.objectLiteral !== objectLiteral || evidence.element !== element
        ? [] : [evidence];
    });
    return members.map(member => {
      const elements = selected.filter(evidence => member.sourceSubjects?.some(subject =>
        subject === evidence.sourceSelectedSymbol || evidence.sourceSelectedDeclarations.some(declaration => declaration === subject)) === true);
      if (elements.length === 0) return member;
      return { ...member,
        sourceSubjects: Object.freeze([...new Set([
          ...(member.sourceSubjects ?? []),
          ...elements.flatMap(evidence => evidence.sourceElementSymbol === undefined
            ? [evidence.element] : [evidence.element, evidence.sourceElementSymbol]),
        ])]),
        sourceDeclarations: Object.freeze([...new Set([
          ...(member.sourceDeclarations ?? []),
          ...elements.map(evidence => evidence.element),
        ])]),
      };
    });
  }

  function deriveMembers(
    ownerType: Type,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node,
    receiver?: TargetTypeRef,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    const symbol = queries.declarations.typeSymbol(ownerType);
    const literals = symbol === undefined ? [] : queries.declarations.symbolDeclarations(symbol)
      .filter(declaration => host.ast.is.IsObjectLiteralExpression(declaration));
    if (literals.length > 1) return undefined;
    const members: CsharpObjectShapeMemberFact[] = [];
    for (const property of queries.types.propertyInfos(ownerType)) {
      const declarations = queries.declarations.symbolDeclarations(property.symbol);
      if (declarations.length !== 0 && declarations.every(declaration => sourceClassFieldIsTypeOnly(host.ast, declaration))) continue;
      const member = deriveMember(property, queries, state, authoredTypeRoot, literals[0], receiver);
      if (member === undefined) return undefined;
      members.push(member);
    }
    return retainMemberDeclarationEvidence(members, ownerType, queries);
  }

  function matchesMemberSubjects(member: CsharpObjectShapeMemberFact, selected: SourceStructuralMember): boolean {
    const subjects = [selected.property.symbol, ...selected.property.rootSymbols, ...selected.declarations];
    return member.sourceSubjects?.some(subject => subjects.some(candidate => candidate === subject)) === true;
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

  function sameCheckedMember(left: SourceStructuralMember, right: SourceStructuralMember): boolean {
    return left.receiverType === right.receiverType && left.property.symbol === right.property.symbol &&
      left.property.type === right.property.type && left.property.optional === right.property.optional &&
      left.property.readonly === right.property.readonly && left.read === right.read &&
      left.property.rootSymbols.length === right.property.rootSymbols.length &&
      left.property.rootSymbols.every((symbol, index) => symbol === right.property.rootSymbols[index]) &&
      left.declarations.length === right.declarations.length &&
      left.declarations.every((declaration, index) => declaration === right.declarations[index]) &&
      left.getters.length === right.getters.length && left.getters.every((getter, index) => getter === right.getters[index]) &&
      left.setters.length === right.setters.length && left.setters.every((setter, index) => setter === right.setters[index]);
  }

  function revalidateMemberEvidence(
    member: CsharpObjectShapeMemberFact,
    evidence: CsharpObjectShapeMemberEvidence,
    queries: SourceFileSemantics,
  ): SourceStructuralMemberPair | undefined {
    const previous = evidence.correspondence;
    if (previous.destination.receiverType !== evidence.ownerType ||
      previous.kind === "present" && previous.source.receiverType !== evidence.sourceType ||
      !matchesMemberSubjects(member, previous.destination)) return undefined;
    const checked = queries.types.structuralMembers(evidence.sourceType, evidence.ownerType, "correspondence");
    if (checked.kind !== "available") return undefined;
    const matching = checked.members.filter(pair => pair.destination.property.symbol === previous.destination.property.symbol);
    if (matching.length !== 1) return undefined;
    const selected = matching[0]!;
    if (selected.kind !== previous.kind || !sameCheckedMember(selected.destination, previous.destination)) return undefined;
    return selected.kind === "present" && previous.kind === "present" &&
        !sameCheckedMember(selected.source, previous.source) ? undefined : selected;
  }

  function sameMemberSource(left: Type, right: Type, queries: SourceFileSemantics): boolean {
    if (left === right) return true;
    const symbol = queries.declarations.typeSymbol(left);
    return symbol !== undefined && symbol === queries.declarations.typeSymbol(right) &&
      queries.types.isIdentical(left, right);
  }

  function instantiateMemberEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    type: Type,
    queries: SourceFileSemantics,
    previousSourceType: Type | undefined,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    if (previousSourceType === undefined) return undefined;
    if (members.length === 0) return queries.types.structuralMembers(type, previousSourceType, "correspondence").kind === "available"
      ? Object.freeze([]) : undefined;
    const instantiated = members.map(member => {
      const evidence = member.sourceMemberEvidence;
      if (evidence === undefined || evidence.length === 0) return undefined;
      const direct = evidence.filter(selected => sameMemberSource(selected.sourceType, type, queries));
      const candidates = direct.length === 0
        ? evidence.filter(selected => sameMemberSource(selected.sourceType, previousSourceType, queries)) : direct;
      if (candidates.length === 0) return undefined;
      let selected: CsharpObjectShapeMemberEvidence | undefined;
      for (const candidate of candidates) {
        if (revalidateMemberEvidence(member, candidate, queries) === undefined || selected !== undefined &&
          (selected.ownerType !== candidate.ownerType || selected.correspondence.destination.property.symbol !==
            candidate.correspondence.destination.property.symbol)) return undefined;
        selected = candidate;
      }
      if (selected === undefined) return undefined;
      const retained = selected;
      const correspondence = queries.types.structuralMembers(type, retained.ownerType, "correspondence");
      if (correspondence.kind !== "available") return undefined;
      const matching = correspondence.members.filter(pair => pair.destination.receiverType === retained.ownerType &&
        pair.destination.property.symbol === retained.correspondence.destination.property.symbol);
      if (matching.length !== 1) return undefined;
      const pair = matching[0]!;
      const sourceMemberEvidence = Object.freeze([retained.sourceType === type && retained.correspondence === pair
        ? retained : Object.freeze({ ownerType: retained.ownerType, sourceType: type, correspondence: pair })]);
      if (pair.kind !== "present") {
        const retainedAbsence = retained.correspondence.kind === "absent" && sameMemberSource(retained.sourceType, type, queries);
        const declaredContext = retained.correspondence.kind === "present" && retained.sourceType === retained.ownerType &&
          previousSourceType === retained.ownerType;
        return member.optional === true && pair.destination.property.optional && (retainedAbsence || declaredContext)
          ? { ...member, sourceMemberEvidence } : undefined;
      }
      if (pair.source.read === "unavailable") return undefined;
      const property = pair.source.property;
      const declarations = pair.source.declarations;
      return { ...member,
        sourceMemberEvidence,
        sourceSubjects: Object.freeze([...new Set([...member.sourceSubjects ?? [],
          property.symbol, ...property.rootSymbols, ...declarations])]),
        sourceDeclarations: Object.freeze([...new Set(declarations)]),
        sourceTypes: Object.freeze([property.type]),
      };
    });
    return instantiated.some(member => member === undefined) ? undefined
      : instantiated as readonly CsharpObjectShapeMemberFact[];
  }

  function deriveMember(
    property: TypePropertyInfo,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node,
    literalOwner?: Node,
    receiver?: TargetTypeRef,
  ): CsharpObjectShapeMemberFact | undefined {
    const sourcePropertyName = property.name;
    const declarations = [...new Set([
      ...queries.declarations.symbolDeclarations(property.symbol),
      ...property.rootSymbols.flatMap((symbol) =>
        queries.declarations.symbolDeclarations(symbol)
      ),
    ])]
      .filter((declaration): declaration is Node => declaration !== undefined);
    const selection = declarations.length !== 1 ? undefined : host.sourceStorage.memberSubjectFor(declarations[0]!);
    const memberState: CsharpTypeResolutionState = { ...state,
      sourceStorageSubject: selection?.kind === "resolved" ? selection.subject : undefined,
    };
    const sourceType = property.type;
    const sourceKey = resolveObjectShapeSourceMemberKey(
      declarations,
      sourcePropertyName,
      host.ast,
      host.semanticsFor,
    );
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
    const getters = declarations.filter((declaration) =>
      host.ast.is.IsGetAccessorDeclaration(declaration) &&
        (literalOwner === undefined || host.ast.parent(declaration) === literalOwner)
    );
    const setters = declarations.filter((declaration) =>
      host.ast.is.IsSetAccessorDeclaration(declaration) &&
        (literalOwner === undefined || host.ast.parent(declaration) === literalOwner)
    );
    if (getters.length > 1 || setters.length > 1 ||
      (getters.length === 0 && setters.length > 0)) {
      return undefined;
    }
    const inherited = resolveInheritedMemberType(declarations, receiver, memberState, method, property.optional);
    if (inherited.kind === "unresolved") return undefined;
    let memberType = inherited.kind === "resolved" ? inherited.type : method
      ? host.typeResolver.resolveType(
          sourceType,
          queries.sourceFile,
          nextState(memberState),
        )
      : resolvePropertyType(
          property,
          sourceType,
          queries,
          memberState,
          authoredTypeRoot,
        );
    if (memberType === undefined) {
      return undefined;
    }
    if (method) memberType = getCsharpMethodValue(memberType)?.contract ?? memberType;
    if (!method && declarations.length === 1) {
      const declaration = declarations[0]!;
      const value = host.ast.is.IsPropertyAssignment(declaration) || host.ast.is.IsShorthandPropertyAssignment(declaration)
        ? ObjectLiteralProperty_Value(host.ast, declaration) : undefined;
      const storage = value === undefined ? undefined : host.typeResolver.resolveNode(value, queries.sourceFile, nextState(state));
      if (storage !== undefined && csharpMethodValueCoversContract(storage, memberType)) memberType = storage;
    }
    const callableType = method ? sourcePresentCallableType(sourceType, queries) : undefined;
    const signatures = callableType === undefined ? [] : queries.types.callSignatures(callableType);
    const methodDeclaration = signatures.length === 1
      ? queries.declarations.signatureDeclaration(signatures[0]!) : undefined;
    const typeParameters = resolveCsharpCallableTypeParameters(methodDeclaration, queries.sourceFile, {
      ast: host.ast,
      genericProjections: host.representations.genericProjections,
      types: { resolveNode: (node, sourceFile) => {
        const declared = host.typeResolver.resolveNode(node, sourceFile, nextState(state));
        if (declared === undefined) return undefined;
        if (receiver === undefined) return Object.freeze({ kind: "resolved" as const, type: declared });
        const selected = host.projectTypes().instantiateMemberType(methodDeclaration, receiver, declared);
        const type = selected.kind === "resolved" ? selected.type
          : selected.kind === "not-project-member" ? declared : undefined;
        return type === undefined ? undefined : Object.freeze({ kind: "resolved" as const, type });
      } },
    });
    if (typeParameters === undefined) return undefined;
    const sourceDeclarations = [...new Set([...declarations, ...(methodDeclaration === undefined ? [] : [methodDeclaration])])];
    const optional = property.optional;
    const bound = host.memoryBindings.hasBoundField([property.symbol, ...declarations]);
    if (bound && (optional || typeIncludesNullish(sourceType, queries) || method || getters.length !== 0 || setters.length !== 0)) return undefined;
    return {
      sourceKey,
      sourceName: csharpSourceMemberDisplayName(sourceKey),
      sourceSubjects: declarations.length === 0
        ? [property.symbol]
        : [property.symbol, ...declarations],
      ...(sourceDeclarations.length === 0
        ? {}
        : { sourceDeclarations: Object.freeze(sourceDeclarations) }),
      sourceTypes: [sourceType],
      targetName,
      memberKind: method ? "method" : "property",
      type: optional ? csharpNullableTargetType(memberType) : memberType,
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

  function resolvePropertyType(
    property: TypePropertyInfo,
    sourceType: Type,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    authoredTypeRoot?: Node,
  ): TargetTypeRef | undefined {
    const authoredTypeNodes = [
      ...sourcePropertyTypeEvidenceNodes(host.ast, queries, property),
      ...(authoredTypeRoot === undefined
        ? []
        : sourceTransformedTypeFactEvidenceNodes(
            host.ast,
            queries,
            authoredTypeRoot,
            sourceType,
          )),
    ];
    if (authoredTypeNodes.length === 0) {
      if (queries.types.isNumberLike(sourceType) || queries.types.isBigIntLike(sourceType)) {
        const declarations = [...new Set([property.symbol, ...property.rootSymbols].flatMap(symbol =>
          queries.declarations.symbolDeclarations(symbol)))];
        const carriers = declarations.map(declaration => {
          const value = host.ast.is.IsPropertyAssignment(declaration) || host.ast.is.IsShorthandPropertyAssignment(declaration)
            ? ObjectLiteralProperty_Value(host.ast, declaration) : undefined;
          return value === undefined || host.literalValues.literalValue.get(value)?.number !== undefined
            ? undefined : host.typeResolver.resolveNode(value, queries.sourceFile, nextState(state));
        });
        const first = carriers[0];
        if (first !== undefined && isCsharpIntegralTargetType(first) &&
          carriers.every(carrier => carrier !== undefined && targetTypeRefEquals(carrier, first))) return first;
      }
      return host.typeResolver.resolveType(
        sourceType,
        queries.sourceFile,
        nextState(state),
      );
    }
    const authoredTypes = authoredTypeNodes.map((typeNode) =>
      host.typeResolver.resolveSelectedType(
        typeNode,
        sourceType,
        queries.sourceFile,
        nextState(state),
      )
    );
    if (authoredTypes.some((type) => type === undefined)) {
      return undefined;
    }
    const first = authoredTypes[0]!;
    return authoredTypes.every((type) =>
        type !== undefined && targetTypeRefEquals(first, type)
      )
      ? first
      : undefined;
  }

  function resolveInheritedMemberType(
    declarations: readonly Node[],
    receiver: TargetTypeRef | undefined,
    state: CsharpTypeResolutionState,
    method: boolean,
    optional: boolean,
  ): CsharpProjectMemberTypeInstantiation {
    if (receiver === undefined) return { kind: "not-project-member" };
    const receiverDefinition = host.projectTypeCatalog.definitionForTarget(receiver);
    if (receiverDefinition === undefined) return { kind: "not-project-member" };
    const inherited = declarations.filter(declaration => {
      const owner = host.projectTypeCatalog.definitionForDeclaration(host.ast.parent(declaration));
      return owner !== undefined && owner.id !== receiverDefinition.id && !host.ast.hasModifierKind(declaration, "static");
    });
    if (inherited.length === 0) return { kind: "not-project-member" };
    const selected: TargetTypeRef[] = [];
    for (const declaration of inherited) {
      const owner = host.projectTypeCatalog.definitionForDeclaration(host.ast.parent(declaration))!;
      const typeNode = host.ast.typeNode(declaration) ??
        (host.ast.is.IsSetAccessorDeclaration(declaration) ? host.ast.typeNode(host.ast.parameters(declaration)[0]) : undefined);
      const semantics = host.semantics(owner.sourceFile);
      const declared = method
        ? host.typeResolver.resolveType(semantics.types.expressionType(declaration), owner.sourceFile, nextState(state))
        : host.typeResolver.resolveNode(typeNode ?? declaration, owner.sourceFile, nextState(state));
      if (declared === undefined) return { kind: "unresolved",
        reason: `Inherited project member of '${owner.sourceName}' has no exact authored native carrier.` };
      const carrier = optional ? csharpNullableTargetType(declared) : declared;
      const result = host.projectTypes().instantiateMemberType(declaration, receiver, carrier);
      if (result.kind !== "resolved") return result.kind === "unresolved" ? result : { kind: "unresolved",
        reason: `Inherited project member of '${owner.sourceName}' lost its canonical project declaration.` };
      selected.push(result.type);
    }
    const first = selected[0]!;
    return selected.every(type => targetTypeRefEquals(first, type)) ? { kind: "resolved", type: first }
      : { kind: "unresolved", reason: "Inherited project member declarations have incompatible native carrier instantiations." };
  }

  return { deriveMembers, instantiateMemberEvidence, retainMemberDeclarationEvidence, resolvePropertyType, retainLiteralMemberEvidence };
}
