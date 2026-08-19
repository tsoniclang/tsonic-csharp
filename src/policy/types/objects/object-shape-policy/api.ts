import { createStructuralObjectShapeTarget, mergeCsharpObjectShapeSubjects, objectShapeMemberTargetName } from "./construction.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../storage/nullable.js";
import { csharpObjectShapesEqual } from "./equality.js";
import { isProjectSourceTargetType, projectClassIsObjectInitializable, requiresUnresolvedStructuralProjection, selectedObjectShapeSource, sourceSubjects, typeHasProjectOwnedShapeDeclaration, typeIncludesNullish, typeIsExcludedFromObjectShape } from "./source-evidence.js";
import { readCsharpSourceStruct } from "../../resolution/source-markers.js";
import {
  selectSourceObjectLiteralAccessors,
  sourcePropertyTypeEvidenceNodes,
  sourceTransformedTypeFactEvidenceNodes,
} from "@tsonic/target-api/source";
import { targetTypeRefEquals, targetTypeRefKey } from "../../model/equality.js";
import type {
  CsharpObjectShapeFact,
  CsharpObjectShapeMemberFact,
  CsharpRuntimeUnionTargetTypeRef,
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "../../model/definitions.js";
import type {
  Node,
  SourceFile,
  Type,
  TypePropertyInfo,
} from "@tsonic/tsts";
import type { CsharpTypePolicy, CsharpTypePolicyBaseHost } from "../../resolution/index.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";

export interface CsharpObjectShapePolicyHost extends CsharpTypePolicyBaseHost {
  readonly types: CsharpTypePolicy;
}

export interface CsharpObjectShapePolicy {
  resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): CsharpObjectShapeFact | undefined;
  resolveTarget(type: TargetTypeRef | undefined): CsharpObjectShapeFact | undefined;
  resolveType(
    type: Type | undefined,
    sourceFile: SourceFile,
    authoredTypeRoot?: Node,
  ): CsharpObjectShapeFact | undefined;
  resolveObjectLiteralTargetShape(
    expectedShape: CsharpObjectShapeFact | undefined,
    objectLiteral: Node,
    sourceFile: SourceFile,
  ): CsharpObjectLiteralTargetShapeResolution;
  resolveProjectConstructibleSelectedType(
    targetType: TargetTypeRef,
    explicitTypeNode: Node | undefined,
    selectedType: Type,
    contextNode: Node,
    sourceFile: SourceFile,
  ): CsharpProjectConstructibleTypeProjection;
}

