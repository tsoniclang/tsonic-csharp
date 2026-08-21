import type { CsharpSourceCallableContract } from "../callables/source-callable-contract.js";
import type { CsharpTypeResolutionScope } from "./engine.js";
import type { Node, SourceFile, Type } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo, CsharpTypeResolutionState } from "./model.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { combineCsharpTargetUnionMembers } from "../../../target-model/types/runtime-carriers.js";
import { csharpTargetParameterValueType } from "../../../target-model/types/member-facts.js";
import { getCsharpDelegateSignature } from "../../../target-model/types/delegates.js";
import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "../callables/substitution.js";
import { nextState } from "./state.js";
import { reconcileCsharpSelectedTargetType } from "./selected-type-evidence.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function resolveAuthoredAndSelectedSourceType(
  { host, resolveNodeWithState, resolveTypeWithState }: CsharpTypeResolutionScope,
  authoredTypeNode: Node | undefined,
  authoredSourceFile: SourceFile,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const authoredQueries = host.hasSemantics(authoredSourceFile)
    ? host.semantics(authoredSourceFile)
    : undefined;
  const authored = authoredQueries === undefined
    ? undefined
    : resolveNodeWithState(
        authoredTypeNode,
        authoredSourceFile,
        nextState(state),
      );
  if (
    authored === undefined ||
    authoredQueries === undefined ||
    authoredTypeNode === undefined ||
    selectedType === undefined
  ) {
    return authored ?? resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    );
  }
  const authoredSemanticType = authoredQueries?.types.authoredType(
    authoredTypeNode,
  );
  if (authoredSemanticType === undefined) {
    return resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    );
  }
  const authoredSelection = authoredQueries.types.authoredSelection(
    authoredTypeNode,
    selectedType,
  );
  if (authoredSelection.kind === "authored-members") {
    const selectedMembers = authoredSelection.nodes.map((node) =>
      node === authoredTypeNode
        ? authored
        : resolveNodeWithState(
            node,
            authoredSourceFile,
            nextState(state),
          )
    );
    const selectedNullishMembers = authoredSelection.selectedNullishTypes.map(
      (type) =>
        resolveTypeWithState(
          type,
          selectedSourceFile,
          nextState(state),
        ),
    );
    const selectedTargets = [
      ...selectedMembers,
      ...selectedNullishMembers,
    ];
    return selectedTargets.some((member) => member === undefined)
      ? undefined
      : combineCsharpTargetUnionMembers(
          selectedTargets as readonly TargetTypeRef[],
        );
  }
  if (authoredSelection.kind === "ambiguous") {
    return undefined;
  }
  return reconcileCsharpSelectedTargetType(
    authored,
    resolveTypeWithState(
      selectedType,
      selectedSourceFile,
      nextState(state),
    ),
    authoredQueries.types.relationship(authoredSemanticType, selectedType),
  );
}


