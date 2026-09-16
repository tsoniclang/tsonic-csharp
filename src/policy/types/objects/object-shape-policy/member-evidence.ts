import type { Node, Type, TypePropertyInfo } from "@tsonic/tsts";
import { sourceClassFieldIsTypeOnly, sourcePropertyTypeEvidenceNodes, sourceTransformedTypeFactEvidenceNodes, type SourceFileSemantics } from "@tsonic/target-api/source";
import type { CsharpObjectShapePolicyHost } from "./api.js";
import type { CsharpObjectShapeMemberFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionState } from "../../resolution/model.js";
import { csharpNullableTargetType } from "../../../../target-model/types/nullable.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { csharpSourceMemberDisplayName } from "../../../../target-model/types/source-member-keys.js";
import { nextState } from "../../resolution/state.js";
import { objectShapeMemberTargetNameForKey } from "./construction.js";
import { typeIncludesNullish } from "./source-evidence.js";
import { resolveObjectShapeSourceMemberKey } from "./source-member-identity.js";

export function createCsharpObjectShapeMemberResolver(host: CsharpObjectShapePolicyHost) {
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
    const memberType = method
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
    const optional = property.optional || typeIncludesNullish(sourceType, queries);
    const bound = host.memoryBindings.hasBoundField([property.symbol, ...declarations]);
    if (bound && (optional || method || getters.length !== 0 || setters.length !== 0)) return undefined;
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

  return { deriveMembers, instantiateMemberEvidence, resolvePropertyType };
}
