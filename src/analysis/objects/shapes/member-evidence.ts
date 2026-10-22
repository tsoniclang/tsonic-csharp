import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import { ObjectLiteralProperty_Value, sourceClassFieldIsTypeOnly, sourcePropertyTypeEvidenceNodes, sourceTransformedTypeFactEvidenceNodes, sourcePresentCallableType, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../target-model/types/model.js";
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
import type { CsharpProjectMemberTypeInstantiation } from "../../../target-model/records/project-types.js";

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
    return members;
  }

  function instantiateMemberEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    type: Type,
    queries: SourceFileSemantics,
    destinationType: Type | undefined,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    if (destinationType === undefined) return undefined;
    const correspondence = queries.types.structuralMembers(type, destinationType);
    if (correspondence.kind !== "available") return undefined;
    const instantiated = members.map(member => {
      const matching = correspondence.members.filter(pair => {
        const property = pair.destination.property;
        const subjects = [property.symbol, ...property.rootSymbols, ...pair.destination.declarations];
        return member.sourceSubjects?.some(subject => subjects.some(candidate => candidate === subject)) === true;
      });
      if (matching.length !== 1) return undefined;
      const pair = matching[0]!;
      if (pair.kind !== "present") return member.optional === true && pair.destination.property.optional ? member : undefined;
      const property = pair.source.property;
      const declarations = pair.source.declarations;
      return { ...member,
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
        if (declared === undefined || receiver === undefined) return declared;
        const selected = host.projectTypes().instantiateMemberType(methodDeclaration, receiver, declared);
        return selected.kind === "resolved" ? selected.type
          : selected.kind === "not-project-member" ? declared : undefined;
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

  return { deriveMembers, instantiateMemberEvidence, resolvePropertyType, retainLiteralMemberEvidence };
}
