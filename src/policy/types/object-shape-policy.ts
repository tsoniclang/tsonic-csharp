import {
  createHash,
} from "node:crypto";
import {
  providerVirtualDeclarationFactKey,
  structFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  Symbol,
  Type,
} from "@tsonic/tsts";
import type {
  SourceFileSemantics,
} from "@tsonic/target-api";
import {
  isPlainCsharpIdentifier,
} from "../../csharp-identifiers.js";
import type {
  CsharpTypePolicy,
  CsharpTypePolicyBaseHost,
} from "./resolution.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  CsharpRuntimeUnionTargetTypeRef,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./definitions.js";
import {
  csharpDelegateTargetType,
} from "./delegates.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "./equality.js";
import {
  isCsharpVoidTargetType,
} from "./identity.js";
import {
  csharpNullableTargetType,
} from "./nullable.js";
import {
  csharpTargetNamedType,
} from "./target-refs.js";

export interface CsharpObjectShapePolicyHost extends CsharpTypePolicyBaseHost {
  readonly types: CsharpTypePolicy;
}

export interface CsharpObjectShapePolicy {
  resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): CsharpObjectShapeFact | undefined;
  resolveTarget(type: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
  resolveProjectConstructibleSelectedType(
    targetType: TargetTypeRef,
    explicitTypeNode: Node | undefined,
    selectedType: Type,
    contextNode: Node,
    sourceFile: SourceFile,
  ): CsharpProjectConstructibleTypeProjection;
}

export type CsharpProjectConstructibleTypeProjection =
  | { readonly kind: "unchanged" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "rejected"; readonly reason: string };

interface ShapeResolutionState {
  readonly depth: number;
  readonly activeTypes: ReadonlySet<Type>;
}

const maximumObjectShapeDepth = 64;

