import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import { ObjectLiteralProperty_Value, sourceClassFieldIsTypeOnly, sourcePropertyTypeEvidenceNodes, sourceTransformedTypeFactEvidenceNodes, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./model.js";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionState } from "../../resolution/model.js";
import { csharpNullableTargetType } from "../../../../target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { csharpSourceMemberDisplayName } from "../../../../target-model/types/source-member-keys.js";
import { nextState } from "../../resolution/state.js";
import { objectShapeMemberTargetNameForKey } from "./construction.js";
import { typeIncludesNullish } from "./source-evidence.js";
import { resolveObjectShapeSourceMemberKey } from "./source-member-identity.js";
import { resolveCsharpTypeParameterConstraints } from "../../../constraints/type-parameter-constraints.js";
import { csharpGenericMethodValueCoversContract } from "../../../../target-model/types/generic-method-values.js";
import { csharpSourceTypeParameterName } from "../../../../target-model/names/type-parameters.js";
import { isCsharpIntegralTargetType } from "../../../../target-model/types/scalar-types.js";

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
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    const members = queries.types.propertyInfos(ownerType).filter(property => {
      const declarations = queries.declarations.symbolDeclarations(property.symbol);
      return declarations.length === 0 || !declarations.every(declaration => sourceClassFieldIsTypeOnly(host.ast, declaration));
    }).map((property) =>
      deriveMember(property, queries, state, authoredTypeRoot)
    );
    return members.some((member) => member === undefined)
      ? undefined
      : members as readonly CsharpObjectShapeMemberFact[];
  }

  function instantiateMemberEvidence(
    members: readonly CsharpObjectShapeMemberFact[],
    type: Type,
    queries: SourceFileSemantics,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    const properties = queries.types.propertyInfos(type);
    const instantiated = members.map(member => {
      const matching = properties.filter(property => {
        const subjects = [property.symbol, ...property.rootSymbols,
          ...queries.declarations.symbolDeclarations(property.symbol),
          ...property.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol))];
        return member.sourceSubjects?.some(subject => subjects.some(candidate => candidate === subject)) === true;
      });
      if (matching.length !== 1) return undefined;
      const property = matching[0]!;
      const declarations = [...new Set([
        ...queries.declarations.symbolDeclarations(property.symbol),
        ...property.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol)),
      ])];
      return { ...member,
        sourceSubjects: Object.freeze([property.symbol, ...property.rootSymbols, ...declarations]),
        sourceDeclarations: Object.freeze(declarations),
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
  ): CsharpObjectShapeMemberFact | undefined {
    const sourcePropertyName = property.name;
    if (sourcePropertyName.length === 0) {
      return undefined;
    }
    const declarations = [...new Set([
      ...queries.declarations.symbolDeclarations(property.symbol),
      ...property.rootSymbols.flatMap((symbol) =>
        queries.declarations.symbolDeclarations(symbol)
      ),
    ])]
      .filter((declaration): declaration is Node => declaration !== undefined);
    const sourceType = property.type;
    const sourceKey = resolveObjectShapeSourceMemberKey(
      declarations,
      sourcePropertyName,
      host.ast,
      queries,
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
      host.ast.is.IsGetAccessorDeclaration(declaration)
    );
    const setters = declarations.filter((declaration) =>
      host.ast.is.IsSetAccessorDeclaration(declaration)
    );
    if (getters.length > 1 || setters.length > 1 ||
      (getters.length === 0 && setters.length > 0)) {
      return undefined;
    }
    let memberType = method
      ? host.typeResolver.resolveType(
          sourceType,
          queries.sourceFile,
          nextState(state),
        )
      : resolvePropertyType(
          property,
          sourceType,
          queries,
          state,
          authoredTypeRoot,
        );
    if (memberType === undefined) {
      return undefined;
    }
    if (!method && declarations.length === 1) {
      const declaration = declarations[0]!;
      const value = host.ast.is.IsPropertyAssignment(declaration) || host.ast.is.IsShorthandPropertyAssignment(declaration)
        ? ObjectLiteralProperty_Value(host.ast, declaration) : undefined;
      const storage = value === undefined ? undefined : host.typeResolver.resolveNode(value, queries.sourceFile, nextState(state));
      if (storage !== undefined && csharpGenericMethodValueCoversContract(storage, memberType)) memberType = storage;
    }
    const signatures = method ? queries.types.callSignatures(sourceType) : [];
    const methodDeclaration = signatures.length === 1
      ? queries.declarations.signatureDeclaration(signatures[0]!) : undefined;
    const typeParameters = methodDeclaration === undefined ? [] : host.ast.typeParameters(methodDeclaration).map(declaration => {
      if (declaration === undefined) return undefined;
      const name = csharpSourceTypeParameterName(declaration, host.ast);
      if (name === undefined) return undefined;
      const selected = resolveCsharpTypeParameterConstraints(declaration, name, queries.sourceFile, {
        ast: host.ast,
        types: { resolveNode: (node, sourceFile) => host.typeResolver.resolveNode(node, sourceFile, nextState(state)) },
      });
      return selected.kind !== "resolved" ? undefined : Object.freeze({ declaration, name,
        constraints: Object.freeze([...selected.constraints]),
      });
    });
    if (typeParameters.some(parameter => parameter === undefined)) return undefined;
    const optional = property.optional;
    const bound = host.memoryBindings.hasBoundField([property.symbol, ...declarations]);
    if (bound && (optional || typeIncludesNullish(sourceType, queries) || method || getters.length !== 0 || setters.length !== 0)) return undefined;
    return {
      sourceKey,
      sourceName: csharpSourceMemberDisplayName(sourceKey),
      sourceSubjects: declarations.length === 0
        ? [property.symbol]
        : [property.symbol, ...declarations],
      ...(declarations.length === 0
        ? {}
        : { sourceDeclarations: Object.freeze([...declarations]) }),
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
          return value === undefined ? undefined : host.typeResolver.resolveNode(value, queries.sourceFile, nextState(state));
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

  return { deriveMembers, instantiateMemberEvidence, resolvePropertyType, retainLiteralMemberEvidence };
}
