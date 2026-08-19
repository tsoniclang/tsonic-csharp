import type {
  AstReader,
  Node,
  SourceFile,
} from "@tsonic/tsts";
import type { SourceProgramNavigation } from "@tsonic/target-api/source";
import {
  getCsharpNullableElementTargetType,
} from "../storage/nullable.js";
import {
  resolveCsharpObjectShapeMemberBySourceContract,
} from "./object-shape-members.js";
import type {
  CsharpObjectShapePolicy,
} from "./object-shape-policy.js";
import type {
  CsharpRecursiveTypeResolver,
  CsharpTypeResolutionState,
} from "../resolution/model.js";
import type {
  TargetTypeRef,
} from "../model/definitions.js";
import {
  csharpArrayBindingProjectionTarget,
  resolveCsharpArrayBindingCarrier,
} from "../storage/binding-array-carrier.js";
import { nextState } from "../resolution/state.js";

export interface CsharpBindingProjectionPolicyHost {
  readonly ast: AstReader;
  readonly navigation: SourceProgramNavigation;
  readonly typeResolver: CsharpRecursiveTypeResolver;
  readonly objectShapes: CsharpObjectShapePolicy;
}

export interface CsharpBindingProjectionPolicy {
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

  function resolveNode(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
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
      const ownerType = resolveBindingOwnerType(
        host.ast.parent(pattern),
        pattern,
        sourceFile ?? host.ast.getSourceFile(binding),
        state,
        host,
        resolveNode,
      );
      const projected = host.ast.is.IsObjectBindingPattern(pattern)
        ? resolveObjectBindingProjection(binding, ownerType, host)
        : host.ast.is.IsArrayBindingPattern(pattern)
        ? resolveArrayBindingProjection(binding, pattern, ownerType, host)
        : undefined;
      if (projected === undefined) {
        return undefined;
      }
      const declaration = host.ast.as.AsBindingElement(binding);
      return declaration?.Initializer === undefined
        ? projected
        : getCsharpNullableElementTargetType(projected) ?? projected;
    } finally {
      activeBindings.delete(binding);
    }
  }

  return Object.freeze({ resolveNode });
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
    return host.typeResolver.resolveNode(
      declaration?.Type ?? declaration?.Initializer,
      sourceFile,
      nextState(state),
    );
  }
  if (host.ast.is.IsParameterDeclaration(owner)) {
    return host.typeResolver.resolveNode(
      host.ast.as.AsParameterDeclaration(owner)?.Type,
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
  host: CsharpBindingProjectionPolicyHost,
): TargetTypeRef | undefined {
  const declaration = host.ast.as.AsBindingElement(binding);
  if (declaration?.DotDotDotToken !== undefined) {
    return undefined;
  }
  const property = declaration?.PropertyName ?? declaration?.name;
  if (
    property === undefined ||
    !(
      host.ast.is.IsIdentifier(property) ||
      host.ast.is.IsStringLiteral(property) ||
      host.ast.is.IsNumericLiteral(property)
    )
  ) {
    return undefined;
  }
  const shape = host.objectShapes.resolveTarget(ownerType);
  if (shape === undefined) {
    return undefined;
  }
  const selected = resolveCsharpObjectShapeMemberBySourceContract(
    shape,
    host.ast.text(property),
    "checked-object-binding-property",
  );
  return selected.kind === "resolved" ? selected.member.type : undefined;
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
