import type { CsharpSourceTypedLocationOperation } from "../../../../source/extension/typed-locations.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { CsharpScopedTypePolicyResult, CsharpTypeResolutionState } from "./model.js";

import type { CsharpSourceTargetTypeBinding } from "../../../../target-model/types/model.js";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { csharpRuntimeLocationPointee, csharpTsValueTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";

import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { getCsharpDelegateSignature } from "../../../../target-model/types/carriers/delegates.js";
import { nextState } from "./state.js";
import type { CsharpNodeTypeResolution } from "../../../../policy/model/type-resolution.js";
import type { CsharpSourceCallResult } from "../../../../target-model/operations/source-call-results.js";
import type { CsharpNodeQuerySource, CsharpTypeQuerySource } from "./root-sources.js";
import { formCsharpSourceValueDeclarationSource } from "./value-source.js";
import { formCsharpSelectedValueSource, resolveFormedCsharpSelectedValueResult } from "./selected-value-source.js";

export function resolveNode(
  scope: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile?: SourceFile,
): CsharpNodeTypeResolution | undefined {
  return scope.completeNodeQuery(scope.nodeQuerySource(node, sourceFile));
}

export function resolveFormedCsharpNodeQuerySource(
  scope: Pick<CsharpTypeResolutionScope, "resolveFormedNodeTypeSource">,
  source: CsharpNodeQuerySource,
): CsharpNodeTypeResolution | undefined {
  let rejected: Extract<CsharpNodeTypeResolution, { readonly kind: "rejected" }> | undefined;
  const selected = source.captureRejections(rejection => { rejected ??= rejection; },
    () => scope.resolveFormedNodeTypeSource(source.root));
  return rejected ?? (selected === undefined ? undefined : Object.freeze({ kind: "resolved", sourceResult: selected }));
}

export function resolveFormedCsharpTypeQuerySource(
  scope: Pick<CsharpTypeResolutionScope, "resolveFormedSemanticTypeSource">,
  source: CsharpTypeQuerySource,
): TargetTypeRef | undefined {
  return scope.resolveFormedSemanticTypeSource(source.root);
}

export function resolveType(
  scope: CsharpTypeResolutionScope,
  type: Type | undefined,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return scope.completeTypeQuery(scope.typeQuerySource(type, sourceFile));
}

export function resolveStorage(
  { catchVariableStorageCarrier, host, resolveNode, resolveReadStorage, sourceValueDeclaration }: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile?: SourceFile,
): TargetTypeRef | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (host.ast.is.IsParenthesizedExpression(node)) {
    return resolveReadStorage(host.ast.as.AsParenthesizedExpression(node)?.Expression, sourceFile);
  }
  const reference = host.navigation.referenceFor(node);
  const declaration = sourceValueDeclaration(node, reference?.declaration);
  if (declaration === undefined) {
    const selected = resolveNode(node, sourceFile);
    return selected?.kind === "resolved" ? selected.sourceResult.selectedType : undefined;
  }
  const catchCarrier = catchVariableStorageCarrier(declaration);
  if (catchCarrier !== undefined) {
    return catchCarrier;
  }
  if (host.ast.is.IsBindingElement(declaration)) {
    const file = host.ast.getSourceFile(declaration);
    return file === undefined ? undefined : host.bindingProjection(declaration, file)?.bindingCarrier;
  }
  const selected = resolveNode(
    declaration,
    host.ast.getSourceFile(declaration) ?? sourceFile,
  );
  return selected?.kind === "resolved" ? selected.sourceResult.selectedType : undefined;
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
  const selected = resolveNode(node, sourceFile);
  return selected?.kind === "rejected" ? undefined : selected?.sourceResult.selectedType ?? resolveType(type, sourceFile);
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
  return resolveSelectedValueResultWithState(scope, node, selectedType, sourceFile, state)?.selectedType;
}

export function resolveSelectedValueResultWithState(
  scope: CsharpTypeResolutionScope,
  node: Node,
  selectedType: Type,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): CsharpSourceCallResult | undefined {
  const selection = formCsharpSourceValueDeclarationSource(scope, node);
  return resolveFormedCsharpSelectedValueResult(scope, formCsharpSelectedValueSource(
    scope, selection, selectedType, scope.host.semantics(sourceFile), state));
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
        requiresClosedStructuralContract(type) {
          return host.representations.requiresClosedStructuralContract(type);
        },
        scopedTargetType(node) {
          const reference = host.navigation.referenceFor(node);
        return targetTypes.get(reference?.declaration ?? node) ??
          targetTypes.get(node) ??
          host.representations.scopedTargetType(node);
        },
        closedInputContract(node) {
          return host.representations.closedInputContract(node);
        },
        sourceCallableSource(source, sourceFile) {
          return host.representations.sourceCallableSource(source, sourceFile);
        },
        completeSourceCallable(source, selection) {
          return host.representations.completeSourceCallable(source, selection);
        },
      },
    }),
  };
}
