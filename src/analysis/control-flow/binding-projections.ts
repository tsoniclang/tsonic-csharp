import type { CsharpBindingProjection } from "../../target-model/records/storage/binding-projection-policy.js";

import type { AstReader, Node, SourceFile, Type } from "@tsonic/tsts";
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
import type { CsharpProjectTypePolicy } from "../../target-model/records/types/project-types.js";
import { classifyCsharpSourceProfileType } from "../../policy/identities/source-types.js";
import { csharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";
import { selectCsharpErrorNativeProperty } from "../../policy/operations/source-profiles/error-source-profile.js";
import { selectCsharpBindingPatternProjection } from "../../policy/types/objects/binding-projection.js";

export interface CsharpBindingProjectionPolicyHost extends Pick<CsharpTypePolicyBaseHost, "providers" | "typeDefinitions" | "sourceFacts" | "hasSemantics"> {
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
        ? bindingValueProjection(resolveArrayBindingProjection(binding, pattern, ownerType, host))
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
    return bindingValueProjection(shape === undefined ? undefined : host.objectShapes.resolveCopyShape(
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
  const shape = host.objectShapes.resolveTarget(ownerType);
  if (shape === undefined) {
    return resolveNativeErrorBindingProjection(binding, sourceName, ownerType, host);
  }
  const selected = resolveCsharpObjectShapeMemberBySourceContract(
    shape,
    sourceName,
    "checked-object-binding-property",
  );
  return bindingValueProjection(selected.kind === "resolved" ? selected.member.type : undefined);
}

function bindingValueProjection(carrier: TargetTypeRef | undefined): CsharpBindingProjection | undefined {
  return carrier === undefined ? undefined : Object.freeze({ kind: "value", storageCarrier: carrier, bindingCarrier: carrier });
}

function resolveNativeErrorBindingProjection(
  binding: Node,
  sourceName: string,
  receiverCarrier: TargetTypeRef | undefined,
  host: CsharpBindingProjectionPolicyHost,
): CsharpBindingProjection | undefined {
  const sourceFile = host.ast.getSourceFile(binding);
  const pattern = host.ast.parent(binding);
  const owner = pattern === undefined ? undefined : host.ast.parent(pattern);
  if (receiverCarrier === undefined || sourceFile === undefined || !host.hasSemantics(sourceFile) || owner === undefined) return undefined;
  const queries = host.semantics(sourceFile);
  let checked: Type | undefined;
  if (host.ast.is.IsParameterDeclaration(owner)) {
    const declaration = host.ast.parent(owner);
    const slots = declaration === undefined ? [] : queries.types.declarationSignatureInfo(declaration)?.parameters
      .filter(slot => slot.declaration === owner) ?? [];
    checked = slots.length === 1 ? slots[0]?.type : undefined;
  } else if (host.ast.is.IsVariableDeclaration(owner)) {
    const declaration = host.ast.as.AsVariableDeclaration(owner);
    checked = declaration?.Type !== undefined ? queries.types.authoredType(declaration.Type)
      : declaration?.Initializer === undefined ? undefined : queries.types.expressionType(declaration.Initializer);
  } else if (host.ast.is.IsBindingElement(owner)) {
    checked = queries.declarations.declaredValueType(owner);
  }
  if (checked === undefined || classifyCsharpSourceProfileType(checked, queries, host.ast)?.kind !== "error") return undefined;
  const members = queries.types.propertyInfos(checked).filter(member => member.name === sourceName);
  const member = members.length === 1 ? members[0] : undefined;
  const declarations = member === undefined ? [] : [...new Set([...queries.declarations.symbolDeclarations(member.symbol),
    ...member.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol))])];
  const identities = declarations.flatMap(declaration => {
    const file = host.ast.getSourceFile(declaration);
    if (file === undefined || !host.hasSemantics(file)) return [];
    const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.semantics(file), host.sourceFacts, declaration);
    return identity?.kind === "member" && identity.declaringName === "Error" && identity.name === sourceName ? [identity] : [];
  });
  const identity = identities.length === 1 ? identities[0] : undefined;
  const selected = identity === undefined ? undefined : selectCsharpErrorNativeProperty({ providers: host.providers,
    projectTypes: host.projectTypes(), typeDefinitions: host.typeDefinitions }, identity, receiverCarrier);
  if (identity === undefined || selected?.kind !== "resolved" ||
      selected.invocation.kind !== "member" && selected.invocation.kind !== "receiver-call") return undefined;
  const admitted = selectCsharpBindingPatternProjection({ kind: "native-member", property: {
    declaration: identity.declaration, member: selected.targetMember, receiver: selected.receiver, invocation: selected.invocation,
  } });
  if (admitted.kind !== "element" || admitted.element.kind !== "native-member") return undefined;
  const carrier = admitted.element.property.member.returnType;
  return Object.freeze({ kind: "native-member", node: binding, receiverCarrier, property: admitted.element.property,
    storageCarrier: carrier, bindingCarrier: carrier });
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