export type CsharpObjectLiteralTargetShapeResolution =
  | { readonly kind: "not-applicable" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | {
      readonly kind: "rejected";
      readonly subject: Node;
      readonly reason: string;
    };

export type CsharpProjectConstructibleTypeProjection =
  | { readonly kind: "unchanged" }
  | { readonly kind: "resolved"; readonly shape: CsharpObjectShapeFact }
  | { readonly kind: "rejected"; readonly reason: string };

export function createCsharpObjectShapePolicy(
  host: CsharpObjectShapePolicyHost,
): CsharpObjectShapePolicy {
  const activeNodes = new WeakSet<object>();
  const activeTypes = new WeakSet<object>();
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
      const source = selectedObjectShapeSource(node, queries, host);
      const shape = resolveSemanticShape(
        source.type,
        node,
        queries,
        source.contextualProjectTarget ?? selectedTarget,
      );
      if (shape !== undefined) {
        return remember(node, shape);
      }
      if (selectedShape !== undefined) {
        return remember(node, selectedShape);
      }
      return undefined;
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
    const nullableElement = getCsharpNullableElementTargetType(type);
    if (nullableElement !== undefined) {
      return resolveTarget(nullableElement);
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

  function resolveType(
    type: Type | undefined,
    sourceFile: SourceFile,
    authoredTypeRoot?: Node,
  ): CsharpObjectShapeFact | undefined {
    if (type === undefined) {
      return undefined;
    }
    const shape = resolveSemanticShape(
      type,
      undefined,
      host.semantics(sourceFile),
      undefined,
      authoredTypeRoot,
    );
    return shape === undefined ? undefined : rememberTargetShape(shape);
  }

  function resolveObjectLiteralTargetShape(
    expectedShape: CsharpObjectShapeFact | undefined,
    objectLiteral: Node,
    sourceFile: SourceFile,
  ): CsharpObjectLiteralTargetShapeResolution {
    const accessors = selectSourceObjectLiteralAccessors(
      host.ast,
      host.semantics(sourceFile),
      objectLiteral,
    );
    if (accessors.kind === "rejected") {
      return {
        kind: "rejected",
        subject: accessors.element,
        reason: accessors.reason,
      };
    }
    if (expectedShape === undefined) {
      if (accessors.kind === "none") {
        return { kind: "not-applicable" };
      }
      const setterOnly = accessors.members.find((member) =>
        member.getter === undefined
      );
      return setterOnly === undefined
        ? {
            kind: "rejected",
            subject: accessors.members[0]!.getter!.element,
            reason:
              "Object-literal accessor has no exact finalized property-shape contract.",
          }
        : {
            kind: "rejected",
            subject: setterOnly.setter!.element,
            reason: `Object-literal setter '${setterOnly.sourceName}' has no getter and therefore no exact native read carrier.`,
          };
    }
    const implemented = expectedShape.targetType.kind === "target-named" &&
        (expectedShape.targetType as CsharpTargetNamedTypeRef)
            .csharpSourceDeclarationKind === "interface"
      ? [expectedShape.targetType]
      : expectedShape.implements;
    if (accessors.kind === "none" && implemented === expectedShape.implements) {
      return { kind: "resolved", shape: expectedShape };
    }
    const members = [...expectedShape.members];
    if (accessors.kind === "resolved") {
      for (const accessor of accessors.members) {
        const selectedSubjects = [
          accessor.sourceSelectedSymbol,
          ...accessor.sourceSelectedDeclarations,
        ];
        const selectedTypes = [
          ...(accessor.getter === undefined
            ? []
            : [accessor.getter.sourceSelectedType]),
          ...(accessor.setter === undefined
            ? []
            : [accessor.setter.sourceSelectedType]),
        ];
        const matches = members
          .map((member, index) => ({ member, index }))
          .filter(({ member }) =>
            member.sourceSubjects?.some((subject) =>
              selectedSubjects.some((selected) => selected === subject)
            ) === true &&
            selectedTypes.every((selectedType) =>
              member.sourceTypes?.some((sourceType) =>
                sourceType === selectedType
              ) === true
            )
          );
        if (matches.length !== 1 || matches[0]!.member.memberKind !== "property") {
          return {
            kind: "rejected",
            subject: accessor.getter?.element ?? accessor.setter!.element,
            reason: `Object-literal accessor '${accessor.sourceName}' does not match one exact finalized property-shape member.`,
          };
        }
        const matched = matches[0]!;
        if (accessor.getter === undefined) {
          return {
            kind: "rejected",
            subject: accessor.setter!.element,
            reason: `Object-literal setter '${accessor.sourceName}' has no getter and therefore no exact native read carrier.`,
          };
        }
        if (matched.member.readonly !== true && accessor.setter === undefined) {
          return {
            kind: "rejected",
            subject: accessor.getter.element,
            reason: `Object-literal getter '${accessor.sourceName}' cannot satisfy the selected writable property contract without an exact setter.`,
          };
        }
        members[matched.index] = {
          ...matched.member,
          sourceSubjects: Object.freeze([
            ...(matched.member.sourceSubjects ?? []),
            accessor.sourceSelectedSymbol,
            ...accessor.sourceSelectedDeclarations,
            accessor.getter.element,
            ...(accessor.setter === undefined ? [] : [accessor.setter.element]),
          ]),
          sourceDeclarations: Object.freeze([
            ...(matched.member.sourceDeclarations ?? []),
            accessor.getter.element,
            ...(accessor.setter === undefined ? [] : [accessor.setter.element]),
          ]),
          sourceTypes: Object.freeze([
            ...(matched.member.sourceTypes ?? []),
            accessor.getter.sourceSelectedType,
            accessor.getter.sourceElementType,
            ...(accessor.setter === undefined
              ? []
              : [
                  accessor.setter.sourceSelectedType,
                  accessor.setter.sourceElementType,
                ]),
          ]),
          accessor: {
            getter: true,
            setter: accessor.setter !== undefined,
          },
        };
      }
    }
    const shape = rememberTargetShape({
      targetType: createStructuralObjectShapeTarget(
        members,
        implemented,
        host,
      ),
      members,
      ...(implemented === undefined ? {} : { implements: implemented }),
    });
    return { kind: "resolved", shape };
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
      targetType: createStructuralObjectShapeTarget(
        members,
        [targetType],
        host,
      ),
      members,
      implements: [targetType],
    } satisfies CsharpObjectShapeFact;
    return { kind: "resolved", shape };
  }

  function remember(
    node: Node,
    shape: CsharpObjectShapeFact,
  ): CsharpObjectShapeFact {
    rememberTargetShape(shape);
    nodeShapes.set(node, shape);
    return shape;
  }

  function rememberTargetShape(
    shape: CsharpObjectShapeFact,
  ): CsharpObjectShapeFact {
    const key = targetTypeRefKey(shape.targetType);
    const existing = targetShapes.get(key);
    if (existing !== undefined && !csharpObjectShapesEqual(existing, shape)) {
      throw new Error(
        `C# object-shape target '${key}' resolved to contradictory structural contracts.`,
      );
    }
    const canonical = existing === undefined
      ? shape
      : mergeCsharpObjectShapeSubjects(existing, shape);
    targetShapes.set(key, canonical);
    return canonical;
  }

  function resolveStructShape(
    node: Node,
    queries: SourceFileSemantics,
  ): CsharpObjectShapeFact | undefined {
    for (const subject of sourceSubjects(node, queries)) {
      const fact = readCsharpSourceStruct(host.sourceFacts, subject);
      if (fact === undefined) {
        continue;
      }
      const targetType = host.types.resolveNode(node, queries.sourceFile);
      if (targetType === undefined) {
        return undefined;
      }
      const members = fact.fields.map((field) => {
        const type = host.types.resolveNode(field.sourceType, queries.sourceFile);
        const sourceType = queries.getTypeFromTypeNode(field.sourceType);
        return type === undefined
          ? undefined
          : {
              sourceName: field.sourceName,
              sourceSubjects: [field.sourceType],
              ...(sourceType === undefined
                ? {}
                : { sourceTypes: [sourceType] }),
              targetName: objectShapeMemberTargetName(field.sourceName),
              memberKind: "property" as const,
              type,
              ...(field.readonly ? { readonly: true } : {}),
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
    node: Node | undefined,
    queries: SourceFileSemantics,
    selectedTarget?: TargetTypeRef,
    authoredTypeRoot?: Node,
  ): CsharpObjectShapeFact | undefined {
    if (
      type === undefined ||
      activeTypes.has(type) ||
      requiresUnresolvedStructuralProjection(type, node, queries, host) ||
      typeIsExcludedFromObjectShape(type, queries) ||
      !typeHasProjectOwnedShapeDeclaration(type, node, queries, host)
    ) {
      return undefined;
    }
    activeTypes.add(type);
    try {
      const targetType = selectedTarget ??
        host.types.resolveType(type, queries.sourceFile);
      const contextualProjectType = targetType !== undefined &&
          isProjectSourceTargetType(targetType)
        ? targetType
        : undefined;
      const objectLiteral = node !== undefined &&
        host.ast.is.IsObjectLiteralExpression(node);
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
      const members = deriveMembers(type, queries, authoredTypeRoot);
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
        targetType: createStructuralObjectShapeTarget(members, implemented, host),
        members,
        ...(implemented === undefined ? {} : { implements: implemented }),
      };
    } finally {
      activeTypes.delete(type);
    }
  }

  function deriveMembers(
    ownerType: Type,
    queries: SourceFileSemantics,
    authoredTypeRoot?: Node,
  ): readonly CsharpObjectShapeMemberFact[] | undefined {
    const members = queries.getPropertyInfos(ownerType).map((property) =>
      deriveMember(property, queries, authoredTypeRoot)
    );
    return members.some((member) => member === undefined)
      ? undefined
      : members as readonly CsharpObjectShapeMemberFact[];
  }

  function deriveMember(
    property: TypePropertyInfo,
    queries: SourceFileSemantics,
    authoredTypeRoot?: Node,
  ): CsharpObjectShapeMemberFact | undefined {
    const sourceName = property.name;
    if (sourceName.length === 0) {
      return undefined;
    }
    const declarations = [...new Set([
      ...queries.getSymbolDeclarations(property.symbol),
      ...property.rootSymbols.flatMap((symbol) =>
        queries.getSymbolDeclarations(symbol)
      ),
    ])]
      .filter((declaration): declaration is Node => declaration !== undefined);
    const sourceType = property.type;
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
      ? host.types.resolveType(sourceType, queries.sourceFile)
      : resolvePropertyType(
          property,
          sourceType,
          queries,
          authoredTypeRoot,
        );
    if (memberType === undefined) {
      return undefined;
    }
    const optional = property.optional || typeIncludesNullish(sourceType, queries);
    return {
      sourceName,
      sourceSubjects: declarations.length === 0
        ? [property.symbol]
        : [property.symbol, ...declarations],
      ...(declarations.length === 0
        ? {}
        : { sourceDeclarations: Object.freeze([...declarations]) }),
      sourceTypes: [sourceType],
      targetName: objectShapeMemberTargetName(sourceName),
      memberKind: method ? "method" : "property",
      type: optional ? csharpNullableTargetType(memberType) : memberType,
      ...(optional ? { optional: true } : {}),
      ...(property.readonly ? { readonly: true } : {}),
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
      return host.types.resolveType(sourceType, queries.sourceFile);
    }
    const authoredTypes = authoredTypeNodes.map((typeNode) =>
      host.types.resolveSelectedType(
        typeNode,
        sourceType,
        queries.sourceFile,
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

  return Object.freeze({
    resolveNode,
    resolveTarget,
    resolveType,
    resolveObjectLiteralTargetShape,
    resolveProjectConstructibleSelectedType,
  });
}