export function resolveSourceCallInstantiation(
  { inferSourceCallTargetTypeArguments, resolveAuthoredAndSelectedSourceType }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
  expectedTypeParameterNames?: readonly string[],
  callable?: CsharpSourceCallableContract,
):
  | {
      readonly arguments: readonly TargetTypeRef[];
      readonly substitutions: ReadonlyMap<string, TargetTypeRef>;
    }
  | undefined {
  const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
  if (expectedTypeParameterNames?.length === 0) {
    return {
      arguments: Object.freeze([]),
      substitutions: new Map(),
    };
  }
  if (
    expectedTypeParameterNames !== undefined &&
    (
      selectedArguments.length !== expectedTypeParameterNames.length ||
      selectedArguments.some((argument, index) =>
        argument.typeParameterName !== expectedTypeParameterNames[index]
      )
    )
  ) {
    return undefined;
  }
  if (selectedArguments.length === 0) {
    return {
      arguments: Object.freeze([]),
      substitutions: new Map(),
    };
  }
  const inferredParameterNames = new Set(
    selectedArguments
      .filter((argument) => argument.explicitTypeNode === undefined)
      .map((argument) => argument.typeParameterName),
  );
  const inferredTargetArguments = callable === undefined ||
      inferredParameterNames.size === 0
    ? new Map<string, TargetTypeRef>()
    : inferSourceCallTargetTypeArguments(
        source,
        callable,
        sourceFile,
        inferredParameterNames,
        nextState(state),
      );
  if (inferredTargetArguments === undefined) {
    return undefined;
  }
  const selectedParameters = new Set<Type>();
  const arguments_: TargetTypeRef[] = [];
  const substitutions = new Map<string, TargetTypeRef>();
  for (const selected of selectedArguments) {
    if (
      selected.typeParameterName.length === 0 ||
      selectedParameters.has(selected.typeParameter) ||
      substitutions.has(selected.typeParameterName)
    ) {
      return undefined;
    }
    const targetArgument = selected.explicitTypeNode === undefined
      ? inferredTargetArguments.get(selected.typeParameterName) ??
        resolveAuthoredAndSelectedSourceType(
          undefined,
          sourceFile,
          selected.selectedType,
          sourceFile,
          nextState(state),
        )
      : resolveAuthoredAndSelectedSourceType(
          selected.explicitTypeNode,
          sourceFile,
          selected.selectedType,
          sourceFile,
          nextState(state),
        );
    if (targetArgument === undefined) {
      return undefined;
    }
    selectedParameters.add(selected.typeParameter);
    substitutions.set(selected.typeParameterName, targetArgument);
    arguments_.push(targetArgument);
  }
  return {
    arguments: Object.freeze(arguments_),
    substitutions,
  };
}
export function resolveSourceCallSelectedType(
  { host, resolveAuthoredAndSelectedSourceType, resolveNodeWithState, resolveSourceCallInstantiation, resolveSourceCallReceiverTargetType }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  declaration: Node | undefined,
  authoredTypeNode: Node | undefined,
  selectedType: Type | undefined,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const instantiation = resolveSourceCallInstantiation(
    source,
    selectedSourceFile,
    nextState(state),
  );
  if (instantiation === undefined) {
    return undefined;
  }
  const authoredSourceFile = host.ast.getSourceFile(authoredTypeNode) ??
    selectedSourceFile;
  const authored = authoredTypeNode === undefined ||
      !host.hasSemantics(authoredSourceFile)
    ? undefined
    : resolveNodeWithState(
        authoredTypeNode,
        authoredSourceFile,
        nextState(state),
      );
  const instantiated = authored === undefined
    ? undefined
    : substituteTargetTypeParameters(
        authored,
        instantiation.substitutions,
      );
  const receiverType = resolveSourceCallReceiverTargetType(
    source,
    selectedSourceFile,
    state,
  );
  const receiverInstantiation = instantiated === undefined
    ? { kind: "not-project-member" as const }
    : host.projectTypes().instantiateMemberType(
        declaration,
        receiverType,
        instantiated,
      );
  if (receiverInstantiation.kind === "unresolved") {
    return undefined;
  }
  if (receiverInstantiation.kind === "resolved") {
    return receiverInstantiation.type;
  }
  if (
    authored !== undefined &&
    instantiated !== undefined &&
    !targetTypeRefEquals(authored, instantiated)
  ) {
    return instantiated;
  }
  return resolveAuthoredAndSelectedSourceType(
    authoredTypeNode,
    authoredSourceFile,
    selectedType,
    selectedSourceFile,
    state,
  );
}


export function resolveSourceCallableContractType(
  { host, resolveSourceCallInstantiation, resolveSourceCallReceiverTargetType }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallableContract,
  type: TargetTypeRef,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  const instantiation = resolveSourceCallInstantiation(
    source,
    selectedSourceFile,
    nextState(state),
    callable.methodTypeParameterNames,
    callable,
  );
  if (instantiation === undefined) {
    return undefined;
  }
  const substituted = substituteTargetTypeParameters(
    type,
    instantiation.substitutions,
  );
  const receiverType = resolveSourceCallReceiverTargetType(
    source,
    selectedSourceFile,
    state,
  );
  const receiverInstantiation = callable.receiverTypeOwner === undefined
    ? { kind: "not-project-member" as const }
    : host.projectTypes().instantiateDeclarationType(
        callable.receiverTypeOwner,
        receiverType,
        substituted,
      );
  if (receiverInstantiation.kind === "unresolved") {
    return undefined;
  }
  return receiverInstantiation.kind === "resolved"
    ? receiverInstantiation.type
    : substituted;
}


