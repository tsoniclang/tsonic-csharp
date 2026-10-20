import type { CsharpSourceTypedLocationOperation } from "../../../source/extension/typed-locations.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpScopedTypePolicyResult, CsharpTypeResolutionState } from "./model.js";

import type { CsharpSourceTargetTypeBinding } from "../../../target-model/types/model.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers, csharpAbsenceTargetType, csharpRuntimeLocationPointee, csharpTsValueTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";

import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/carriers/delegates.js";
import { nextState } from "./state.js";
import { reconcileCsharpSelectedTargetType } from "../../../policy/types/selected-type-evidence.js";
import { retainCsharpUnionObjectShapes, selectCsharpAuthoredUnionRefinement } from "./source-union-refinement.js";
import { resolveCsharpUnionMemberCarrier } from "./source-evidence.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { Node_Expression, sourceAbsenceUse } from "@tsonic/target-api/source";
import { selectCsharpNativeFlowMembers } from "./native-flow-refinement.js";
import { csharpUnionLeaves } from "../../../target-model/types/union-relations.js";
import { resolveCsharpInstanceType } from "./instance-tests.js";

export function resolveNode(
  { resolveNodeWithState }: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile?: SourceFile,
): TargetTypeRef | undefined {
  return resolveNodeWithState(node, sourceFile, { depth: 0 });
}

export function resolveType(
  { resolveTypeWithState }: CsharpTypeResolutionScope,
  type: Type | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return resolveTypeWithState(type, sourceFile, { depth: 0 });
}

export function resolveStorage(
  { catchVariableStorageCarrier, host, resolveNode, sourceValueDeclaration }: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile?: SourceFile,
): TargetTypeRef | undefined {
  if (node === undefined) {
    return undefined;
  }
  const reference = host.navigation.referenceFor(node);
  const declaration = sourceValueDeclaration(node, reference?.declaration);
  if (declaration === undefined) {
    return resolveNode(node, sourceFile);
  }
  const catchCarrier = catchVariableStorageCarrier(declaration);
  if (catchCarrier !== undefined) {
    return catchCarrier;
  }
  if (host.ast.is.IsBindingElement(declaration)) {
    const file = host.ast.getSourceFile(declaration);
    return file === undefined ? undefined : host.bindingProjection(declaration, file)?.bindingCarrier;
  }
  return resolveNode(
    declaration,
    host.ast.getSourceFile(declaration) ?? sourceFile,
  );
}

export function resolveReadStorage(
  { activeNodes, host, resolveMemberAccessTargetType, resolveStorage }: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile?: SourceFile,
): TargetTypeRef | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (!host.ast.is.IsPropertyAccessExpression(node) && !host.ast.is.IsElementAccessExpression(node)) {
    return resolveStorage(node, sourceFile);
  }
  if (activeNodes.has(node)) {
    return undefined;
  }
  activeNodes.add(node);
  try {
    const queries = sourceFile === undefined
      ? host.semanticsFor(node)
      : host.semantics(sourceFile);
    return resolveMemberAccessTargetType(
      node,
      queries,
      { depth: 0 },
      "storage",
    );
  } finally {
    activeNodes.delete(node);
  }
}

export function catchVariableStorageCarrier(
  { host }: CsharpTypeResolutionScope,
  declaration: Node,
): TargetTypeRef | undefined {
  if (!host.ast.is.IsVariableDeclaration(declaration)) {
    return undefined;
  }
  const parent = host.ast.parent(declaration);
  if (
    parent === undefined ||
    !host.ast.is.IsCatchClause(parent) ||
    host.ast.as.AsCatchClause(parent)?.VariableDeclaration !== declaration
  ) {
    return undefined;
  }
  return csharpTsValueTargetType();
}

export function resolveValue(
  { resolveNode, resolveType }: CsharpTypeResolutionScope,
  node: Node | undefined,
  type: Type | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return resolveNode(node, sourceFile) ?? resolveType(type, sourceFile);
}

