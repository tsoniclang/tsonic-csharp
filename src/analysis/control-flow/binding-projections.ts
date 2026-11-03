import type { CsharpBindingProjection } from "../../target-model/records/storage/binding-projection-policy.js";

import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics, SourceProgramNavigation } from "@tsonic/target-api/source";
import { csharpNullableTargetType } from "../../target-model/types/carriers/nullable.js";
import { csharpBindingDefaultCarrier } from "../../policy/types/storage/binding-normalization.js";
import { getCsharpCollectionElementTargetType } from "../../target-model/types/carriers/collections.js";
import { resolveCsharpObjectShapeMemberBySourceContract } from "../../target-model/types/object-shape-members.js";

import type { CsharpRecursiveObjectShapePolicy } from "../objects/shapes/model.js";
import type { CsharpRecursiveTypeResolver, CsharpTypeResolutionState, CsharpTypePolicyBaseHost } from "../source-evidence/types/resolution/model.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpArrayBindingProjectionTarget, resolveCsharpArrayBindingCarrier } from "../../policy/types/collections/binding-array-carrier.js";
import { nextState } from "../source-evidence/types/resolution/state.js";
import { resolveCsharpBindingSourceType } from "./binding-source-types.js";
import type { CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";
import { resolveCsharpNativeBindingProperty } from "./native-binding-properties.js";

export interface CsharpBindingProjectionPolicyHost extends Pick<CsharpTypePolicyBaseHost, "providers" | "sourceFacts" | "semanticsFor" | "typeDefinitions"> {
  readonly ast: AstReader;
  readonly navigation: SourceProgramNavigation;
  readonly typeResolver: CsharpRecursiveTypeResolver;
  readonly objectShapes: CsharpRecursiveObjectShapePolicy;
  scopedTargetType(node: Node): TargetTypeRef | undefined;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  projectTypes(): CsharpProjectTypePolicy;
}

export interface CsharpBindingProjectionPolicy {
  resolveProjection(node: Node | undefined, sourceFile: SourceFile | undefined, state: CsharpTypeResolutionState): CsharpBindingProjection | undefined;
  resolveNode(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined;
}

export function createCsharpBindingProjectionPolicy(
  host: CsharpBindingProjectionPolicyHost,
): CsharpBindingProjectionPolicy {
  const activeBindings = new WeakSet<Node>();

  function resolveProjection(
    node: Node | undefined,
    _sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): CsharpBindingProjection | undefined {
    const binding = selectedBindingElement(node, host);
    if (binding === undefined || activeBindings.has(binding)) {
      return undefined;
    }
    const pattern = host.ast.parent(binding);
    if (pattern === undefined) {
      return undefined;
    }
    const declarationFile = host.ast.getSourceFile(binding);
    if (declarationFile === undefined) return undefined;
    activeBindings.add(binding);
    try {
      const ownerType = resolveBindingOwnerType(
        host.ast.parent(pattern),
        pattern,
        declarationFile,
        state,
        host,
        (node, file, state) => resolveProjection(node, file, state)?.bindingCarrier,
      );
      const projection = host.ast.is.IsObjectBindingPattern(pattern)
        ? resolveObjectBindingProjection(binding, ownerType, state, host)
        : host.ast.is.IsArrayBindingPattern(pattern)
        ? valueProjection(resolveArrayBindingProjection(binding, pattern, ownerType, host))
        : undefined;
      if (projection === undefined) {
        return undefined;
      }
      const declaration = host.ast.as.AsBindingElement(binding);
      if (declaration?.Initializer === undefined) return projection;
      const storageCarrier = csharpNullableTargetType(projection.storageCarrier);
      const defaultValue = host.typeResolver.resolveNode(declaration.Initializer, declarationFile, nextState(state));
      if (defaultValue === undefined) return undefined;
      const bindingCarrier = csharpBindingDefaultCarrier(projection.bindingCarrier, defaultValue);
      return Object.freeze({ ...projection, storageCarrier, bindingCarrier });
    } finally {
      activeBindings.delete(binding);
    }
  }

  return Object.freeze({ resolveProjection,
    resolveNode: (node: Node | undefined, sourceFile: SourceFile | undefined, state: CsharpTypeResolutionState) =>
      resolveProjection(node, sourceFile, state)?.bindingCarrier });
}

function selectedBindingElement(
  node: Node | undefined,
  host: Pick<CsharpBindingProjectionPolicyHost, "ast" | "navigation">,
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
  const declaration = host.navigation.referenceFor(node)?.declaration;
  return declaration !== undefined && host.ast.is.IsBindingElement(declaration)
    ? declaration
    : undefined;
}

function resolveBindingOwnerType(
  owner: Node | undefined,
  pattern: Node,
  sourceFile: SourceFile | undefined,
  state: CsharpTypeResolutionState,
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
      const selected = sourceFile === undefined ? undefined : host.semantics(sourceFile).operations.iteration(statement);
      if (iteration?.Initializer !== declarations || iteration.Expression === undefined || selected === undefined ||
        selected.iterationKind !== "for-of" && selected.iterationKind !== "for-await-of") return undefined;
      return getCsharpCollectionElementTargetType(host.typeResolver.resolveNode(
        iteration.Expression, sourceFile, nextState(state)));
    }
    return host.typeResolver.resolveNode(
      declaration?.Type ?? declaration?.Initializer,
      sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsParameterDeclaration(owner)) {
    return host.typeResolver.resolveNode(
      owner,
      sourceFile,
      nextState(state),
    );
  }
  if (
    host.ast.is.IsBindingElement(owner) &&
    host.ast.as.AsBindingElement(owner)?.name === pattern
  ) {
    return resolveProjection(owner, sourceFile, nextState(state));
  }
  return undefined;
}

function resolveObjectBindingProjection(
  binding: Node,
  ownerType: TargetTypeRef | undefined,
  state: CsharpTypeResolutionState,
  host: CsharpBindingProjectionPolicyHost,
): CsharpBindingProjection | undefined {
  const declaration = host.ast.as.AsBindingElement(binding);
  if (declaration?.DotDotDotToken !== undefined) {
    const selected = host.scopedTargetType(binding);
    const sourceFile = host.ast.getSourceFile(binding);
    const shape = selected !== undefined ? host.objectShapes.resolveTarget(selected)
      : sourceFile === undefined ? undefined : host.objectShapes.resolveTypeWithState(
      host.semantics(sourceFile).declarations.declaredValueType(binding), sourceFile, undefined, nextState(state),
    );
    return valueProjection(shape === undefined ? undefined : host.objectShapes.resolveCopyShape(
      shape, host.objectShapes.resolveTarget(ownerType),
    )?.targetType);
  }
  const property = declaration?.PropertyName ?? declaration?.name;
  if (property === undefined) return undefined;
  let sourceName: string;
  if (host.ast.is.IsComputedPropertyName(property) || host.ast.is.IsNumericLiteral(property)) {
    const sourceFile = host.ast.getSourceFile(property);
    const selectedName = sourceFile === undefined ? undefined : host.semantics(sourceFile).propertyNames.get(property);
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
  const sourceFile = host.ast.getSourceFile(binding);
  const pattern = host.ast.parent(binding);
  const owner = pattern === undefined ? undefined : host.ast.parent(pattern);
  if (receiverCarrier === undefined || sourceFile === undefined || pattern === undefined || owner === undefined) return { kind: "unresolved" };
  const queries = host.semantics(sourceFile);
  const checked = resolveCsharpBindingSourceType(pattern, host.ast, host.semanticsFor);
  const selected = resolveCsharpNativeBindingProperty(checked, sourceName, receiverCarrier, queries,
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
