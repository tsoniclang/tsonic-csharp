import {
  functionPointerFactKey,
  pointerFactKey,
  providerVirtualDeclarationFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  AstReader,
  ExtensionFactSubject,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
  SourceFileQueries,
  Symbol,
  Type,
} from "@tsonic/tsts";
import {
  sourceFileIdentity,
  sourceNodeIdentity,
} from "@tsonic/target-api";
import type {
  SourceProgramNavigation,
} from "@tsonic/target-api";
import type {
  CsharpProviderRelationResolver,
} from "../../provider/target-relations/resolver.js";
import {
  csharpTargetTypeFromBinding,
} from "./bindings.js";
import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./definitions.js";
import {
  csharpEnumerableTargetType,
} from "./collections.js";
import {
  csharpDelegateTargetType,
  csharpTaskTargetType,
} from "./delegates.js";
import {
  csharpNullableTargetType,
} from "./nullable.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  csharpAnyRuntimeCarrier,
  csharpRuntimeNullTargetType,
  csharpRuntimeUndefinedTargetType,
  csharpRuntimeUnionTargetType,
} from "./runtime-carriers.js";
import {
  csharpBigIntegerTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpVoidTargetType,
} from "./scalar-types.js";
import {
  classifyCsharpSourceProfileType,
} from "./source-profile.js";
import {
  csharpJsArrayTargetType,
  csharpJsDateTargetType,
  csharpJsMapTargetType,
  csharpJsRegExpTargetType,
  csharpJsSetTargetType,
} from "./surface-types.js";
import {
  csharpTargetNamedType,
} from "./target-refs.js";

export interface CsharpTypePolicyHost {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly providers: CsharpProviderRelationResolver;
  queries(sourceFile: SourceFile): SourceFileQueries;
  queriesFor(node: Node): SourceFileQueries;
}

export interface CsharpTypePolicy {
  resolveNode(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveType(type: Type | undefined, sourceFile: SourceFile): TargetTypeRef | undefined;
}

interface CsharpTypeResolutionState {
  readonly depth: number;
}

const maximumTypeResolutionDepth = 128;

export function createCsharpTypePolicy(
  host: CsharpTypePolicyHost,
): CsharpTypePolicy {
  function resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): TargetTypeRef | undefined {
    return resolveNodeWithState(node, sourceFile, { depth: 0 });
  }

