import {
  createHash,
} from "node:crypto";
import {
  structFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  Node,
  SourceFile,
  SourceFileQueries,
  Symbol,
  Type,
} from "@tsonic/tsts";
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
  getCsharpNullableElementTargetType,
  csharpNullableTargetType,
} from "./nullable.js";
import {
  csharpTargetNamedType,
} from "./target-refs.js";

export interface CsharpObjectShapePolicyHost extends CsharpTypePolicyBaseHost {
  readonly types: CsharpTypePolicy;
}

export interface CsharpObjectShapePolicy {
  resolveProjectedType(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): TargetTypeRef | undefined;
  resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): CsharpObjectShapeFact | undefined;
  resolveTarget(type: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
}

interface ShapeResolutionState {
  readonly depth: number;
  readonly activeTypes: ReadonlySet<Type>;
}

const maximumObjectShapeDepth = 64;

export function createCsharpObjectShapePolicy(
  host: CsharpObjectShapePolicyHost,
): CsharpObjectShapePolicy {
  const activeNodes = new WeakSet<object>();
  const activeProjections = new WeakSet<object>();
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
        ? host.queriesFor(node)
        : host.queries(sourceFile);
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
      const contextualType = host.ast.is.IsObjectLiteralExpression(node)
        ? queries.checker.getContextualType(node)
        : undefined;
      const semanticType = contextualType ??
        queries.checker.getTypeAtLocation(node);
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

  function resolveProjectedType(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): TargetTypeRef | undefined {
    if (node === undefined) {
      return undefined;
    }
    const parent = host.ast.parent(node);
    const referenced = host.navigation.referenceFor(node)?.declaration;
    const bindingElement = host.ast.is.IsBindingElement(node)
      ? node
      : parent !== undefined && host.ast.is.IsBindingElement(parent)
      ? parent
      : referenced !== undefined && host.ast.is.IsBindingElement(referenced)
      ? referenced
      : undefined;
    if (
      bindingElement === undefined ||
      activeProjections.has(bindingElement)
    ) {
      return undefined;
    }
    const bindingPattern = host.ast.parent(bindingElement);
    if (
      bindingPattern === undefined ||
      !host.ast.is.IsObjectBindingPattern(bindingPattern)
    ) {
      return undefined;
    }
    const declaration = host.ast.as.AsBindingElement(bindingElement);
    const propertyNode = declaration?.PropertyName ?? declaration?.name;
    const sourceName = sourcePropertyName(propertyNode);
    if (sourceName === undefined) {
      return undefined;
    }
    activeProjections.add(bindingElement);
    try {
      const owner = host.ast.parent(bindingPattern);
      const ownerType = bindingProjectionOwnerType(
        owner,
        bindingPattern,
        sourceFile,
      );
      const ownerShape = resolveTarget(ownerType);
      const selectedMembers = ownerShape?.members.filter(
        (member) => member.sourceName === sourceName,
      ) ?? [];
      if (selectedMembers.length !== 1) {
        return undefined;
      }
      const selectedType = selectedMembers[0]!.type;
      return declaration?.Initializer === undefined
        ? selectedType
        : getCsharpNullableElementTargetType(selectedType) ?? selectedType;
    } finally {
      activeProjections.delete(bindingElement);
    }
  }

  function bindingProjectionOwnerType(
    owner: Node | undefined,
    bindingPattern: Node,
    sourceFile: SourceFile | undefined,
  ): TargetTypeRef | undefined {
    if (owner === undefined) {
      return undefined;
    }
    if (host.ast.is.IsVariableDeclaration(owner)) {
      const declaration = host.ast.as.AsVariableDeclaration(owner);
      const source = declaration?.Type ?? declaration?.Initializer;
      return host.types.resolveNode(
        source,
        sourceFile ?? host.ast.getSourceFile(owner),
      );
    }
    if (host.ast.is.IsParameterDeclaration(owner)) {
      return host.types.resolveNode(
        host.ast.as.AsParameterDeclaration(owner)?.Type,
        sourceFile ?? host.ast.getSourceFile(owner),
      );
    }
    if (
      host.ast.is.IsBindingElement(owner) &&
      host.ast.as.AsBindingElement(owner)?.name === bindingPattern
    ) {
      return resolveProjectedType(
        owner,
        sourceFile ?? host.ast.getSourceFile(owner),
      );
    }
    return undefined;
  }

  function sourcePropertyName(
    node: Node | undefined,
  ): string | undefined {
    return node !== undefined &&
        (
          host.ast.is.IsIdentifier(node) ||
          host.ast.is.IsStringLiteral(node) ||
          host.ast.is.IsNumericLiteral(node)
        )
      ? host.ast.text(node)
      : undefined;
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

  function remember(node: Node, shape: CsharpObjectShapeFact): void {
    nodeShapes.set(node, shape);
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
    queries: SourceFileQueries,
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
    queries: SourceFileQueries,
    state: ShapeResolutionState,
  ): CsharpObjectShapeFact | undefined {
    if (
      type === undefined ||
      state.depth > maximumObjectShapeDepth ||
      state.activeTypes.has(type) ||
      typeIsExcludedFromObjectShape(type, queries)
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
    const members = deriveMembers(type, queries, nextState);
    if (members === undefined) {
      return undefined;
    }
    const objectLiteral = host.ast.is.IsObjectLiteralExpression(node);
    const declaredKind = contextualProjectType?.csharpSourceDeclarationKind;
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
            ),
          }
        : undefined;
    }
    if (declaredKind === "enum") {
      return undefined;
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
    queries: SourceFileQueries,
    state: ShapeResolutionState,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    const rawProperties = queries.typeShape.getProperties(ownerType);
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
    queries: SourceFileQueries,
    state: ShapeResolutionState,
  ): CsharpObjectShapeMemberFact | undefined {
    const sourceName = queries.checker.getSymbolName(property);
    if (sourceName.length === 0) {
      return undefined;
    }
    const declarations = queries.checker.getSymbolDeclarations(property)
      .filter((declaration): declaration is Node => declaration !== undefined);
    const sourceType = queries.typeShape.getPropertyType(ownerType, sourceName);
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
    queries: SourceFileQueries,
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
    queries: SourceFileQueries,
    state: ShapeResolutionState,
  ): TargetTypeRef | undefined {
    const signatures = queries.typeShape.getCallSignatures(sourceType);
    if (signatures.length !== 1 || signatures[0] === undefined) {
      return undefined;
    }
    const signature = signatures[0];
    const rawParameters = queries.checker.getSignatureParameters(signature);
    const parameters = rawParameters.filter(
      (parameter): parameter is Symbol => parameter !== undefined,
    );
    if (parameters.length !== rawParameters.length) {
      return undefined;
    }
    const parameterTypes = parameters.map((parameter) =>
      host.types.resolveType(
        queries.checker.getTypeOfSymbol(parameter),
        queries.sourceFile,
      )
    );
    const returnType = host.types.resolveType(
      queries.typeShape.getReturnTypeOfSignature(signature),
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
    resolveProjectedType,
    resolveNode,
    resolveTarget,
  });
}