export function resolveSelectedValue(
  { resolveSelectedValueWithState }: CsharpTypeResolutionScope,
  node: Node,
  selectedType: Type,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return resolveSelectedValueWithState(
    node,
    selectedType,
    sourceFile,
    { depth: 0 },
  );
}

export function resolveSelectedValueWithState(
  scope: CsharpTypeResolutionScope,
  node: Node,
  selectedType: Type,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const { host, resolveNodeWithState, resolveMemberAccessTargetType, resolveSourceValueDeclaration, resolveTypeWithState, sourceValueDeclaration } = scope;
  const reference = host.navigation.referenceFor(node);
  const declaration = sourceValueDeclaration(node, reference?.declaration);
  const storage = host.sourceStorage.subjectFor(node);
  state = { ...state, sourceStorageSubject: storage.kind === "resolved" ? storage.subject : undefined };
  const scopedTarget = host.representations.scopedTargetType(
    declaration ?? node,
  ) ?? host.representations.scopedTargetType(node) ??
    (declaration !== undefined && host.ast.is.IsBindingElement(declaration)
      ? host.bindingProjection(declaration, sourceFile)?.bindingCarrier : undefined);
  const queries = host.semantics(sourceFile);
  const declaredType = declaration === undefined ? undefined : queries.declarations.declaredValueType(declaration);
  if (scopedTarget !== undefined && getCsharpNullableElementTargetType(scopedTarget) !== undefined &&
    sourceAbsenceUse(node, host) !== undefined) return scopedTarget;
  if (declaredType !== undefined && queries.types.isUnion(declaredType)) {
    const storage = scopedTarget ?? resolveNodeWithState(declaration, sourceFile, nextState(state));
    const guarded = storage === undefined ? undefined : selectCsharpNativeFlowMembers(host, node, storage,
      guard => {
        const semantics = host.semanticsFor(guard.sourceConstructor);
        return resolveCsharpInstanceType(semantics, guard.sourceConstructor,
          type => resolveTypeWithState(type, semantics.sourceFile, nextState(state)));
      });
    if (guarded !== undefined && guarded.length > 0) {
      const symbol = queries.declarations.typeSymbol(selectedType);
      if (symbol !== undefined && queries.declarations.symbolDeclarations(symbol).some(candidate =>
        host.navigation.isProjectDeclaration(candidate) && (host.ast.is.IsClassDeclaration(candidate) || host.ast.is.IsClassExpression(candidate)))) {
        const nominal = resolveTypeWithState(selectedType, sourceFile, nextState(state));
        if (host.projectTypeCatalog.definitionForTarget(nominal)?.kind === "class") return nominal;
      }
      if (storage !== undefined && queries.types.refinement(declaredType, selectedType).kind === "members") {
        const refinement = selectCsharpAuthoredUnionRefinement(
          storage, declaredType, selectedType, queries,
          type => resolveCsharpUnionMemberCarrier(scope, storage, type, queries, state),
          host.structuralTypes.resolveTarget, host.typeDefinitions,
        );
        if (refinement.kind === "resolved") {
          const present = getCsharpNullableElementTargetType(refinement.type) ?? refinement.type;
          const checkedMembers = csharpUnionLeaves(present, host.typeDefinitions)?.map(member => member.carrier) ?? [present];
          if (present !== refinement.type) checkedMembers.push(csharpAbsenceTargetType());
          const selected = guarded.filter(member => checkedMembers.some(checked => targetTypeRefEquals(member, checked)));
          return retainCsharpUnionObjectShapes(combineCsharpTargetUnionMembers(selected), host.structuralTypes.resolveTarget);
        }
      }
      return retainCsharpUnionObjectShapes(combineCsharpTargetUnionMembers(guarded), host.structuralTypes.resolveTarget);
    }
  }
  if (declaredType !== undefined && declaredType !== selectedType &&
    queries.types.apparentType(declaredType) === selectedType) {
    const storage = scopedTarget ?? resolveNodeWithState(declaration, sourceFile, nextState(state));
    if (storage?.kind === "type-parameter") return storage;
  }
  if (scopedTarget !== undefined) {
    if (declaredType !== undefined) {
      const payload = getCsharpNullableElementTargetType(scopedTarget);
      if (payload !== undefined && declaration !== undefined && host.ast.is.IsBindingElement(declaration) &&
        queries.types.refinement(declaredType, selectedType).kind === "exact") {
        let value = node;
        let parent = host.ast.parent(value);
        while (parent !== undefined && (host.ast.is.IsParenthesizedExpression(parent) || host.ast.is.IsSatisfiesExpression(parent)) &&
          Node_Expression(host.ast, parent) === value) {
          value = parent;
          parent = host.ast.parent(value);
        }
        const members = queries.types.isUnion(selectedType) ? queries.types.unionOrIntersectionTypes(selectedType) : [selectedType];
        if (!members.some(member => queries.types.isNullish(member)) && !host.ast.is.IsTypeOfExpression(parent)) return payload;
      }
      const refinement = selectCsharpAuthoredUnionRefinement(
        scopedTarget, declaredType, selectedType, queries,
        type => resolveCsharpUnionMemberCarrier(scope, scopedTarget, type, queries, state),
        host.structuralTypes.resolveTarget,
        host.typeDefinitions,
      );
      if (refinement.kind !== "not-applicable") {
        return refinement.kind === "resolved" ? refinement.type : undefined;
      }
    }
    if (declaredType !== undefined && queries.types.refinement(declaredType, selectedType).kind === "unrelated") {
      return reconcileCsharpSelectedTargetType(
        scopedTarget,
        resolveTypeWithState(selectedType, sourceFile, nextState(state)),
        queries.types.relationship(declaredType, selectedType),
      );
    }
    return scopedTarget;
  }
  const member = host.ast.is.IsPropertyAccessExpression(node) || host.ast.is.IsElementAccessExpression(node);
  if (!member && declaration !== undefined) {
    const declared = resolveSourceValueDeclaration(
      node,
      host.semantics(sourceFile),
      nextState(state),
      selectedType,
    );
    if (declared !== undefined) {
      return declared;
    }
    return undefined;
  }
  const resolved = member
    ? resolveMemberAccessTargetType(node, queries, nextState(state), "selected", selectedType)
    : resolveNodeWithState(node, sourceFile, nextState(state));
  const expressionType = queries.types.expressionType(node);
  if (resolved !== undefined && expressionType !== undefined) {
    const refinement = selectCsharpAuthoredUnionRefinement(
      resolved, expressionType, selectedType, queries,
      type => resolveCsharpUnionMemberCarrier(scope, resolved, type, queries, state),
      host.structuralTypes.resolveTarget, host.typeDefinitions,
    );
    if (refinement.kind !== "not-applicable") return refinement.kind === "resolved" ? refinement.type : undefined;
  }
  if (member) return resolved;
  return resolved ?? resolveTypeWithState(
    selectedType,
    sourceFile,
    nextState(state),
  );
}