export function inferSourceCallTargetTypeArguments(
  { resolveSelectedValueWithState }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallableContract,
  sourceFile: SourceFile,
  parameterNames: ReadonlySet<string>,
  state: CsharpTypeResolutionState,
): ReadonlyMap<string, TargetTypeRef> | undefined {
  const inferred = new Map<string, TargetTypeRef>();
  for (const binding of source.sourceArgumentBindings) {
    const parameter = callable.parameters[binding.sourceParameterIndex]
      ?.targetParameter;
    const argument = source.sourceArguments[binding.sourceArgumentIndex];
    if (parameter === undefined || argument === undefined) {
      return undefined;
    }
    const actual = resolveSelectedValueWithState(
      argument.expression,
      argument.type,
      sourceFile,
      nextState(state),
    );
    if (actual === undefined) {
      continue;
    }
    const pattern = csharpTargetParameterValueType(
      parameter,
      binding.sourceForm,
    );
    const candidates = inferCsharpTargetTypeParameterBindings(
      pattern,
      actual,
      parameterNames,
    );
    if (candidates === undefined) {
      continue;
    }
    for (const [name, candidate] of candidates) {
      const existing = inferred.get(name);
      if (
        existing !== undefined &&
        !targetTypeRefEquals(existing, candidate)
      ) {
        return undefined;
      }
      inferred.set(name, candidate);
    }
  }
  return inferred;
}


export function sourceCallSelectedDeclaration(
  {  }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
): Node | undefined {
  return source.sourceCalleeAccess?.selectedDeclaration ??
    source.sourceCallee.selectedDeclaration;
}


export function resolveSourceCallReceiverTargetType(
  { host, resolveSelectedReceiverTargetType, resolveTypeWithState }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  selectedSourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): TargetTypeRef | undefined {
  return host.ast.is.IsNewExpression(source.call)
    ? resolveTypeWithState(
        source.sourceResultType,
        selectedSourceFile,
        nextState(state),
      )
    : resolveSelectedReceiverTargetType(
        source.sourceReceiver,
        host.semantics(selectedSourceFile),
        state,
      );
}


export function sourceCallCalleeDelegateSignature(
  { resolveSelectedValueWithState }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  state: CsharpTypeResolutionState,
): ReturnType<typeof getCsharpDelegateSignature> {
  return getCsharpDelegateSignature(resolveSelectedValueWithState(
    source.sourceCallee.expression,
    source.sourceCallee.type,
    sourceFile,
    nextState(state),
  ));
}


export function sourceCallableTypeParametersMatch(
  {  }: CsharpTypeResolutionScope,
  source: ResolvedSourceCallInfo,
  callable: CsharpSourceCallableContract,
): boolean {
  if (callable.methodTypeParameterNames.length === 0) {
    return true;
  }
  const selected = source.sourceSelectedMethodTypeArguments ?? [];
  return selected.length === callable.methodTypeParameterNames.length &&
    selected.every((argument, index) =>
      argument.typeParameterName ===
        callable.methodTypeParameterNames[index]
    );
}


export function sourceValueDeclaration(
  { host }: CsharpTypeResolutionScope,
  node: Node,
  referenced: Node | undefined,
): Node | undefined {
  if (
    host.ast.is.IsVariableDeclaration(node) ||
    host.ast.is.IsBindingElement(node) ||
    host.ast.is.IsParameterDeclaration(node) ||
    host.ast.is.IsPropertyDeclaration(node)
  ) {
    return node;
  }
  return referenced !== undefined &&
      (
        host.ast.is.IsVariableDeclaration(referenced) ||
        host.ast.is.IsBindingElement(referenced) ||
        host.ast.is.IsParameterDeclaration(referenced) ||
        host.ast.is.IsPropertyDeclaration(referenced)
      )
    ? referenced
    : undefined;
}


export function sourceValueDeclarationSyntax(
  { host }: CsharpTypeResolutionScope,
  declaration: Node,
): {
  readonly type?: Node;
  readonly initializer?: Node;
} {
  if (host.ast.is.IsVariableDeclaration(declaration)) {
    const value = host.ast.as.AsVariableDeclaration(declaration);
    return {
      ...(value?.Type === undefined ? {} : { type: value.Type }),
      ...(value?.Initializer === undefined
        ? {}
        : { initializer: value.Initializer }),
    };
  }
  if (host.ast.is.IsBindingElement(declaration)) {
    const value = host.ast.as.AsBindingElement(declaration);
    return value?.Initializer === undefined
      ? {}
      : { initializer: value.Initializer };
  }
  if (host.ast.is.IsParameterDeclaration(declaration)) {
    const value = host.ast.as.AsParameterDeclaration(declaration);
    return {
      ...(value?.Type === undefined ? {} : { type: value.Type }),
      ...(value?.Initializer === undefined
        ? {}
        : { initializer: value.Initializer }),
    };
  }
  const value = host.ast.as.AsPropertyDeclaration(declaration);
  return {
    ...(value?.Type === undefined ? {} : { type: value.Type }),
    ...(value?.Initializer === undefined
      ? {}
      : { initializer: value.Initializer }),
  };
}