function sourceSubjects(
  node: Node,
  queries: SourceFileQueries,
): readonly ExtensionFactSubject[] {
  const subjects: ExtensionFactSubject[] = [node];
  const referenceSymbol = queries.checker.getResolvedSymbolOrNil(node);
  const locationSymbol = queries.checker.getSymbolAtLocation(node);
  for (const symbol of [referenceSymbol, locationSymbol]) {
    if (symbol === undefined || subjects.includes(symbol)) {
      continue;
    }
    subjects.push(symbol);
    for (const declaration of queries.checker.getSymbolDeclarations(symbol)) {
      if (declaration !== undefined && !subjects.includes(declaration)) {
        subjects.push(declaration);
      }
    }
  }
  return subjects;
}

function typeIsExcludedFromObjectShape(
  type: Type,
  queries: SourceFileQueries,
): boolean {
  return queries.typeShape.isAny(type) ||
    queries.typeShape.isUnknown(type) ||
    queries.typeShape.isNever(type) ||
    queries.typeShape.isVoidLike(type) ||
    queries.typeShape.isNullish(type) ||
    queries.typeShape.isStringLike(type) ||
    queries.typeShape.isNumberLike(type) ||
    queries.typeShape.isBooleanLike(type) ||
    queries.typeShape.isBigIntLike(type) ||
    queries.typeShape.isUnion(type) ||
    queries.typeShape.isTuple(type) ||
    queries.typeShape.getCallSignatures(type).length > 0;
}

function typeIncludesNullish(
  type: Type,
  queries: SourceFileQueries,
): boolean {
  return queries.typeShape.isNullish(type) ||
    (
      queries.typeShape.isUnion(type) &&
      queries.typeShape.getUnionOrIntersectionTypes(type).some((member) =>
        member !== undefined && queries.typeShape.isNullish(member)
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
  queries: SourceFileQueries,
): boolean {
  const symbol = queries.checker.getTypeSymbol(type);
  if (symbol === undefined) {
    return false;
  }
  const declarations = queries.checker.getSymbolDeclarations(symbol)
    .filter((declaration): declaration is Node =>
      declaration !== undefined &&
      queries.ast.is.IsClassDeclaration(declaration)
    );
  if (declarations.length !== 1) {
    return false;
  }
  const constructors = queries.ast.members(declarations[0]!)
    .filter((member): member is Node =>
      member !== undefined &&
      queries.ast.is.IsConstructorDeclaration(member)
    );
  return constructors.length === 0 ||
    constructors.some((constructor) =>
      queries.ast.parameters(constructor).every((parameter) =>
        parameter !== undefined &&
        (
          queries.ast.questionToken(parameter) !== undefined ||
          parameterAcceptsOmission(parameter, queries)
        )
      )
    );
}

function parameterAcceptsOmission(
  parameter: Node,
  queries: SourceFileQueries,
): boolean {
  if (!queries.ast.is.IsParameterDeclaration(parameter)) {
    return false;
  }
  const declaration = queries.ast.as.AsParameterDeclaration(parameter);
  return declaration?.Initializer !== undefined ||
    declaration?.DotDotDotToken !== undefined;
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
