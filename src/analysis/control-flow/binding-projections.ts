import type { CsharpBindingProjection } from "../../target-model/records/storage/binding-projection-policy.js";
import { sourceProjectDeclaration } from "../program/source-facts.js";

import type { AstReader, Node, ReadonlySourceFactResolver } from "@tsonic/tsts";
import type { SourceProgramFacts } from "@tsonic/target-api/source";
import type { CsharpTypeQueries } from "../../policy/model/type-resolution.js";
import type { CsharpRepresentation } from "../../representation/index.js";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";
import { csharpNullableTargetType } from "../../target-model/types/carriers/nullable.js";
import { csharpBindingDefaultCarrier } from "../../policy/types/storage/binding-normalization.js";
import { getCsharpCollectionElementTargetType } from "../../target-model/types/carriers/collections.js";
import { resolveCsharpObjectShapeMemberBySourceContract } from "../../target-model/types/object-shape-members.js";

import type { CsharpRecursiveObjectShapePolicy } from "../objects/shapes/model.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpArrayBindingProjectionTarget, resolveCsharpArrayBindingCarrier } from "../../policy/types/collections/binding-array-carrier.js";
import { resolveCsharpBindingSourceType } from "./binding-source-types.js";
import type { CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";
import { resolveCsharpPublishedNativePropertyRead } from "../objects/native-property-reads.js";

export interface CsharpBindingProjectionPolicyHost {
  readonly ast: AstReader;
  readonly facts: SourceProgramFacts;
  readonly providers: CsharpProviderRelationResolver;
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly typeDefinitions?: CsharpTypeDefinitions;
  readonly types: Pick<CsharpTypeQueries, "value">;
  readonly objectShapes: CsharpRecursiveObjectShapePolicy;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
  projectTypes(): CsharpProjectTypePolicy;
}

/** Native projections of destructuring bindings; Source types come from published facts (values.type). */
export interface CsharpBindingProjectionPolicy {
  resolveProjection(node: Node | undefined): CsharpBindingProjection | undefined;
  resolveNode(node: Node | undefined): TargetTypeRef | undefined;
}

/** A represented value, or undefined when .NET refuses it (the refusal is reported where the value is emitted). */
function representedValue(host: Pick<CsharpBindingProjectionPolicyHost, "types">, node: Node | undefined): TargetTypeRef | undefined {
  if (node === undefined) return undefined;
  const represented: CsharpRepresentation = host.types.value(node);
  return represented.kind === "csharp-refused" ? undefined : represented;
}

export function createCsharpBindingProjectionPolicy(
  host: CsharpBindingProjectionPolicyHost,
): CsharpBindingProjectionPolicy {
  const activeBindings = new WeakSet<Node>();

  function resolveProjection(node: Node | undefined): CsharpBindingProjection | undefined {
    const binding = selectedBindingElement(node, host);
    if (binding === undefined || activeBindings.has(binding)) {
      return undefined;
    }
    const pattern = host.ast.parent(binding);
    if (pattern === undefined) {
      return undefined;
    }
    activeBindings.add(binding);
    try {
      const ownerType = resolveBindingOwnerType(host.ast.parent(pattern), pattern, host,
        node => resolveProjection(node)?.bindingCarrier);
      const projection = host.ast.is.IsObjectBindingPattern(pattern)
        ? resolveObjectBindingProjection(binding, ownerType, host)
        : host.ast.is.IsArrayBindingPattern(pattern)
        ? valueProjection(resolveArrayBindingProjection(binding, pattern, ownerType, host))
        : undefined;
      if (projection === undefined) {
        return undefined;
      }
      const declaration = host.ast.as.AsBindingElement(binding);
      if (declaration?.Initializer === undefined) return projection;
      const storageCarrier = csharpNullableTargetType(projection.storageCarrier);
      const defaultValue = representedValue(host, declaration.Initializer);
      if (defaultValue === undefined) return undefined;
      const bindingCarrier = csharpBindingDefaultCarrier(projection.bindingCarrier, defaultValue);
      return Object.freeze({ ...projection, storageCarrier, bindingCarrier });
    } finally {
      activeBindings.delete(binding);
    }
  }

  return Object.freeze({ resolveProjection, resolveNode: (node: Node | undefined) => resolveProjection(node)?.bindingCarrier });
}

function selectedBindingElement(
  node: Node | undefined,
  host: Pick<CsharpBindingProjectionPolicyHost, "ast" | "facts">,
): Node | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (host.ast.is.IsBindingElement(node)) {
    return node;
  }
  const parent = host.ast.parent(node);
  if (parent !== undefined && host.ast.is.IsBindingElement(parent)) {
    return parent;
  }
  const declaration = sourceProjectDeclaration(host.facts, node);
  return declaration !== undefined && host.ast.is.IsBindingElement(declaration)
    ? declaration
    : undefined;
}

