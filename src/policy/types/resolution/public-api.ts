import type { CsharpSourceTypedLocationOperation } from "../../operations/typed-locations/source-typed-locations.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo, CsharpScopedTypePolicyResult, CsharpTypeResolutionState } from "./model.js";
import type { CsharpSourceTargetTypeBinding } from "../../../target-model/types/model.js";
import type { SourceDeclarationReference } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpRuntimeLocationPointee, csharpTsValueTargetType } from "../../../target-model/types/runtime-carriers.js";
import { csharpTargetParameterValueType } from "../../../target-model/types/member-facts.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { nextState } from "./state.js";
import { sourceDeclarationReferenceFactSubjects } from "./source-evidence.js";

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
  return resolveNode(
    declaration,
    reference?.sourceFile ?? host.ast.getSourceFile(declaration) ?? sourceFile,
  );
}


export function resolveReadStorage(
  { activeNodes, host, resolvePropertyAccessTargetType, resolveStorage }: CsharpTypeResolutionScope,
  node: Node | undefined,
  sourceFile?: SourceFile,
): TargetTypeRef | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (!host.ast.is.IsPropertyAccessExpression(node)) {
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
    return resolvePropertyAccessTargetType(
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
  { host, resolveNodeWithState, resolveSourceValueDeclaration, resolveTypeWithState, sourceValueDeclaration }: CsharpTypeResolutionScope,
  node: Node,
  selectedType: Type,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const reference = host.navigation.referenceFor(node);
  const declaration = sourceValueDeclaration(node, reference?.declaration);
  const scopedTarget = host.representations.scopedTargetType(
    declaration ?? node,
  ) ?? host.representations.scopedTargetType(node);
  if (scopedTarget !== undefined) {
    return scopedTarget;
  }
  if (declaration !== undefined) {
    const declared = resolveSourceValueDeclaration(
      node,
      host.semantics(sourceFile),
      nextState(state),
      selectedType,
    );
    if (declared !== undefined) {
      return declared;
    }
    if (host.ast.is.IsBindingElement(declaration)) {
      return resolveNodeWithState(
        node,
        sourceFile,
        nextState(state),
      ) ?? resolveTypeWithState(
        selectedType,
        sourceFile,
        nextState(state),
      );
    }
    return undefined;
  }
  return resolveNodeWithState(
    node,
    sourceFile,
    nextState(state),
  ) ?? resolveTypeWithState(
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
  { resolveAuthoredAndSelectedSourceType, resolveSelectedValueWithState }: CsharpTypeResolutionScope,
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
      return resolveSelectedValueWithState(
        operation.storageExpression,
        operation.storageType,
        sourceFile,
        nextState(state),
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
    case "location-hash":
    case "location-bind":
    case "location-project":
      return undefined;
  }
}


export function resolveSourceCallTypeArguments(
  { host, resolveSourceCallInstantiation }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): readonly TargetTypeRef[] | undefined {
  const callable = host.representations.sourceCallable(source, sourceFile);
  return resolveSourceCallInstantiation(
    source,
    sourceFile,
    { depth: 0 },
    callable?.methodTypeParameterNames,
    callable,
  )?.arguments;
}


export function resolveSourceCallParameter(
  { host, resolveSourceCallableContractType, resolveSourceCallSelectedType, sourceCallableTypeParametersMatch, sourceCallCalleeDelegateSignature }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  parameterIndex: number,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const parameter = source.sourceSelectedSignatureParameters[parameterIndex];
  if (parameter === undefined) {
    return undefined;
  }
  const callable = host.representations.sourceCallable(source, sourceFile);
  const contractedParameter = callable?.parameters[parameterIndex];
  if (callable !== undefined && contractedParameter !== undefined) {
    if (
      contractedParameter.sourceParameter !==
        parameter.parameterDeclaration ||
      !sourceCallableTypeParametersMatch(source, callable)
    ) {
      return undefined;
    }
    return resolveSourceCallableContractType(
      source,
      callable,
      contractedParameter.targetParameter.type,
      sourceFile,
      { depth: 0 },
    );
  }
  const delegateParameter = sourceCallCalleeDelegateSignature(
    source,
    sourceFile,
    { depth: 0 },
  )?.parameters[parameterIndex];
  if (delegateParameter !== undefined) {
    return delegateParameter;
  }
  return resolveSourceCallSelectedType(
        source,
        parameter.parameterDeclaration,
        parameter.authoredTypeNode,
        parameter.selectedType,
        sourceFile,
        { depth: 0 },
      );
}


export function resolveSourceCallArgumentParameter(
  { host, resolveSourceCallableContractType, resolveSourceCallSelectedType, sourceCallableTypeParametersMatch, sourceCallCalleeDelegateSignature }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  binding: ResolvedSourceCallInfo["sourceArgumentBindings"][number],
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const parameter = source.sourceSelectedSignatureParameters[
    binding.sourceParameterIndex
  ];
  if (parameter === undefined) {
    return undefined;
  }
  const callable = host.representations.sourceCallable(source, sourceFile);
  const contractedParameter = callable?.parameters[
    binding.sourceParameterIndex
  ];
  if (callable !== undefined && contractedParameter !== undefined) {
    if (
      contractedParameter.sourceParameter !==
        parameter.parameterDeclaration ||
      !sourceCallableTypeParametersMatch(source, callable)
    ) {
      return undefined;
    }
    const contracted = resolveSourceCallableContractType(
      source,
      callable,
      contractedParameter.targetParameter.type,
      sourceFile,
      { depth: 0 },
    );
    return contracted === undefined
      ? undefined
      : csharpTargetParameterValueType(
          {
            ...contractedParameter.targetParameter,
            type: contracted,
          },
          binding.sourceForm,
        );
  }
  const delegateParameter = sourceCallCalleeDelegateSignature(
    source,
    sourceFile,
    { depth: 0 },
  )?.parameters[binding.effectiveArgumentIndex];
  if (delegateParameter !== undefined) {
    return delegateParameter;
  }
  return resolveSourceCallSelectedType(
    source,
    parameter.parameterDeclaration,
    parameter.authoredTypeNode,
    binding.selectedParameterType,
    sourceFile,
    { depth: 0 },
  );
}


export function resolveSourceCallResult(
  { resolveSourceCallResultWithState }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  return resolveSourceCallResultWithState(
    source,
    sourceFile,
    { depth: 0 },
  );
}


export function resolveSourceCallResultWithState(
  { host, resolveSourceCallableContractType, resolveSourceCallSelectedType, sourceCallableTypeParametersMatch, sourceCallCalleeDelegateSignature, sourceCallSelectedDeclaration }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const declaration = sourceCallSelectedDeclaration(source);
  const callable = host.representations.sourceCallable(source, sourceFile);
  if (callable !== undefined) {
    if (!sourceCallableTypeParametersMatch(source, callable)) {
      return undefined;
    }
    return resolveSourceCallableContractType(
      source,
      callable,
      callable.returnType,
      sourceFile,
      state,
    );
  }
  const delegateResult = sourceCallCalleeDelegateSignature(
    source,
    sourceFile,
    nextState(state),
  )?.returnType;
  if (delegateResult !== undefined) {
    return delegateResult;
  }
  const result = host.semantics(sourceFile).operations.callResult(source);
  if (result === undefined) {
    return undefined;
  }
  return resolveSourceCallSelectedType(
    source,
    declaration,
    result.authoredTypeNode,
    result.selectedReturnType,
    sourceFile,
    state,
  );
}


export function resolveDeclaredNamedType(
  { projectSourceDeclarationTargetType, resolveProviderType }: CsharpTypeResolutionScope,
  reference: SourceDeclarationReference,
  typeArguments: readonly TargetTypeRef[],
): TargetTypeRef | undefined {
  return reference.project
    ? projectSourceDeclarationTargetType(
        reference.declaration,
        typeArguments,
      )
    : resolveProviderType(
        sourceDeclarationReferenceFactSubjects(reference),
        typeArguments,
      );
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
        scopedTargetType(node) {
          const reference = host.navigation.referenceFor(node);
        return targetTypes.get(reference?.declaration ?? node) ??
          targetTypes.get(node) ??
          host.representations.scopedTargetType(node);
        },
        sourceCallable(source, sourceFile) {
          return host.representations.sourceCallable(source, sourceFile);
        },
      },
    }),
  };
}