export function resolveSelectedType(
  { host, resolveAuthoredAndSelectedSourceType }: CsharpTypeResolutionScope,
  authoredTypeNode: Node | undefined,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
): TargetTypeRef | undefined {
  const authoredSourceFile = host.ast.getSourceFile(authoredTypeNode) ??
    selectedSourceFile;
  return resolveAuthoredAndSelectedSourceType(
    authoredTypeNode,
    authoredSourceFile,
    selectedType,
    selectedSourceFile,
    { depth: 0 },
  );
}

export function resolveSelectedResult(
  { host, resolveSelectedDeclarationResult }: CsharpTypeResolutionScope,
  selectedDeclaration: Node | undefined,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
): TargetTypeRef | undefined {
  return resolveSelectedDeclarationResult(
    selectedDeclaration,
    selectedType,
    host.semantics(selectedSourceFile),
    { depth: 0 },
  );
}

export function resolveTypedLocationOperationPointee(
  { resolveTypedLocationOperationPointeeWithState }: CsharpTypeResolutionScope,
  operation: CsharpSourceTypedLocationOperation,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return resolveTypedLocationOperationPointeeWithState(
    operation,
    sourceFile,
    { depth: 0 },
  );
}

export function resolveTypedLocationOperationPointeeWithState(
  { resolveAuthoredAndSelectedSourceType, resolveReadStorage, resolveSelectedValueWithState }: CsharpTypeResolutionScope,
  operation: CsharpSourceTypedLocationOperation,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  if (operation.explicitPointeeTypeNode !== undefined) {
    return resolveAuthoredAndSelectedSourceType(
      operation.explicitPointeeTypeNode,
      sourceFile,
      operation.pointeeType,
      sourceFile,
      nextState(state),
    );
  }
  switch (operation.kind) {
    case "location-address":
      return resolveReadStorage(
        operation.storageExpression,
        sourceFile,
      );
    case "location-allocate":
      return resolveSelectedValueWithState(
        operation.initialExpression,
        operation.initialType,
        sourceFile,
        nextState(state),
      );
    case "location-load":
    case "location-store":
    case "location-hash":
      return csharpRuntimeLocationPointee(resolveSelectedValueWithState(
        operation.locationExpression,
        operation.locationType,
        sourceFile,
        nextState(state),
      ));
    case "location-equal":
      return csharpRuntimeLocationPointee(resolveSelectedValueWithState(
        operation.leftExpression,
        operation.leftType,
        sourceFile,
        nextState(state),
      )) ?? csharpRuntimeLocationPointee(resolveSelectedValueWithState(
        operation.rightExpression,
        operation.rightType,
        sourceFile,
        nextState(state),
      ));
    case "location-bind":
    case "location-view":
      return getCsharpDelegateSignature(resolveSelectedValueWithState(
        operation.readExpression,
        operation.readType,
        sourceFile,
        nextState(state),
      ))?.returnType;
    case "location-project":
      return getCsharpDelegateSignature(resolveSelectedValueWithState(
        operation.fromSourceExpression,
        operation.fromSourceType,
        sourceFile,
        nextState(state),
      ))?.returnType;
  }
}