  function resolveType(
    type: Type | undefined,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined {
    return resolveTypeWithState(type, sourceFile, { depth: 0 });
  }

  function resolveNodeWithState(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    if (node === undefined || state.depth > maximumTypeResolutionDepth) {
      return undefined;
    }
    const queries = sourceFile === undefined
      ? host.queriesFor(node)
      : host.queries(sourceFile);
    const direct = resolveDirectSourceFacts(
      sourceFactSubjectsForNode(node, queries),
      queries.sourceFile,
      state,
    );
    if (direct !== undefined) {
      return direct;
    }
    const keyword = resolveKeywordType(host.ast.kindName(node));
    if (keyword !== undefined) {
      return keyword;
    }
    if (host.ast.is.IsArrayTypeNode(node)) {
      const semanticArray = resolveTypeWithState(
        queries.checker.getTypeFromTypeNode(node),
        queries.sourceFile,
        nextState(state),
      );
      if (semanticArray !== undefined) {
        return semanticArray;
      }
      const element = resolveNodeWithState(
        host.ast.as.AsArrayTypeNode(node)!.ElementType,
        queries.sourceFile,
        nextState(state),
      );
      return element === undefined ? undefined : { kind: "array", element };
    }
    if (host.ast.is.IsTupleTypeNode(node)) {
      const elements = host.ast.elements(node).map((element) =>
        resolveNodeWithState(
          element,
          queries.sourceFile,
          nextState(state),
        )
      );
      return elements.some((element) => element === undefined)
        ? undefined
        : {
            kind: "tuple",
            elements: elements as readonly TargetTypeRef[],
          };
    }
    if (host.ast.is.IsNamedTupleMember(node)) {
      return resolveNodeWithState(
        host.ast.as.AsNamedTupleMember(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsParenthesizedTypeNode(node)) {
      return resolveNodeWithState(
        host.ast.as.AsParenthesizedTypeNode(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsOptionalTypeNode(node)) {
      const inner = resolveNodeWithState(
        host.ast.as.AsOptionalTypeNode(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
      return inner === undefined ? undefined : csharpNullableTargetType(inner);
    }
    if (host.ast.is.IsRestTypeNode(node)) {
      return resolveNodeWithState(
        host.ast.as.AsRestTypeNode(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsTypeOperatorNode(node)) {
      return resolveNodeWithState(
        host.ast.as.AsTypeOperatorNode(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsTypeReferenceNode(node)) {
      const resolved = resolveTypeReferenceNode(node, queries, state);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    const projectType = resolveProjectSourceType(node, queries.sourceFile, state);
    if (projectType !== undefined) {
      return projectType;
    }
    return resolveTypeWithState(
      queries.checker.getTypeAtLocation(node),
      queries.sourceFile,
      nextState(state),
    );
  }

  function resolveTypeReferenceNode(
    node: Node,
    queries: SourceFileQueries,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const reference = host.ast.as.AsTypeReferenceNode(node)!;
    const typeName = reference.TypeName;
    if (typeName === undefined) {
      return undefined;
    }
    const subjects = sourceFactSubjectsForNode(typeName, queries, node);
    const direct = resolveDirectSourceFacts(subjects, queries.sourceFile, state);
    if (direct !== undefined) {
      return direct;
    }
    const typeArguments = host.ast.typeArguments(node).map((argument) =>
      resolveNodeWithState(argument, queries.sourceFile, nextState(state))
    );
    if (typeArguments.some((argument) => argument === undefined)) {
      return undefined;
    }
    const providerType = resolveProviderType(
      subjects,
      typeArguments as readonly TargetTypeRef[],
    );
    if (providerType !== undefined) {
      return providerType;
    }
    const projectType = resolveProjectSourceType(
      typeName,
      queries.sourceFile,
      state,
      typeArguments as readonly TargetTypeRef[],
    );
    if (projectType !== undefined) {
      return projectType;
    }
    return resolveTypeWithState(
      queries.checker.getTypeFromTypeNode(node),
      queries.sourceFile,
      nextState(state),
    );
  }

  function resolveTypeWithState(
    type: Type | undefined,
    sourceFile: SourceFile,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    if (type === undefined || state.depth > maximumTypeResolutionDepth) {
      return undefined;
    }
    const queries = host.queries(sourceFile);
    const subjects = sourceFactSubjectsForType(type, queries);
    const direct = resolveDirectSourceFacts(subjects, sourceFile, state);
    if (direct !== undefined) {
      return direct;
    }
    const targetTypeArguments = resolveSemanticTypeArguments(type, queries, state);
    if (targetTypeArguments === undefined) {
      return undefined;
    }
    const providerType = resolveProviderType(subjects, targetTypeArguments);
    if (providerType !== undefined) {
      return providerType;
    }
    const typeParameter = resolveTypeParameter(type, queries);
    if (typeParameter !== undefined) {
      return typeParameter;
    }
    if (queries.typeShape.isAny(type)) {
      return csharpAnyRuntimeCarrier();
    }
    if (queries.typeShape.isUnknown(type)) {
      return { kind: "opaque", id: "unknown" };
    }
    if (queries.typeShape.isNever(type)) {
      return { kind: "opaque", id: "never" };
    }
    if (queries.typeShape.isNullish(type)) {
      return isUndefinedType(type, queries)
        ? csharpRuntimeUndefinedTargetType()
        : csharpRuntimeNullTargetType();
    }
    if (queries.typeShape.isUnion(type)) {
      return resolveUnionType(type, queries, state);
    }
    if (queries.typeShape.isTuple(type)) {
      const rawSourceElements = queries.typeShape.getTupleElementTypes(type);
      const sourceElements = definedValues(
        rawSourceElements,
      );
      if (sourceElements.length !== rawSourceElements.length) {
        return undefined;
      }
      const elements = sourceElements.map((element) =>
        resolveTypeWithState(element, sourceFile, nextState(state))
      );
      return elements.some((element) => element === undefined)
        ? undefined
        : {
            kind: "tuple",
            elements: elements as readonly TargetTypeRef[],
          };
    }
    const profileType = classifyCsharpSourceProfileType(type, queries);
    if (profileType !== undefined) {
      const resolvedProfileType = resolveSourceProfileType(
        profileType,
        targetTypeArguments,
      );
      if (resolvedProfileType !== undefined) {
        return resolvedProfileType;
      }
    }
    const projectType = resolveProjectSourceSemanticType(
      type,
      queries,
      targetTypeArguments,
    );
    if (projectType !== undefined) {
      return projectType;
    }
    const callable = resolveCallableType(type, queries, state);
    if (callable !== undefined) {
      return callable;
    }
    if (queries.typeShape.isBooleanLike(type)) {
      return csharpSourcePrimitiveTargetType("bool");
    }
    if (queries.typeShape.isNumberLike(type)) {
      return csharpSourcePrimitiveTargetType("float64");
    }
    if (queries.typeShape.isStringLike(type)) {
      return csharpStringTargetType();
    }
    if (queries.typeShape.isBigIntLike(type)) {
      return csharpBigIntegerTargetType();
    }
    if (queries.typeShape.isVoidLike(type)) {
      return csharpVoidTargetType();
    }
    return undefined;
  }

  function resolveDirectSourceFacts(
    subjects: readonly ExtensionFactSubject[],
    sourceFile: SourceFile,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    for (const subject of subjects) {
      const primitive = host.sourceFacts?.getFact(subject, sourcePrimitiveFactKey);
      if (primitive !== undefined) {
        return csharpSourcePrimitiveTargetType(primitive.kind);
      }
      const pointer = host.sourceFacts?.getFact(subject, pointerFactKey);
      if (pointer !== undefined) {
        const pointee = resolveNodeWithState(
          pointer.pointee,
          sourceFile,
          nextState(state),
        );
        if (pointee !== undefined) {
          return {
            kind: "pointer",
            pointee,
            mutability: pointer.mutability === "readwrite"
              ? "mut"
              : pointer.mutability === "readonly"
                ? "const"
                : "target-defined",
          };
        }
      }
      const functionPointer = host.sourceFacts?.getFact(
        subject,
        functionPointerFactKey,
      );
      if (functionPointer !== undefined) {
        const parameters = functionPointer.parameters.map((parameter) =>
          resolveNodeWithState(parameter, sourceFile, nextState(state))
        );
        const result = resolveNodeWithState(
          functionPointer.result,
          sourceFile,
          nextState(state),
        );
        if (
          result !== undefined &&
          parameters.every((parameter) => parameter !== undefined)
        ) {
          return {
            kind: "function-pointer",
            args: parameters as readonly TargetTypeRef[],
            result,
            ...(functionPointer.abi.length === 0
              ? {}
              : { abi: functionPointer.abi }),
          };
        }
      }
    }
    return undefined;
  }

  function resolveProviderType(
    subjects: readonly ExtensionFactSubject[],
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    for (const subject of subjects) {
      const declaration = host.sourceFacts?.getFact(
        subject,
        providerVirtualDeclarationFactKey,
      );
      if (declaration === undefined) {
        continue;
      }
      const resolution = host.providers.resolveType(declaration);
      if (resolution.kind !== "resolved") {
        continue;
      }
      const typeRelations = resolution.relations.filter(
        (relation) => relation.kind === "type",
      );
      if (typeRelations.length !== 1) {
        continue;
      }
      const relation = typeRelations[0]!;
      const targetArguments = relateTypeArguments(
        typeArguments,
        relation.bindingTypeParameters,
        relation.targetBinding.typeParameters?.length ?? 0,
      );
      if (targetArguments === undefined) {
        continue;
      }
      const targetType = csharpTargetTypeFromBinding(
        relation.targetBinding,
        targetArguments,
      );
      if (targetType !== undefined) {
        return targetType;
      }
    }
    return undefined;
  }

  function resolveSemanticTypeArguments(
    type: Type,
    queries: SourceFileQueries,
    state: CsharpTypeResolutionState,
  ): readonly TargetTypeRef[] | undefined {
    if (!queries.typeShape.isTypeReference(type)) {
      return [];
    }
    const sourceArguments = queries.typeShape.getTypeArguments(type);
    const presentArguments = definedValues(sourceArguments);
    if (presentArguments.length !== sourceArguments.length) {
      return undefined;
    }
    const resolved = presentArguments.map((argument) =>
      resolveTypeWithState(argument, queries.sourceFile, nextState(state))
    );
    return resolved.some((argument) => argument === undefined)
      ? undefined
      : resolved as readonly TargetTypeRef[];
  }

  function resolveSourceProfileType(
    identity: ReturnType<typeof classifyCsharpSourceProfileType>,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    if (identity === undefined) {
      return undefined;
    }
    switch (identity.kind) {
      case "array":
      case "readonly-array": {
        const elementType = typeArguments.length === 1
          ? typeArguments[0]
          : undefined;
        if (elementType === undefined) {
          return undefined;
        }
        return identity.ownerId === "js"
          ? csharpJsArrayTargetType(elementType)
          : { kind: "array", element: elementType };
      }
      case "promise": {
        const resultType = typeArguments.length === 1
          ? typeArguments[0]
          : undefined;
        return resultType === undefined
          ? undefined
          : csharpTaskTargetType(resultType);
      }
      case "record": {
        if (typeArguments.length !== 2) {
          return undefined;
        }
        const binding = host.providers.findTargetBindingByMetadataName(
          "System.Collections.Generic.Dictionary`2",
        );
        const targetType = binding === undefined
          ? undefined
          : csharpTargetTypeFromBinding(binding, typeArguments);
        if (targetType?.kind !== "target-named") {
          return undefined;
        }
        return {
          ...(targetType as CsharpTargetNamedTypeRef),
          csharpCollectionSurface: "record",
          csharpPropertyKeyIteration: {
            kind: "key-collection",
            memberName: "Keys",
          },
        } as CsharpTargetNamedTypeRef;
      }
      case "date":
        return typeArguments.length === 0
          ? csharpJsDateTargetType()
          : undefined;
      case "regexp":
        return typeArguments.length !== 0
          ? undefined
          : identity.ownerId === "js"
            ? csharpJsRegExpTargetType()
            : csharpTargetNamedType(
                "System.Text.RegularExpressions.Regex",
                undefined,
                csharpQualifiedTypeRenderShape(
                  "System.Text.RegularExpressions",
                  "Regex",
                ),
              );
      case "map":
      case "readonly-map":
        return typeArguments.length === 2
          ? csharpJsMapTargetType(typeArguments[0]!, typeArguments[1]!)
          : undefined;
      case "set":
      case "readonly-set":
        return typeArguments.length === 1
          ? csharpJsSetTargetType(typeArguments[0]!)
          : undefined;
      case "iterable":
        return typeArguments.length === 1
          ? csharpEnumerableTargetType(typeArguments[0]!)
          : undefined;
    }
  }

  function resolveUnionType(
    type: Type,
    queries: SourceFileQueries,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const rawSourceMembers = queries.typeShape.getUnionOrIntersectionTypes(type);
    const sourceMembers = definedValues(rawSourceMembers);
    if (sourceMembers.length !== rawSourceMembers.length) {
      return undefined;
    }
    const nonNullish = sourceMembers.filter(
      (member) => !queries.typeShape.isNullish(member),
    );
    const resolved = nonNullish.map((member) =>
      resolveTypeWithState(member, queries.sourceFile, nextState(state))
    );
    if (resolved.some((member) => member === undefined)) {
      return undefined;
    }
    if (resolved.length === 0) {
      return sourceMembers.some((member) => isUndefinedType(member, queries))
        ? csharpRuntimeUndefinedTargetType()
        : csharpRuntimeNullTargetType();
    }
    const targetMembers = resolved as readonly TargetTypeRef[];
    if (nonNullish.length !== sourceMembers.length) {
      return targetMembers.length === 1
        ? csharpNullableTargetType(targetMembers[0]!)
        : csharpRuntimeUnionTargetType(targetMembers);
    }
    return targetMembers.length === 1
      ? targetMembers[0]
      : csharpRuntimeUnionTargetType(targetMembers);
  }

  function resolveCallableType(
    type: Type,
    queries: SourceFileQueries,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const rawSignatures = queries.typeShape.getCallSignatures(type);
    const signatures = definedValues(rawSignatures);
    if (signatures.length !== rawSignatures.length) {
      return undefined;
    }
    if (signatures.length !== 1) {
      return undefined;
    }
    const signature = signatures[0]!;
    const rawParameters = queries.checker.getSignatureParameters(signature);
    const parameters = definedValues(rawParameters);
    if (parameters.length !== rawParameters.length) {
      return undefined;
    }
    const parameterTypes = parameters.map((parameter) =>
        resolveSymbolType(parameter, queries, nextState(state))
      );
    if (parameterTypes.some((parameter) => parameter === undefined)) {
      return undefined;
    }
    const returnType = resolveTypeWithState(
      queries.typeShape.getReturnTypeOfSignature(signature),
      queries.sourceFile,
      nextState(state),
    );
    if (returnType === undefined) {
      return undefined;
    }
    return returnType.kind === "target-named" &&
        (returnType as CsharpTargetNamedTypeRef).csharpSpecialType === "void"
      ? csharpDelegateTargetType(
          "System.Action",
          parameterTypes as readonly TargetTypeRef[],
        )
      : csharpDelegateTargetType(
          "System.Func",
          parameterTypes as readonly TargetTypeRef[],
          returnType,
        );
  }

  function resolveSymbolType(
    symbol: Symbol,
    queries: SourceFileQueries,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const direct = resolveDirectSourceFacts(
      [
        symbol,
        ...definedValues(queries.checker.getSymbolDeclarations(symbol)),
      ],
      queries.sourceFile,
      state,
    );
    if (direct !== undefined) {
      return direct;
    }
    for (const declaration of definedValues(
      queries.checker.getSymbolDeclarations(symbol),
    )) {
      if (host.ast.is.IsParameterDeclaration(declaration)) {
        const typeNode = host.ast.as.AsParameterDeclaration(declaration)!.Type;
        if (typeNode !== undefined) {
          const declared = resolveNodeWithState(
            typeNode,
            queries.sourceFile,
            nextState(state),
          );
          if (declared !== undefined) {
            return declared;
          }
        }
      }
    }
    return resolveTypeWithState(
      queries.checker.getTypeOfSymbol(symbol),
      queries.sourceFile,
      nextState(state),
    );
  }

  function resolveProjectSourceSemanticType(
    type: Type,
    queries: SourceFileQueries,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    const symbols = [
      queries.checker.getTypeAliasSymbol(type),
      queries.checker.getTypeSymbol(type),
    ];
    for (const symbol of symbols) {
      if (symbol === undefined) {
        continue;
      }
      for (const declaration of definedValues(
        queries.checker.getSymbolDeclarations(symbol),
      )) {
        const targetType = projectSourceDeclarationTargetType(
          declaration,
          typeArguments,
        );
        if (targetType !== undefined) {
          return targetType;
        }
      }
    }
    return undefined;
  }

  function resolveProjectSourceType(
    node: Node,
    sourceFile: SourceFile,
    state: CsharpTypeResolutionState,
    typeArguments?: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    const reference = host.navigation.referenceFor(node);
    if (reference === undefined) {
      return undefined;
    }
    const resolvedArguments = typeArguments ??
      host.ast.typeArguments(node).map((argument) =>
        resolveNodeWithState(argument, sourceFile, nextState(state))
      );
    if (resolvedArguments.some((argument) => argument === undefined)) {
      return undefined;
    }
    return projectSourceDeclarationTargetType(
      reference.declaration,
      resolvedArguments as readonly TargetTypeRef[],
    );
  }

  function projectSourceDeclarationTargetType(
    declaration: Node,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    const sourceFile = host.ast.getSourceFile(declaration);
    if (
      sourceFile === undefined ||
      sourceFile.IsDeclarationFile ||
      !host.sourceFiles.some(
        (candidate) =>
          sourceFileIdentity(host.ast, candidate) ===
          sourceFileIdentity(host.ast, sourceFile),
      )
    ) {
      return undefined;
    }
    const kind = host.ast.kindName(declaration);
    if (
      kind !== "KindClassDeclaration" &&
      kind !== "KindInterfaceDeclaration" &&
      kind !== "KindEnumDeclaration"
    ) {
      return undefined;
    }
    const nameNode = host.ast.name(declaration);
    if (nameNode === undefined) {
      return undefined;
    }
    const sourceName = host.ast.text(nameNode);
    const declarationIdentity = sourceNodeIdentity(host.ast, declaration);
    if (declarationIdentity === undefined) {
      return undefined;
    }
    const sourceDeclarationKind =
      kind === "KindClassDeclaration"
        ? "class"
        : kind === "KindInterfaceDeclaration"
          ? "interface"
          : "enum";
    return csharpTargetNamedType(
      `tsonic.source:${declarationIdentity}`,
      typeArguments,
      { kind: "named", name: sourceName },
      { sourceDeclarationKind },
    );
  }

  return Object.freeze({ resolveNode, resolveType });
}

function relateTypeArguments(
  sourceArguments: readonly TargetTypeRef[],
  relations: readonly {
    readonly sourceTypeParameterIndex: number;
    readonly targetTypeParameterIndex: number;
  }[],
  targetArity: number,
): readonly TargetTypeRef[] | undefined {
  if (relations.length !== sourceArguments.length) {
    return undefined;
  }
  const targetArguments: (TargetTypeRef | undefined)[] =
    Array.from({ length: targetArity });
  for (const relation of relations) {
    const source = sourceArguments[relation.sourceTypeParameterIndex];
    if (
      source === undefined ||
      relation.targetTypeParameterIndex < 0 ||
      relation.targetTypeParameterIndex >= targetArity ||
      targetArguments[relation.targetTypeParameterIndex] !== undefined
    ) {
      return undefined;
    }
    targetArguments[relation.targetTypeParameterIndex] = source;
  }
  return targetArguments.every(
      (argument): argument is TargetTypeRef => argument !== undefined,
    )
    ? targetArguments
    : undefined;
}

function sourceFactSubjectsForNode(
  node: Node,
  queries: SourceFileQueries,
  parent?: Node,
): readonly ExtensionFactSubject[] {
  const symbols = definedValues([
    queries.checker.getResolvedSymbolOrNil(node),
    queries.checker.getSymbolAtLocation(node),
  ]);
  const subjects: ExtensionFactSubject[] = [];
  if (parent !== undefined) {
    subjects.push(parent);
  }
  subjects.push(node, ...symbols);
  for (const symbol of symbols) {
    subjects.push(
      ...definedValues(queries.checker.getSymbolDeclarations(symbol)),
    );
  }
  return subjects;
}

function sourceFactSubjectsForType(
  type: Type,
  queries: SourceFileQueries,
): readonly ExtensionFactSubject[] {
  const symbols = definedValues([
    queries.checker.getTypeAliasSymbol(type),
    queries.checker.getTypeSymbol(type),
  ]);
  const subjects: ExtensionFactSubject[] = [type, ...symbols];
  for (const symbol of symbols) {
    subjects.push(
      ...definedValues(queries.checker.getSymbolDeclarations(symbol)),
    );
  }
  return subjects;
}

function resolveTypeParameter(
  type: Type,
  queries: SourceFileQueries,
): TargetTypeRef | undefined {
  const symbol = queries.checker.getTypeSymbol(type);
  if (symbol === undefined) {
    return undefined;
  }
  for (const declaration of definedValues(
    queries.checker.getSymbolDeclarations(symbol),
  )) {
    if (!queries.ast.is.IsTypeParameterDeclaration(declaration)) {
      continue;
    }
    const nameNode = queries.ast.name(declaration);
    if (nameNode !== undefined) {
      return {
        kind: "type-parameter",
        name: queries.ast.text(nameNode),
      };
    }
  }
  return undefined;
}

function definedValues<T>(
  values: readonly (T | undefined)[],
): T[] {
  return values.filter((value): value is T => value !== undefined);
}

function resolveKeywordType(kind: string): TargetTypeRef | undefined {
  switch (kind) {
    case "KindBooleanKeyword":
      return csharpSourcePrimitiveTargetType("bool");
    case "KindNumberKeyword":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindStringKeyword":
      return csharpStringTargetType();
    case "KindBigIntKeyword":
      return csharpBigIntegerTargetType();
    case "KindVoidKeyword":
      return csharpVoidTargetType();
    case "KindAnyKeyword":
      return csharpAnyRuntimeCarrier();
    case "KindUnknownKeyword":
      return { kind: "opaque", id: "unknown" };
    case "KindNeverKeyword":
      return { kind: "opaque", id: "never" };
    default:
      return undefined;
  }
}

function isUndefinedType(
  type: Type,
  queries: SourceFileQueries,
): boolean {
  return queries.typeShape.isNullish(type) &&
    queries.typeShape.isNever(
      queries.typeShape.removeMissingOrUndefined(type),
    );
}

function nextState(
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState {
  return { depth: state.depth + 1 };
}