export function createCsharpObjectShapePolicy(
  host: CsharpObjectShapePolicyHost,
): CsharpObjectShapePolicy {
  const activeNodes = new WeakSet<object>();
  const nodeShapes = new WeakMap<object, CsharpObjectShapeFact>();
  const targetShapes = new Map<string, CsharpObjectShapeFact>();

  function resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): CsharpObjectShapeFact | undefined {
    if (node === undefined) {
      return undefined;
    }
    const cached = nodeShapes.get(node);
    if (cached !== undefined) {
      return cached;
    }
    if (activeNodes.has(node)) {
      return undefined;
    }
    activeNodes.add(node);
    try {
      const queries = sourceFile === undefined
        ? host.semanticsFor(node)
        : host.semantics(sourceFile);
      const directStruct = resolveStructShape(node, queries);
      if (directStruct !== undefined) {
        remember(node, directStruct);
        return directStruct;
      }
      const selectedTarget = host.types.resolveNode(node, queries.sourceFile);
      const selectedShape = resolveTarget(selectedTarget);
      if (selectedShape !== undefined) {
        remember(node, selectedShape);
        return selectedShape;
      }
      const semanticType = selectedObjectShapeSourceType(node, queries, host);
      const shape = resolveSemanticShape(
        semanticType,
        node,
        queries,
        {
          depth: 0,
          activeTypes: new Set(),
        },
      );
      if (shape !== undefined) {
        remember(node, shape);
      }
      return shape;
    } finally {
      activeNodes.delete(node);
    }
  }

  function resolveTarget(
    type: TargetTypeRef | undefined,
  ): CsharpObjectShapeFact | undefined {
    if (type === undefined) {
      return undefined;
    }
    const direct = targetShapes.get(targetTypeRefKey(type));
    if (direct !== undefined) {
      return direct;
    }
    if (type.kind !== "target-named") {
      return undefined;
    }
    const union = type as Partial<CsharpRuntimeUnionTargetTypeRef>;
    const arms = union.csharpRuntimeUnionArms;
    const shapes = union.csharpRuntimeUnionObjectShapes;
    if (arms === undefined || shapes === undefined) {
      return undefined;
    }
    const present = shapes.filter(
      (shape): shape is CsharpObjectShapeFact => shape !== undefined,
    );
    return present.length === 1 ? present[0] : undefined;
  }

  function resolveProjectConstructibleSelectedType(
    targetType: TargetTypeRef,
    explicitTypeNode: Node | undefined,
    selectedType: Type,
    contextNode: Node,
    sourceFile: SourceFile,
  ): CsharpProjectConstructibleTypeProjection {
    if (!isProjectSourceTargetType(targetType)) {
      return { kind: "unchanged" };
    }
    const selectedTarget = host.types.resolveSelectedType(
      explicitTypeNode,
      selectedType,
      sourceFile,
    );
    if (
      selectedTarget === undefined ||
      !targetTypeRefEquals(selectedTarget, targetType)
    ) {
      return {
        kind: "rejected",
        reason:
          "The exact selected source type does not agree with its selected C# project type argument.",
      };
    }
    if (
      targetType.csharpSourceDeclarationKind === "struct" ||
      targetType.csharpSourceDeclarationKind === "enum"
    ) {
      return { kind: "unchanged" };
    }
    const queries = host.semantics(sourceFile);
    if (
      !typeHasProjectOwnedShapeDeclaration(
        selectedType,
        contextNode,
        queries,
        host,
      )
    ) {
      return {
        kind: "rejected",
        reason:
          "The selected C# project type argument has no exact project-owned source declaration.",
      };
    }
    const members = deriveMembers(
      selectedType,
      queries,
      { depth: 1, activeTypes: new Set([selectedType]) },
    );
    if (members === undefined) {
      return {
        kind: "rejected",
        reason:
          "The selected C# project type argument has no closed object-shape member projection.",
      };
    }
    if (targetType.csharpSourceDeclarationKind === "class") {
      if (!projectClassIsObjectInitializable(selectedType, queries, host)) {
        return {
          kind: "rejected",
          reason:
            "The selected C# project class is not constructible through an exact omittable-parameter constructor.",
        };
      }
      const shape = {
        targetType,
        members,
        constructible: true,
      } satisfies CsharpObjectShapeFact;
      return { kind: "resolved", shape };
    }
    if (targetType.csharpSourceDeclarationKind !== "interface") {
      return {
        kind: "rejected",
        reason:
          "The selected C# project type argument is not a class, interface, struct, or enum.",
      };
    }
    const shape = {
      targetType: createStructuralObjectShapeTarget(members, [targetType]),
      members,
      implements: [targetType],
    } satisfies CsharpObjectShapeFact;
    return { kind: "resolved", shape };
  }

  function remember(node: Node, shape: CsharpObjectShapeFact): void {
    nodeShapes.set(node, shape);
    rememberTargetShape(shape);
  }

  function rememberTargetShape(shape: CsharpObjectShapeFact): void {
    const key = targetTypeRefKey(shape.targetType);
    const existing = targetShapes.get(key);
    if (existing !== undefined && !csharpObjectShapesEqual(existing, shape)) {
      throw new Error(
        `C# object-shape target '${key}' resolved to contradictory structural contracts.`,
      );
    }
    targetShapes.set(key, shape);
  }

  function resolveStructShape(
    node: Node,
    queries: SourceFileSemantics,
  ): CsharpObjectShapeFact | undefined {
    for (const subject of sourceSubjects(node, queries)) {
      const fact = host.sourceFacts?.getFact(subject, structFactKey);
      if (fact === undefined) {
        continue;
      }
      const targetType = host.types.resolveNode(node, queries.sourceFile);
      if (targetType === undefined) {
        return undefined;
      }
      const members = (fact.fields ?? []).map((field) => {
        const type = host.types.resolveNode(field.type, queries.sourceFile);
        return type === undefined
          ? undefined
          : {
              sourceName: field.name,
              sourceSubjects: [field.type],
              targetName: objectShapeMemberTargetName(field.name),
              memberKind: "property" as const,
              type,
              ...(field.readonly === true ? { readonly: true } : {}),
            };
      });
      return members.some((member) => member === undefined)
        ? undefined
        : {
            targetType,
            members: members as readonly CsharpObjectShapeMemberFact[],
            constructible: true,
          };
    }
    return undefined;
  }

  function resolveSemanticShape(
    type: Type | undefined,
    node: Node,
    queries: SourceFileSemantics,
    state: ShapeResolutionState,
  ): CsharpObjectShapeFact | undefined {
    if (
      type === undefined ||
      state.depth > maximumObjectShapeDepth ||
      state.activeTypes.has(type) ||
      typeIsExcludedFromObjectShape(type, queries) ||
      !typeHasProjectOwnedShapeDeclaration(type, node, queries, host)
    ) {
      return undefined;
    }
    const nextActive = new Set(state.activeTypes);
    nextActive.add(type);
    const nextState = {
      depth: state.depth + 1,
      activeTypes: nextActive,
    };
    const targetType = host.types.resolveType(type, queries.sourceFile);
    const contextualProjectType = targetType !== undefined &&
        isProjectSourceTargetType(targetType)
      ? targetType
      : undefined;
    const objectLiteral = host.ast.is.IsObjectLiteralExpression(node);
    const declaredKind = contextualProjectType?.csharpSourceDeclarationKind;
    if (
      contextualProjectType !== undefined &&
      declaredKind === "class" &&
      !objectLiteral
    ) {
      return undefined;
    }
    if (declaredKind === "enum") {
      return undefined;
    }
    const members = deriveMembers(type, queries, nextState);
    if (members === undefined) {
      return undefined;
    }
    if (
      contextualProjectType !== undefined &&
      declaredKind === "class"
    ) {
      return objectLiteral
        ? {
            targetType: contextualProjectType,
            members,
            constructible: projectClassIsObjectInitializable(
              type,
              queries,
              host,
            ),
          }
        : undefined;
    }
    if (
      contextualProjectType !== undefined &&
      declaredKind === "interface" &&
      !objectLiteral
    ) {
      return {
        targetType: contextualProjectType,
        members,
      };
    }
    const implemented = contextualProjectType !== undefined &&
        declaredKind === "interface"
      ? [contextualProjectType]
      : undefined;
    return {
      targetType: createStructuralObjectShapeTarget(members, implemented),
      members,
      ...(implemented === undefined ? {} : { implements: implemented }),
    };
  }

  function deriveMembers(
    ownerType: Type,
    queries: SourceFileSemantics,
    state: ShapeResolutionState,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    const rawProperties = queries.getProperties(ownerType);
    const properties = rawProperties.filter(
      (property): property is Symbol => property !== undefined,
    );
    if (properties.length !== rawProperties.length) {
      return undefined;
    }
    const members = properties.map((property) =>
      deriveMember(ownerType, property, queries, state)
    );
    return members.some((member) => member === undefined)
      ? undefined
      : members as readonly CsharpObjectShapeMemberFact[];
  }

  function deriveMember(
    ownerType: Type,
    property: Symbol,
    queries: SourceFileSemantics,
    state: ShapeResolutionState,
  ): CsharpObjectShapeMemberFact | undefined {
    const sourceName = queries.getSymbolName(property);
    if (sourceName.length === 0) {
      return undefined;
    }
    const declarations = queries.getSymbolDeclarations(property)
      .filter((declaration): declaration is Node => declaration !== undefined);
    const sourceType = queries.getPropertyType(ownerType, sourceName);
    if (sourceType === undefined) {
      return undefined;
    }
    const method = declarations.some((declaration) =>
      host.ast.is.IsMethodDeclaration(declaration) ||
      host.ast.is.IsMethodSignatureDeclaration(declaration)
    );
    const memberType = method
      ? resolveMethodType(sourceType, queries, state)
      : resolvePropertyType(declarations, sourceType, queries);
    if (memberType === undefined) {
      return undefined;
    }
    const optional = declarations.some((declaration) =>
      host.ast.questionToken(declaration) !== undefined
    ) || typeIncludesNullish(sourceType, queries);
    return {
      sourceName,
      sourceSubjects: declarations.length === 0
        ? [property]
        : [property, ...declarations],
      targetName: objectShapeMemberTargetName(sourceName),
      memberKind: method ? "method" : "property",
      type: optional ? csharpNullableTargetType(memberType) : memberType,
      ...(optional ? { optional: true } : {}),
      ...(declarations.some((declaration) =>
          host.ast.hasModifierKind(declaration, "readonly")
        )
        ? { readonly: true }
        : {}),
    };
  }

  function resolvePropertyType(
    declarations: readonly Node[],
    sourceType: Type,
    queries: SourceFileSemantics,
  ): TargetTypeRef | undefined {
    const authoredTypeNodes = declarations
      .map(propertyDeclarationTypeNode)
      .filter((typeNode): typeNode is Node => typeNode !== undefined);
    if (authoredTypeNodes.length === 0) {
      return host.types.resolveType(sourceType, queries.sourceFile);
    }
    const authoredTypes = authoredTypeNodes.map((typeNode) =>
      host.types.resolveNode(
        typeNode,
        host.ast.getSourceFile(typeNode) ?? queries.sourceFile,
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

  function propertyDeclarationTypeNode(
    declaration: Node,
  ): Node | undefined {
    if (host.ast.is.IsPropertyDeclaration(declaration)) {
      return host.ast.as.AsPropertyDeclaration(declaration)?.Type;
    }
    if (host.ast.is.IsPropertySignatureDeclaration(declaration)) {
      return host.ast.as.AsPropertySignatureDeclaration(declaration)?.Type;
    }
    if (host.ast.is.IsGetAccessorDeclaration(declaration)) {
      return host.ast.as.AsGetAccessorDeclaration(declaration)?.Type;
    }
    return undefined;
  }

  function resolveMethodType(
    sourceType: Type,
    queries: SourceFileSemantics,
    state: ShapeResolutionState,
  ): TargetTypeRef | undefined {
    const signatures = queries.getCallSignatures(sourceType);
    if (signatures.length !== 1 || signatures[0] === undefined) {
      return undefined;
    }
    const signature = signatures[0];
    const rawParameters = queries.getSignatureParameters(signature);
    const parameters = rawParameters.filter(
      (parameter): parameter is Symbol => parameter !== undefined,
    );
    if (parameters.length !== rawParameters.length) {
      return undefined;
    }
    const parameterTypes = parameters.map((parameter) =>
      host.types.resolveType(
        queries.getTypeOfSymbol(parameter),
        queries.sourceFile,
      )
    );
    const returnType = host.types.resolveType(
      queries.getReturnTypeOfSignature(signature),
      queries.sourceFile,
    );
    if (
      returnType === undefined ||
      parameterTypes.some((parameter) => parameter === undefined) ||
      state.depth > maximumObjectShapeDepth
    ) {
      return undefined;
    }
    return isCsharpVoidTargetType(returnType)
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

  return Object.freeze({
    resolveNode,
    resolveTarget,
    resolveProjectConstructibleSelectedType,
  });
}

function selectedObjectShapeSourceType(
  node: Node,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): Type | undefined {
  const semanticType = queries.getTypeAtLocation(node);
  if (!host.ast.is.IsObjectLiteralExpression(node)) {
    return semanticType;
  }
  const contextual = queries.selectContextualValueType(node);
  if (contextual.kind !== "selected") {
    return semanticType;
  }
  const contextualType = contextual.type;
  const contextualSymbol = queries.getTypeAliasSymbol(contextualType) ??
    queries.getTypeSymbol(contextualType);
  const contextualDeclarations = queries.getSymbolDeclarations(
    contextualSymbol,
  );
  return contextualDeclarations.some((declaration) =>
      declaration !== undefined &&
      host.navigation.isProjectDeclaration(declaration) &&
      (
        host.ast.is.IsClassDeclaration(declaration) ||
        host.ast.is.IsInterfaceDeclaration(declaration)
      )
    )
    ? contextualType
    : semanticType;
}

function sourceSubjects(
  node: Node,
  queries: SourceFileSemantics,
): readonly ExtensionFactSubject[] {
  const subjects: ExtensionFactSubject[] = [node];
  const referenceSymbol = queries.getResolvedSymbolOrNil(node);
  const locationSymbol = queries.getSymbolAtLocation(node);
  for (const symbol of [referenceSymbol, locationSymbol]) {
    if (symbol === undefined || subjects.includes(symbol)) {
      continue;
    }
    subjects.push(symbol);
    for (const declaration of queries.getSymbolDeclarations(symbol)) {
      if (declaration !== undefined && !subjects.includes(declaration)) {
        subjects.push(declaration);
      }
    }
  }
  return subjects;
}

function typeIsExcludedFromObjectShape(
  type: Type,
  queries: SourceFileSemantics,
): boolean {
  return queries.isAny(type) ||
    queries.isUnknown(type) ||
    queries.isNever(type) ||
    queries.isVoidLike(type) ||
    queries.isNullish(type) ||
    queries.isStringLike(type) ||
    queries.isNumberLike(type) ||
    queries.isBooleanLike(type) ||
    queries.isBigIntLike(type) ||
    queries.isUnion(type) ||
    queries.isTuple(type) ||
    queries.getCallSignatures(type).length > 0;
}

function typeHasProjectOwnedShapeDeclaration(
  type: Type,
  node: Node,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  const typeSymbols = [
    queries.getTypeAliasSymbol(type),
    queries.getTypeSymbol(type),
  ];
  const typeSubjects: ExtensionFactSubject[] = [type];
  for (const symbol of typeSymbols) {
    if (symbol === undefined) {
      continue;
    }
    typeSubjects.push(symbol);
    for (const declaration of queries.getSymbolDeclarations(symbol)) {
      if (declaration !== undefined) {
        typeSubjects.push(declaration);
      }
    }
  }
  if (typeSubjects.some((subject) =>
    host.sourceFacts?.getFact(
      subject,
      providerVirtualDeclarationFactKey,
    ) !== undefined
  )) {
    return false;
  }
  if (host.ast.is.IsObjectLiteralExpression(node)) {
    return true;
  }
  const reference = host.navigation.referenceFor(node);
  if (
    host.navigation.isProjectDeclaration(reference?.declaration) ||
    host.navigation.isProjectDeclaration(
      host.navigation.declarationFor(node),
    )
  ) {
    return true;
  }
  return typeSymbols.some((symbol) =>
    queries.getSymbolDeclarations(symbol).some((declaration) =>
      host.navigation.isProjectDeclaration(declaration)
    )
  );
}

function typeIncludesNullish(
  type: Type,
  queries: SourceFileSemantics,
): boolean {
  return queries.isNullish(type) ||
    (
      queries.isUnion(type) &&
      queries.getUnionOrIntersectionTypes(type).some((member) =>
        member !== undefined && queries.isNullish(member)
      )
    );
}

function isProjectSourceTargetType(
  type: TargetTypeRef,
): type is CsharpTargetNamedTypeRef {
  return type.kind === "target-named" &&
    type.id.startsWith("tsonic.source:");
}

function projectClassIsObjectInitializable(
  type: Type,
  queries: SourceFileSemantics,
  host: CsharpObjectShapePolicyHost,
): boolean {
  const symbol = queries.getTypeSymbol(type);
  if (symbol === undefined) {
    return false;
  }
  const declarations = queries.getSymbolDeclarations(symbol)
    .filter((declaration): declaration is Node =>
      declaration !== undefined &&
      host.ast.is.IsClassDeclaration(declaration) &&
      host.navigation.isProjectDeclaration(declaration)
    );
  if (declarations.length !== 1) {
    return false;
  }
  const constructors = host.navigation.classConstructors(declarations[0]!);
  return constructors.kind === "resolved" &&
    constructors.signatures.some((signature) =>
      signature.parameters.every((parameter) => parameter.acceptsOmission)
    );
}

function createStructuralObjectShapeTarget(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
): TargetTypeRef {
  const key = [
    ...members.map((member) => [
      member.sourceName,
      member.targetName,
      member.memberKind,
      member.optional === true ? "optional" : "required",
      member.readonly === true ? "readonly" : "mutable",
      targetTypeRefKey(member.type),
    ].join(":")).sort(),
    ...(implemented ?? [])
      .map((type) => `implements:${targetTypeRefKey(type)}`)
      .sort(),
  ].join("|");
  const identity = createHash("sha256").update(key).digest("hex");
  const name = `__TsonicShape_${identity}`;
  const typeParameters = collectObjectShapeTypeParameters(members, implemented);
  return csharpTargetNamedType(
    `tsonic.shape:${identity}`,
    typeParameters.length === 0 ? undefined : typeParameters,
    { kind: "named", name },
  );
}

function collectObjectShapeTypeParameters(
  members: readonly CsharpObjectShapeMemberFact[],
  implemented: readonly TargetTypeRef[] | undefined,
): readonly TargetTypeRef[] {
  const parameters = new Map<string, TargetTypeRef>();
  const collect = (type: TargetTypeRef): void => {
    switch (type.kind) {
      case "type-parameter":
        parameters.set(type.name, type);
        return;
      case "source-global":
      case "target-named":
        for (const argument of type.typeArguments ?? []) {
          collect(argument);
        }
        return;
      case "array":
        collect(type.element);
        return;
      case "tuple":
        type.elements.forEach(collect);
        return;
      case "pointer":
        collect(type.pointee);
        return;
      case "function-pointer":
        type.args.forEach(collect);
        collect(type.result);
        return;
      case "associated-type":
        collect(type.owner);
        return;
      case "source-primitive":
      case "opaque":
      case "lifetime":
      case "target-specific":
        return;
    }
  };
  members.forEach((member) => collect(member.type));
  (implemented ?? []).forEach(collect);
  return [...parameters.values()].sort((left, right) =>
    targetTypeRefKey(left).localeCompare(targetTypeRefKey(right))
  );
}

function objectShapeMemberTargetName(sourceName: string): string {
  return isPlainCsharpIdentifier(sourceName)
    ? sourceName
    : `__tsonic_member_${
      createHash("sha256").update(sourceName).digest("hex")
    }`;
}

export function csharpObjectShapesEqual(
  left: CsharpObjectShapeFact,
  right: CsharpObjectShapeFact,
): boolean {
  return targetTypeRefEquals(left.targetType, right.targetType) &&
    left.constructible === right.constructible &&
    targetTypeListsEqual(left.implements ?? [], right.implements ?? []) &&
    left.members.length === right.members.length &&
    left.members.every((member, index) => {
      const other = right.members[index];
      return other !== undefined &&
        member.sourceName === other.sourceName &&
        member.targetName === other.targetName &&
        member.memberKind === other.memberKind &&
        member.optional === other.optional &&
        member.readonly === other.readonly &&
        targetTypeRefEquals(member.type, other.type);
    });
}

function targetTypeListsEqual(
  left: readonly TargetTypeRef[],
  right: readonly TargetTypeRef[],
): boolean {
  return left.length === right.length &&
    left.every((type, index) =>
      right[index] !== undefined &&
      targetTypeRefEquals(type, right[index]!)
    );
}
