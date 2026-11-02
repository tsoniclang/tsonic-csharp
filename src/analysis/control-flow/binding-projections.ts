import type { CsharpBindingProjection } from "../../target-model/records/storage/binding-projection-policy.js";

import type { AstReader, Node, SourceFile, Type } from "@tsonic/tsts";
import { sourceArrayElementType, type SourceFileSemantics, type SourceProgramNavigation } from "@tsonic/target-api/source";
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
import { csharpSourceProfileDeclarationIdentity } from "../../policy/identities/selected-source.js";
import { selectCsharpErrorNativeProperty } from "../../policy/operations/source-profiles/error-source-profile.js";
import { selectCsharpBindingPatternProjection } from "../../policy/types/objects/binding-projection.js";
import type { CsharpNativeBindingProperty } from "../../target-model/records/objects/value-projections.js";
import type { CsharpTypeDefinitions } from "../../target-model/types/source-union-definitions.js";

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
    if (node !== undefined && (host.ast.is.IsPropertyAssignment(node) || host.ast.is.IsShorthandPropertyAssignment(node))) {
      const pattern = host.ast.parent(node);
      const propertyName = host.ast.name(node);
      const sourceFile = host.ast.getSourceFile(node);
      if (pattern === undefined || propertyName === undefined || sourceFile === undefined || activeBindings.has(node)) return undefined;
      activeBindings.add(node);
      try {
        const selected = assignmentPatternSource(pattern, state);
        const sourceName = checkedPropertyName(propertyName, sourceFile);
        if (selected === undefined || sourceName === undefined) return undefined;
        const members = host.semantics(sourceFile).types.propertyInfos(selected.checked).filter(member => member.name === sourceName);
        const member = members.length === 1 ? members[0] : undefined;
        const property = member === undefined ? undefined : resolveCsharpNativePropertyRead([
          ...host.semantics(sourceFile).declarations.symbolDeclarations(member.symbol),
          ...member.rootSymbols.flatMap(symbol => host.semantics(sourceFile).declarations.symbolDeclarations(symbol)),
        ], selected.carrier, { ...host, projectTypes: host.projectTypes() });
        return property === undefined ? undefined : Object.freeze({ kind: "native-member", node,
          receiverCarrier: selected.carrier, property, storageCarrier: property.member.returnType, bindingCarrier: property.member.returnType });
      } finally {
        activeBindings.delete(node);
      }
    }
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

  function checkedPropertyName(node: Node, sourceFile: SourceFile): string | undefined {
    if (host.ast.is.IsComputedPropertyName(node) || host.ast.is.IsNumericLiteral(node)) {
      const selected = host.semantics(sourceFile).propertyNames.get(node);
      return selected?.kind === "resolved" ? selected.name : undefined;
    }
    return host.ast.is.IsIdentifier(node) || host.ast.is.IsStringLiteral(node) ? host.ast.text(node) : undefined;
  }

  function assignmentPatternSource(
    pattern: Node,
    state: CsharpTypeResolutionState,
  ): { readonly checked: Type; readonly carrier: TargetTypeRef } | undefined {
    if (!host.ast.is.IsObjectLiteralExpression(pattern) && !host.ast.is.IsArrayLiteralExpression(pattern)) return undefined;
    const sourceFile = host.ast.getSourceFile(pattern);
    if (sourceFile === undefined) return undefined;
    const queries = host.semantics(sourceFile);
    let parent = host.ast.parent(pattern);
    if (parent === undefined) return undefined;
    if (host.ast.is.IsBinaryExpression(parent) && host.ast.operatorKindName(parent) === "KindEqualsToken") {
      const expression = host.ast.as.AsBinaryExpression(parent);
      const owner = host.ast.parent(parent);
      if (expression?.Left !== pattern || expression.Right === undefined) return undefined;
      if (owner === undefined || !host.ast.is.IsPropertyAssignment(owner) && !host.ast.is.IsArrayLiteralExpression(owner)) {
        const checked = queries.types.expressionType(expression.Right);
        const carrier = host.typeResolver.resolveNode(expression.Right, sourceFile, nextState(state));
        return checked === undefined || carrier === undefined ? undefined : { checked, carrier };
      }
      parent = owner;
    }
    if (host.ast.is.IsPropertyAssignment(parent)) {
      const outer = host.ast.parent(parent);
      const propertyName = host.ast.name(parent);
      const selected = outer === undefined ? undefined : assignmentPatternSource(outer, nextState(state));
      const sourceName = propertyName === undefined ? undefined : checkedPropertyName(propertyName, sourceFile);
      if (selected === undefined || sourceName === undefined) return undefined;
      const properties = queries.types.propertyInfos(selected.checked).filter(property => property.name === sourceName);
      const property = properties.length === 1 ? properties[0] : undefined;
      if (property === undefined) return undefined;
      const native = resolveCsharpNativePropertyRead([
        ...queries.declarations.symbolDeclarations(property.symbol),
        ...property.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol)),
      ], selected.carrier, { ...host, projectTypes: host.projectTypes() });
      const shape = host.objectShapes.resolveTarget(selected.carrier);
      const member = shape === undefined ? undefined : resolveCsharpObjectShapeMemberBySourceContract(shape, sourceName, "checked-object-binding-property");
      let carrier = native === undefined ? member?.kind === "resolved" ? member.member.type : undefined : native.member.returnType;
      const initializer = host.ast.as.AsPropertyAssignment(parent)?.Initializer;
      if (initializer !== undefined && host.ast.is.IsBinaryExpression(initializer) && host.ast.operatorKindName(initializer) === "KindEqualsToken") {
        const value = host.ast.as.AsBinaryExpression(initializer)?.Right;
        const defaultCarrier = value === undefined ? undefined : host.typeResolver.resolveNode(value, sourceFile, nextState(state));
        if (carrier === undefined || defaultCarrier === undefined) return undefined;
        carrier = csharpBindingDefaultCarrier(carrier, defaultCarrier);
      }
      return carrier === undefined ? undefined : { checked: property.type, carrier };
    }
    if (host.ast.is.IsArrayLiteralExpression(parent)) {
      const selected = assignmentPatternSource(parent, nextState(state));
      const element = host.ast.parent(pattern);
      const index = host.ast.elements(parent).findIndex(candidate => candidate === pattern || candidate === element);
      if (selected === undefined || index < 0) return undefined;
      const properties = queries.types.propertyInfos(selected.checked).filter(property => property.name === String(index));
      const checked = properties.length === 1 ? properties[0]!.type : sourceArrayElementType(selected.checked, queries);
      let carrier = csharpArrayBindingProjectionTarget(resolveCsharpArrayBindingCarrier(selected.carrier), index, false);
      if (element !== undefined && host.ast.is.IsBinaryExpression(element) && host.ast.operatorKindName(element) === "KindEqualsToken") {
        const initializer = host.ast.as.AsBinaryExpression(element)?.Right;
        const defaultCarrier = initializer === undefined ? undefined : host.typeResolver.resolveNode(initializer, sourceFile, nextState(state));
        if (carrier === undefined || defaultCarrier === undefined) return undefined;
        carrier = csharpBindingDefaultCarrier(carrier, defaultCarrier);
      }
      return checked === undefined || carrier === undefined ? undefined : { checked, carrier };
    }
    return undefined;
  }
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
  const native = resolveNativeErrorBindingProjection(binding, sourceName, ownerType, host);
  if (native !== undefined) return native;
  const shape = host.objectShapes.resolveTarget(ownerType);
  if (shape === undefined) return undefined;
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
    const signature = declaration === undefined ? undefined : queries.types.declarationSignatureInfo(declaration);
    if (signature === undefined) return undefined;
    const slots = signature.parameters.filter(slot => slot.declaration === owner);
    checked = slots.length === 1 ? slots[0]?.type : undefined;
  } else if (host.ast.is.IsVariableDeclaration(owner)) {
    const declaration = host.ast.as.AsVariableDeclaration(owner);
    checked = declaration?.Type !== undefined ? queries.types.authoredType(declaration.Type)
      : declaration?.Initializer === undefined ? undefined : queries.types.expressionType(declaration.Initializer);
  } else if (host.ast.is.IsBindingElement(owner)) {
    checked = queries.declarations.declaredValueType(owner);
  }
  if (checked === undefined) return undefined;
  const members = queries.types.propertyInfos(checked).filter(member => member.name === sourceName);
  const member = members.length === 1 ? members[0] : undefined;
  const declarations = member === undefined ? [] : [...new Set([...queries.declarations.symbolDeclarations(member.symbol),
    ...member.rootSymbols.flatMap(symbol => queries.declarations.symbolDeclarations(symbol))])];
  const property = resolveCsharpNativePropertyRead(declarations, receiverCarrier, { ...host, projectTypes: host.projectTypes() });
  if (property === undefined) return undefined;
  const carrier = property.member.returnType;
  return Object.freeze({ kind: "native-member", node: binding, receiverCarrier, property,
    storageCarrier: carrier, bindingCarrier: carrier });
}