function resolveBindingOwnerType(
  owner: Node | undefined,
  pattern: Node,
  host: CsharpBindingProjectionPolicyHost,
  resolveProjection: CsharpBindingProjectionPolicy["resolveNode"],
): TargetTypeRef | undefined {
  if (owner === undefined) {
    return undefined;
  }
  if (host.ast.is.IsVariableDeclaration(owner)) {
    const declaration = host.ast.as.AsVariableDeclaration(owner);
    const declarations = host.ast.parent(owner);
    const statement = declarations === undefined ? undefined : host.ast.parent(declarations);
    if (declaration?.Type === undefined && declaration?.Initializer === undefined &&
      declarations !== undefined && host.ast.is.IsVariableDeclarationList(declarations) &&
      statement !== undefined && host.ast.is.IsForOfStatement(statement)) {
      const iteration = host.ast.as.AsForInOrOfStatement(statement);
      const selected = host.facts.selections.iteration(statement);
      if (iteration?.Initializer !== declarations || iteration.Expression === undefined || selected === undefined ||
        "code" in selected) return undefined;
      return getCsharpCollectionElementTargetType(representedValue(host, iteration.Expression));
    }
    return representedValue(host, owner);
  }
  if (host.ast.is.IsParameterDeclaration(owner)) {
    return representedValue(host, owner);
  }
  if (
    host.ast.is.IsBindingElement(owner) &&
    host.ast.as.AsBindingElement(owner)?.name === pattern
  ) {
    return resolveProjection(owner);
  }
  return undefined;
}

function resolveObjectBindingProjection(
  binding: Node,
  ownerType: TargetTypeRef | undefined,
  host: CsharpBindingProjectionPolicyHost,
): CsharpBindingProjection | undefined {
  const declaration = host.ast.as.AsBindingElement(binding);
  if (declaration?.DotDotDotToken !== undefined) {
    const selected = host.scopedTargetType(binding);
    const shape = selected !== undefined ? host.objectShapes.resolveTarget(selected) : host.objectShapes.resolveNode(binding);
    return valueProjection(shape === undefined ? undefined : host.objectShapes.resolveCopyShape(
      shape, host.objectShapes.resolveTarget(ownerType),
    )?.targetType);
  }
  const property = declaration?.PropertyName ?? declaration?.name;
  if (property === undefined) return undefined;
  let sourceName: string;
  if (host.ast.is.IsComputedPropertyName(property) || host.ast.is.IsNumericLiteral(property)) {
    const selectedName = host.facts.analyses.propertyName(property);
    if (selectedName?.kind !== "resolved") return undefined;
    sourceName = selectedName.name;
  } else if (host.ast.is.IsIdentifier(property) || host.ast.is.IsStringLiteral(property)) {
    sourceName = host.ast.text(property);
  } else return undefined;
  const native = resolveNativeBindingProjection(binding, sourceName, ownerType, host);
  if (native.kind !== "not-native") return native.kind === "resolved" ? native.projection : undefined;
  const shape = host.objectShapes.resolveTarget(ownerType);
  if (shape === undefined) {
    return undefined;
  }
  const selected = resolveCsharpObjectShapeMemberBySourceContract(
    shape,
    sourceName,
    "checked-object-binding-property",
  );
  return valueProjection(selected.kind === "resolved" ? selected.member.type : undefined);
}

function valueProjection(carrier: TargetTypeRef | undefined): CsharpBindingProjection | undefined {
  return carrier === undefined ? undefined : Object.freeze({ storageCarrier: carrier, bindingCarrier: carrier });
}

function resolveNativeBindingProjection(
  binding: Node,
  sourceName: string,
  receiverCarrier: TargetTypeRef | undefined,
  host: CsharpBindingProjectionPolicyHost,
): { readonly kind: "not-native" | "unresolved" } | { readonly kind: "resolved"; readonly projection: CsharpBindingProjection } {
  const pattern = host.ast.parent(binding);
  const owner = pattern === undefined ? undefined : host.ast.parent(pattern);
  if (receiverCarrier === undefined || pattern === undefined || owner === undefined) return { kind: "unresolved" };
  const descriptor = resolveCsharpBindingSourceType(pattern, host.ast, host.facts);
  const selected = resolveCsharpPublishedNativePropertyRead(descriptor, sourceName, receiverCarrier,
    { ...host, projectTypes: host.projectTypes() });
  if (selected.kind !== "resolved") return { kind: selected.kind };
  const carrier = selected.property.member.returnType;
  return { kind: "resolved", projection: Object.freeze({ storageCarrier: carrier, bindingCarrier: carrier,
    nativeRead: Object.freeze({ node: binding, receiverCarrier, property: selected.property }) }) };
}

function resolveArrayBindingProjection(
  binding: Node,
  pattern: Node,
  ownerType: TargetTypeRef | undefined,
  host: CsharpBindingProjectionPolicyHost,
): TargetTypeRef | undefined {
  const elementIndex = host.ast.elements(pattern).findIndex(
    (element) => element === binding,
  );
  if (elementIndex < 0) {
    return undefined;
  }
  const declaration = host.ast.as.AsBindingElement(binding);
  return csharpArrayBindingProjectionTarget(
    resolveCsharpArrayBindingCarrier(ownerType),
    elementIndex,
    declaration?.DotDotDotToken !== undefined,
  );
}