export function withSourceTargetBindings(
  { createCsharpTypePolicy, host, policy }: CsharpTypeResolutionScope,
  bindings: readonly CsharpSourceTargetTypeBinding[],
): CsharpScopedTypePolicyResult {
  if (bindings.length === 0) {
    return { kind: "resolved", policy };
  }
  const targetTypes = new WeakMap<Node, TargetTypeRef>();
  for (const binding of bindings) {
    const current = targetTypes.get(binding.declaration);
    if (
      current !== undefined &&
      !targetTypeRefEquals(current, binding.targetType)
    ) {
      return {
        kind: "rejected",
        reason:
          "One exact source declaration is related to incompatible scoped C# target representations.",
      };
    }
    targetTypes.set(binding.declaration, binding.targetType);
  }
  return {
    kind: "resolved",
    policy: createCsharpTypePolicy({
      ...host,
      representations: {
        genericProjections: host.representations.genericProjections,
        requiresClosedStructuralContract(type) {
          return host.representations.requiresClosedStructuralContract(type);
        },
        scopedTargetType(node) {
          const reference = host.navigation.referenceFor(node);
        return targetTypes.get(reference?.declaration ?? node) ??
          targetTypes.get(node) ??
          host.representations.scopedTargetType(node);
        },
        sourceCallable(source, sourceFile, selection) {
          return host.representations.sourceCallable(source, sourceFile, selection);
        },
      },
    }),
  };
}