export function resolveCsharpNativePropertyRead(
  declarations: readonly Node[],
  receiverCarrier: TargetTypeRef,
  host: Pick<CsharpBindingProjectionPolicyHost, "ast" | "semantics" | "hasSemantics" | "sourceFacts" | "providers"> & {
    readonly projectTypes: CsharpProjectTypePolicy;
    readonly typeDefinitions?: CsharpTypeDefinitions;
  },
): CsharpNativeBindingProperty | undefined {
  const identities = [...new Set(declarations)].flatMap(declaration => {
    const file = host.ast.getSourceFile(declaration);
    if (file === undefined || !host.hasSemantics(file)) return [];
    const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.semantics(file), host.sourceFacts, declaration);
    return identity?.kind === "member" ? [identity] : [];
  });
  const identity = identities.length === 1 ? identities[0] : undefined;
  const selected = identity === undefined ? undefined : selectCsharpErrorNativeProperty({ providers: host.providers,
    projectTypes: host.projectTypes, typeDefinitions: host.typeDefinitions }, identity, receiverCarrier);
  if (identity === undefined || selected?.kind !== "resolved" ||
      selected.invocation.kind !== "member" && selected.invocation.kind !== "receiver-call") return undefined;
  const admitted = selectCsharpBindingPatternProjection({ kind: "native-member", property: {
    declaration: identity.declaration, member: selected.targetMember, receiver: selected.receiver, invocation: selected.invocation,
  } });
  if (admitted.kind !== "element" || admitted.element.kind !== "native-member") return undefined;
  return admitted.element.property;
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
