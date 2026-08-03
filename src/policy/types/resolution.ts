import {
  defaultValueFactKey,
  functionPointerFactKey,
  pointerFactKey,
  providerVirtualDeclarationFactKey,
  sourcePrimitiveFactKey,
} from "@tsonic/tsts";
import type {
  AstReader,
  ExtensionFactSubject,
  Node,
  ReadonlySourceFactResolver,
  SourceFile,
  Symbol,
  Type,
} from "@tsonic/tsts";
import type {
  SourceDeclarationReference,
  SourceFileSemantics,
  SourceProgramNavigation,
  TargetSelection,
} from "@tsonic/target-api";
import {
  sourceTypeSyntaxIsCompositional,
} from "@tsonic/target-api";
import type {
  CsharpProviderRelationResolver,
} from "../../provider/target-relations/resolver.js";
import {
  selectCsharpTargetCall,
  selectCsharpTargetElement,
  selectCsharpTargetProperty,
} from "../members/target-selection.js";
import {
  sourcePrimitiveImplicitlyConverts,
} from "../conversions/source-primitives.js";
import {
  isCsharpDestructuringAssignmentPattern,
  isCsharpAssignmentOperator,
  sourceOperatorFromKindName,
} from "../operations/syntax.js";
import {
  csharpTargetTypeFromBinding,
} from "./bindings.js";
import type {
  CsharpTargetNamedTypeRef,
  TargetTypeRef,
} from "./definitions.js";
import {
  csharpEnumerableTargetType,
  getCsharpCollectionElementTargetType,
} from "./collections.js";
import {
  csharpDelegateTargetType,
  getCsharpTaskResultTargetType,
  csharpTaskTargetType,
} from "./delegates.js";
import {
  getCsharpNullableElementTargetType,
  csharpNullableTargetType,
} from "./nullable.js";
import {
  csharpQualifiedTypeRenderShape,
} from "./render-shapes.js";
import {
  targetTypeRefKey,
  targetTypeRefEquals,
} from "./equality.js";
import {
  reconcileCsharpSelectedTargetType,
} from "./selected-type-evidence.js";
import {
  csharpAnyTargetType,
  csharpRuntimeNullTargetType,
  csharpRuntimeUndefinedTargetType,
  csharpRuntimeUnionTargetType,
  csharpTsValueTargetType,
  isCsharpRuntimeNullTargetType,
  isCsharpRuntimeUndefinedTargetType,
} from "./runtime-carriers.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../../options/csharp-target-options.js";
import {
  csharpBigIntegerTargetType,
  csharpExceptionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
  csharpNeverTargetType,
  csharpVoidTargetType,
} from "./scalar-types.js";
import {
  classifyCsharpSourceProfileType,
  selectedCsharpSourceProfileOwner,
} from "./source-profile.js";
import {
  resolveCsharpSourceLiteralTargetType,
} from "./source-literal-policy.js";
import {
  selectCsharpNumericBinaryPromotion,
} from "../operations/numeric-promotion.js";
import {
  csharpSourceTypeArgumentNodes,
} from "./source-syntax.js";
import type {
  CsharpProjectTypeCatalog,
  CsharpProjectTypePolicy,
} from "./project-types.js";
import type {
  CsharpSourceCallableContract,
} from "./source-callable-contract.js";
import {
  csharpJsArrayTargetType,
  csharpJsDateTargetType,
  csharpJsMapTargetType,
  csharpJsRegExpTargetType,
  csharpJsSetTargetType,
} from "./surface-types.js";
import {
  csharpTargetNamedType,
} from "./target-refs.js";
import {
  substituteTargetTypeParameters,
} from "./substitution.js";

type ResolvedSourceCallInfo = NonNullable<
  ReturnType<SourceFileSemantics["getResolvedCallInfo"]>
>;

export interface CsharpTypePolicyBaseHost {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly providers: CsharpProviderRelationResolver;
  readonly target: TargetSelection;
  readonly scopedTargetType?: (
    node: Node,
  ) => TargetTypeRef | undefined;
  sourceCallable(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): CsharpSourceCallableContract | undefined;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  semanticsFor(node: Node): SourceFileSemantics;
  hasSemantics(sourceFile: SourceFile): boolean;
}

export interface CsharpTypePolicyHost extends CsharpTypePolicyBaseHost {
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  projectTypes(): CsharpProjectTypePolicy;
  targetTypeComponents(type: TargetTypeRef): readonly TargetTypeRef[];
  readonly structuralTypes: {
    resolveNode(
      node: Node,
      sourceFile: SourceFile,
    ): TargetTypeRef | undefined;
    resolveType(
      type: Type,
      sourceFile: SourceFile,
    ): TargetTypeRef | undefined;
  };
}

export interface CsharpSourceTargetTypeBinding {
  readonly declaration: Node;
  readonly targetType: TargetTypeRef;
}

export type CsharpScopedTypePolicyResult =
  | {
      readonly kind: "resolved";
      readonly policy: CsharpTypePolicy;
    }
  | {
      readonly kind: "rejected";
      readonly reason: string;
    };

export interface CsharpTypePolicy {
  resolveNode(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveStorage(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveType(type: Type | undefined, sourceFile: SourceFile): TargetTypeRef | undefined;
  resolveValue(
    node: Node | undefined,
    type: Type | undefined,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSelectedValue(
    node: Node,
    selectedType: Type,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSelectedType(
    authoredTypeNode: Node | undefined,
    selectedType: Type | undefined,
    selectedSourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSelectedResult(
    selectedDeclaration: Node | undefined,
    selectedType: Type | undefined,
    selectedSourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSourceCallTypeArguments(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): readonly TargetTypeRef[] | undefined;
  resolveSourceCallParameter(
    source: ResolvedSourceCallInfo,
    parameterIndex: number,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveSourceCallResult(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined;
  resolveDeclaredNamedType(
    reference: SourceDeclarationReference,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined;
  withSourceTargetBindings(
    bindings: readonly CsharpSourceTargetTypeBinding[],
  ): CsharpScopedTypePolicyResult;
}

interface CsharpTypeResolutionState {
  readonly depth: number;
}

const maximumTypeResolutionDepth = 128;

export function createCsharpTypePolicy(
  host: CsharpTypePolicyHost,
): CsharpTypePolicy {
  const activeNodes = new WeakSet<Node>();
  const policy: CsharpTypePolicy = {
    resolveNode,
    resolveStorage,
    resolveType,
    resolveValue,
    resolveSelectedValue,
    resolveSelectedType,
    resolveSelectedResult,
    resolveSourceCallTypeArguments,
    resolveSourceCallParameter,
    resolveSourceCallResult,
    resolveDeclaredNamedType,
    withSourceTargetBindings,
  };

  function resolveNode(
    node: Node | undefined,
    sourceFile?: SourceFile,
  ): TargetTypeRef | undefined {
    if (node === undefined || activeNodes.has(node)) {
      return undefined;
    }
    activeNodes.add(node);
    try {
      return resolveNodeWithState(node, sourceFile, { depth: 0 });
    } finally {
      activeNodes.delete(node);
    }
  }

  function resolveType(
    type: Type | undefined,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined {
    return resolveTypeWithState(type, sourceFile, { depth: 0 });
  }

  function resolveStorage(
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

  function catchVariableStorageCarrier(
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
    return readCsharpTypescriptCompatibilityMode(host.target) === "compat"
      ? csharpTsValueTargetType()
      : csharpExceptionTargetType();
  }

  function resolveValue(
    node: Node | undefined,
    type: Type | undefined,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined {
    return resolveNode(node, sourceFile) ?? resolveType(type, sourceFile);
  }

  function resolveSelectedValue(
    node: Node,
    selectedType: Type,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined {
    const reference = host.navigation.referenceFor(node);
    const declaration = sourceValueDeclaration(node, reference?.declaration);
    if (declaration !== undefined) {
      const declared = resolveSourceValueDeclaration(
        node,
        host.semantics(sourceFile),
        { depth: 0 },
        selectedType,
      );
      if (declared !== undefined) {
        return declared;
      }
      if (host.ast.is.IsBindingElement(declaration)) {
        return resolveNode(node, sourceFile) ??
          resolveType(selectedType, sourceFile);
      }
      return undefined;
    }
    return resolveNode(node, sourceFile) ??
      resolveType(selectedType, sourceFile);
  }

  function resolveSelectedType(
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

  function resolveSelectedResult(
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

  function resolveSourceCallTypeArguments(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): readonly TargetTypeRef[] | undefined {
    const callable = host.sourceCallable(source, sourceFile);
    return resolveSourceCallInstantiation(
      source,
      sourceFile,
      callable?.methodTypeParameterNames,
    )?.arguments;
  }

  function resolveSourceCallParameter(
    source: ResolvedSourceCallInfo,
    parameterIndex: number,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined {
    const parameter = source.sourceSelectedSignatureParameters[parameterIndex];
    if (parameter === undefined) {
      return undefined;
    }
    const callable = host.sourceCallable(source, sourceFile);
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
    return resolveSourceCallSelectedType(
          source,
          parameter.parameterDeclaration,
          parameter.authoredTypeNode,
          parameter.selectedType,
          sourceFile,
          { depth: 0 },
        );
  }

  function resolveSourceCallResult(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
  ): TargetTypeRef | undefined {
    return resolveSourceCallResultWithState(
      source,
      sourceFile,
      { depth: 0 },
    );
  }

  function resolveSourceCallResultWithState(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const declaration = sourceCallSelectedDeclaration(source);
    const callable = host.sourceCallable(source, sourceFile);
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
    const result = host.semantics(sourceFile).selectCallResult(source);
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

  function resolveDeclaredNamedType(
    reference: SourceDeclarationReference,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    return reference.project
      ? projectSourceDeclarationTargetType(
          reference.declaration,
          typeArguments,
        )
      : resolveProviderType(
          [reference.symbol, reference.declaration],
          typeArguments,
        );
  }

  function withSourceTargetBindings(
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
        scopedTargetType(node) {
          const reference = host.navigation.referenceFor(node);
          return targetTypes.get(reference?.declaration ?? node) ??
            targetTypes.get(node) ??
            host.scopedTargetType?.(node);
        },
      }),
    };
  }

  function resolveNodeWithState(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    if (node === undefined || state.depth > maximumTypeResolutionDepth) {
      return undefined;
    }
    const scopedTargetType = host.scopedTargetType?.(node);
    if (scopedTargetType !== undefined) {
      return scopedTargetType;
    }
    const queries = sourceFile === undefined
      ? host.semanticsFor(node)
      : host.semantics(sourceFile);
    const syntaxFact = resolveDirectSourceFacts(
      [node],
      queries.sourceFile,
      state,
    );
    if (syntaxFact !== undefined) {
      return syntaxFact;
    }
    const selectedExpression = resolveSelectedExpressionType(
      node,
      queries,
      state,
    );
    if (selectedExpression !== undefined) {
      return selectedExpression;
    }
    const direct = resolveDirectSourceFacts(
      sourceFactSubjectsForNode(node, queries),
      queries.sourceFile,
      state,
    );
    if (direct !== undefined) {
      return direct;
    }
    const literal = resolveCsharpSourceLiteralTargetType(host, node);
    if (literal !== undefined) {
      return literal;
    }
    const keyword = resolveKeywordType(
      host.ast.kindName(node),
      host.target,
    );
    if (keyword !== undefined) {
      return keyword;
    }
    if (host.ast.is.IsArrayTypeNode(node)) {
      const element = resolveNodeWithState(
        host.ast.as.AsArrayTypeNode(node)!.ElementType,
        queries.sourceFile,
        nextState(state),
      );
      if (element !== undefined) {
        return selectedCsharpSourceProfileOwner(host.target) === "js"
          ? csharpJsArrayTargetType(element)
          : { kind: "array", element };
      }
      return resolveTypeWithState(
        queries.getTypeFromTypeNode(node),
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsTupleTypeNode(node)) {
      return resolveTupleTypeNode(node, queries, state);
    }
    if (host.ast.is.IsUnionTypeNode(node)) {
      const members = host.ast.children(node).map((member) =>
        resolveNodeWithState(
          member,
          queries.sourceFile,
          nextState(state),
        )
      );
      return members.some((member) => member === undefined)
        ? undefined
        : combineTargetUnionMembers(
            members as readonly TargetTypeRef[],
          );
    }
    if (host.ast.is.IsNamedTupleMember(node)) {
      return resolveNodeWithState(
        host.ast.as.AsNamedTupleMember(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsParenthesizedTypeNode(node)) {
      return resolveNodeWithState(
        host.ast.as.AsParenthesizedTypeNode(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsOptionalTypeNode(node)) {
      const inner = resolveNodeWithState(
        host.ast.as.AsOptionalTypeNode(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
      return inner === undefined ? undefined : csharpNullableTargetType(inner);
    }
    if (host.ast.is.IsRestTypeNode(node)) {
      return resolveNodeWithState(
        host.ast.as.AsRestTypeNode(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (
      host.ast.is.IsTypeOperatorNode(node) &&
      host.ast.operatorKindName(node) === "KindReadonlyKeyword"
    ) {
      return resolveNodeWithState(
        host.ast.as.AsTypeOperatorNode(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsTypeQueryNode(node)) {
      const expression = host.ast.as.AsTypeQueryNode(node)?.ExprName;
      const reference = host.navigation.referenceFor(expression);
      const definition = host.projectTypeCatalog.definitionForDeclaration(
        reference?.declaration,
      );
      if (definition?.kind === "struct") {
        return host.projectTypeCatalog.targetTypeForDeclaration(
          definition.declaration,
          [],
        );
      }
    }
    if (host.ast.is.IsTypeReferenceNode(node)) {
      const resolved = resolveTypeReferenceNode(node, queries, state);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    const projectThis = resolveProjectThisTargetType(node);
    if (projectThis !== undefined) {
      return projectThis;
    }
    const declaredValue = resolveSourceValueDeclaration(node, queries, state);
    if (declaredValue !== undefined) {
      return declaredValue;
    }
    const projectType = resolveProjectSourceType(node, queries.sourceFile, state);
    if (projectType !== undefined) {
      return projectType;
    }
    const structuralType = host.structuralTypes.resolveNode(
      node,
      queries.sourceFile,
    );
    if (structuralType !== undefined) {
      return structuralType;
    }
    return resolveTypeWithState(
      queries.getTypeAtLocation(node),
      queries.sourceFile,
      nextState(state),
    );
  }

  function resolveTupleTypeNode(
    node: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const syntaxElements = host.ast.elements(node);
    const elements = syntaxElements.map((element) =>
      resolveNodeWithState(
        element,
        queries.sourceFile,
        nextState(state),
      )
    );
    if (elements.some((element) => element === undefined)) {
      return undefined;
    }
    const restIndexes = syntaxElements.flatMap((element, index) =>
      tupleElementIsRest(element) ? [index] : []
    );
    if (restIndexes.length === 0) {
      return {
        kind: "tuple",
        elements: elements as readonly TargetTypeRef[],
      };
    }
    if (restIndexes.length !== 1) {
      return undefined;
    }
    const restIndex = restIndexes[0]!;
    const restElement = getCsharpCollectionElementTargetType(
      elements[restIndex],
    );
    if (restElement === undefined) {
      return undefined;
    }
    const homogeneous = elements.every((element, index) => {
      const value = index === restIndex
        ? restElement
        : getCsharpNullableElementTargetType(element) ?? element;
      return value !== undefined && targetTypeRefEquals(value, restElement);
    });
    if (!homogeneous) {
      return undefined;
    }
    return selectedCsharpSourceProfileOwner(host.target) === "js"
      ? csharpJsArrayTargetType(restElement)
      : { kind: "array", element: restElement };
  }

  function tupleElementIsRest(
    element: Node | undefined,
  ): boolean {
    if (element === undefined) {
      return false;
    }
    if (host.ast.is.IsRestTypeNode(element)) {
      return true;
    }
    return host.ast.is.IsNamedTupleMember(element) &&
      host.ast.as.AsNamedTupleMember(element)?.DotDotDotToken !== undefined;
  }

  function resolveSelectedExpressionType(
    node: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    if (
      host.ast.is.IsAsExpression(node) ||
      host.ast.is.IsTypeAssertion(node)
    ) {
      const assertion = host.ast.is.IsAsExpression(node)
        ? host.ast.as.AsAsExpression(node)
        : host.ast.as.AsTypeAssertion(node);
      if (host.ast.isConstAssertion(node)) {
        return resolveNodeWithState(
          assertion?.Expression,
          queries.sourceFile,
          nextState(state),
        );
      }
      return resolveNodeWithState(
        assertion?.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (
      host.ast.is.IsParenthesizedExpression(node) ||
      host.ast.is.IsSatisfiesExpression(node)
    ) {
      const expression = host.ast.is.IsParenthesizedExpression(node)
        ? host.ast.as.AsParenthesizedExpression(node)?.Expression
        : host.ast.as.AsSatisfiesExpression(node)?.Expression;
      return resolveNodeWithState(
        expression,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsNonNullExpression(node)) {
      return resolveNonNullExpressionType(node, queries, state);
    }
    if (host.ast.is.IsConditionalExpression(node)) {
      const conditional = host.ast.as.AsConditionalExpression(node);
      return commonTargetRepresentation(
        resolveNodeWithState(
          conditional?.WhenTrue,
          queries.sourceFile,
          nextState(state),
        ),
        resolveNodeWithState(
          conditional?.WhenFalse,
          queries.sourceFile,
          nextState(state),
        ),
      );
    }
    if (host.ast.is.IsBinaryExpression(node)) {
      const binary = host.ast.as.AsBinaryExpression(node);
      return resolveBinaryTargetRepresentation(
        host.ast,
        sourceOperatorFromKindName(host.ast.operatorKindName(node)),
        binary?.Left,
        resolveNodeWithState(
          binary?.Left,
          queries.sourceFile,
          nextState(state),
        ),
        binary?.Right,
        resolveNodeWithState(
          binary?.Right,
          queries.sourceFile,
          nextState(state),
        ),
      );
    }
    if (
      host.ast.is.IsPrefixUnaryExpression(node) ||
      host.ast.is.IsPostfixUnaryExpression(node)
    ) {
      const operand = host.ast.is.IsPrefixUnaryExpression(node)
        ? host.ast.as.AsPrefixUnaryExpression(node)?.Operand
        : host.ast.as.AsPostfixUnaryExpression(node)?.Operand;
      const operandType = resolveNodeWithState(
        operand,
        queries.sourceFile,
        nextState(state),
      );
      return sourceOperatorFromKindName(host.ast.operatorKindName(node)) === "!"
        ? csharpSourcePrimitiveTargetType("bool")
        : operandType;
    }
    if (host.ast.is.IsAwaitExpression(node)) {
      const awaited = resolveNodeWithState(
        host.ast.as.AsAwaitExpression(node)?.Expression,
        queries.sourceFile,
        nextState(state),
      );
      return awaited === undefined
        ? undefined
        : getTaskResultType(awaited);
    }
    if (
      host.ast.is.IsCallExpression(node) ||
      host.ast.is.IsNewExpression(node)
    ) {
      const selection = selectCsharpTargetCall(
        { ...host, projectTypes: host.projectTypes(), types: policy },
        node,
        queries.sourceFile,
      );
      if (selection.kind === "resolved") {
        const result = host.ast.is.IsNewExpression(node)
          ? selection.call.targetMember.declaringType ??
            selection.call.targetMember.returnType
          : selection.call.targetMember.returnType;
        return host.ast.is.IsNewExpression(node)
          ? result
          : optionalAccessTargetType(result, selection.source.optionalChain);
      }
      if (selection.kind === "source-owned") {
        const result = host.ast.is.IsNewExpression(node)
          ? resolveSourceOwnedConstructionResult(
              selection.source,
              queries,
              state,
            )
          : resolveSourceOwnedCallResult(selection.source, queries, state);
        return host.ast.is.IsNewExpression(node)
          ? result
          : optionalAccessTargetType(result, selection.source.optionalChain);
      }
      return undefined;
    }
    if (host.ast.is.IsPropertyAccessExpression(node)) {
      const selection = selectCsharpTargetProperty(
        { ...host, projectTypes: host.projectTypes(), types: policy },
        node,
        queries.sourceFile,
      );
      if (selection.kind === "resolved") {
        return optionalAccessTargetType(
          selection.targetMember.returnType,
          selection.source.optionalChain,
        );
      }
      if (selection.kind === "source-owned") {
        const receiverType = resolveSelectedReceiverTargetType(
          selection.source.receiver,
          queries,
          state,
        );
        return optionalAccessTargetType(
          resolveSelectedDeclarationResult(
            selection.source.selectedDeclaration,
            selection.source.sourceReadType ??
              selection.source.sourceWriteType,
            queries,
            state,
            receiverType,
          ),
          selection.source.optionalChain,
        );
      }
      return undefined;
    }
    if (host.ast.is.IsElementAccessExpression(node)) {
      const selection = selectCsharpTargetElement(
        { ...host, projectTypes: host.projectTypes(), types: policy },
        node,
        queries.sourceFile,
      );
      if (selection.kind === "resolved") {
        return optionalAccessTargetType(
          selection.targetMember.returnType,
          selection.source.optionalChain,
        );
      }
      if (selection.kind === "source-owned") {
        const receiver = resolveSelectedReceiverTargetType(
          selection.source.receiver,
          queries,
          state,
        );
        if (
          receiver?.kind === "tuple" &&
          selection.source.selectedElementIndex !== undefined
        ) {
          return optionalAccessTargetType(
            receiver.elements[selection.source.selectedElementIndex],
            selection.source.optionalChain,
          );
        }
        if (receiver?.kind === "array") {
          return optionalAccessTargetType(
            receiver.element,
            selection.source.optionalChain,
          );
        }
        return optionalAccessTargetType(
          resolveSelectedDeclarationResult(
            selection.source.selectedDeclaration,
            selection.source.sourceReadType ??
              selection.source.sourceWriteType,
            queries,
            state,
            receiver,
          ),
          selection.source.optionalChain,
        );
      }
      return undefined;
    }
    return undefined;
  }

  function resolveNonNullExpressionType(
    node: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const expression = host.ast.as.AsNonNullExpression(node)?.Expression;
    if (expression === undefined) {
      return undefined;
    }
    const sourceTarget = resolveNodeWithState(
      expression,
      queries.sourceFile,
      nextState(state),
    );
    const sourceType = queries.getTypeAtLocation(expression);
    const selectedType = queries.getTypeAtLocation(node);
    if (
      sourceTarget === undefined ||
      sourceType === undefined ||
      selectedType === undefined
    ) {
      return undefined;
    }
    const refinement = queries.selectTypeRefinement(sourceType, selectedType);
    if (refinement.kind === "exact") {
      return sourceTarget;
    }
    if (refinement.kind !== "members" || refinement.types.length === 0) {
      return undefined;
    }
    const declaredMembers = queries.getUnionOrIntersectionTypes(sourceType);
    if (declaredMembers.some((member) => member === undefined)) {
      return undefined;
    }
    const nonNullishMembers = declaredMembers.filter(
      (member): member is Type => member !== undefined && !queries.isNullish(member),
    );
    if (
      refinement.types.some((member) => queries.isNullish(member)) ||
      refinement.types.length !== nonNullishMembers.length ||
      nonNullishMembers.some((member) => !refinement.types.includes(member))
    ) {
      return undefined;
    }
    return getCsharpNullableElementTargetType(sourceTarget);
  }

  function resolveProjectThisTargetType(
    node: Node,
  ): TargetTypeRef | undefined {
    if (host.ast.kindName(node) !== "KindThisKeyword") {
      return undefined;
    }
    let current = host.ast.parent(node);
    while (current !== undefined) {
      if (host.ast.is.IsArrowFunction(current)) {
        current = host.ast.parent(current);
        continue;
      }
      if (
        host.ast.is.IsFunctionDeclaration(current) ||
        host.ast.is.IsFunctionExpression(current)
      ) {
        return undefined;
      }
      if (
        host.ast.is.IsMethodDeclaration(current) ||
        host.ast.is.IsGetAccessorDeclaration(current) ||
        host.ast.is.IsSetAccessorDeclaration(current) ||
        host.ast.is.IsConstructorDeclaration(current) ||
        host.ast.is.IsPropertyDeclaration(current)
      ) {
        const ownerNode = host.ast.parent(current);
        if (
          ownerNode === undefined ||
          !host.ast.is.IsClassDeclaration(ownerNode) ||
          host.ast.hasModifierKind(current, "static")
        ) {
          return undefined;
        }
        const owner = host.projectTypeCatalog.definitionForDeclaration(
          ownerNode,
        );
        return owner === undefined
          ? undefined
          : host.projectTypeCatalog.targetTypeForDeclaration(
              owner.declaration,
              owner.typeParameterNames.map((name) => ({
                kind: "type-parameter" as const,
                name,
              })),
            );
      }
      if (host.ast.kindName(current) === "KindClassStaticBlockDeclaration") {
        return undefined;
      }
      current = host.ast.parent(current);
    }
    return undefined;
  }

  function resolveSourceOwnedCallResult(
    source: NonNullable<
      ReturnType<SourceFileSemantics["getResolvedCallInfo"]>
    >,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    return resolveSourceCallResultWithState(
      source,
      queries.sourceFile,
      state,
    );
  }

  function resolveSelectedReceiverTargetType(
    receiver: {
      readonly expression?: Node;
      readonly type?: Type;
    } | undefined,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const expressionTarget = resolveNodeWithState(
      receiver?.expression,
      queries.sourceFile,
      nextState(state),
    );
    if (expressionTarget !== undefined) {
      return expressionTarget;
    }
    const semanticTarget = resolveTypeWithState(
      receiver?.type,
      queries.sourceFile,
      nextState(state),
    );
    if (semanticTarget !== undefined) {
      return semanticTarget;
    }
    if (
      receiver?.expression === undefined ||
      host.ast.kindName(receiver.expression) !== "KindThisKeyword"
    ) {
      return undefined;
    }
    const owner = host.projectTypeCatalog.definitionContainingDeclaration(
      receiver.expression,
    );
    return owner === undefined
      ? undefined
      : host.projectTypeCatalog.targetTypeForDeclaration(
          owner.declaration,
          owner.typeParameterNames.map((name) => ({
            kind: "type-parameter" as const,
            name,
          })),
        );
  }

  function resolveSourceOwnedConstructionResult(
    source: NonNullable<
      ReturnType<SourceFileSemantics["getResolvedCallInfo"]>
    >,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const declaration = source.sourceCallee.selectedDeclaration;
    if (
      declaration === undefined ||
      !host.ast.is.IsClassDeclaration(declaration) ||
      !host.navigation.isProjectDeclaration(declaration)
    ) {
      return resolveSourceOwnedCallResult(source, queries, state);
    }
    const selectedArguments = source.sourceSelectedMethodTypeArguments ?? [];
    const targetArguments = selectedArguments.map((argument) => {
      const authoredSourceFile = host.ast.getSourceFile(
        argument.explicitTypeNode,
      ) ?? queries.sourceFile;
      return resolveAuthoredAndSelectedSourceType(
        argument.explicitTypeNode,
        authoredSourceFile,
        argument.selectedType,
        queries.sourceFile,
        nextState(state),
      );
    });
    return targetArguments.some((argument) => argument === undefined)
      ? undefined
      : projectSourceDeclarationTargetType(
          declaration,
          targetArguments as readonly TargetTypeRef[],
        );
  }

  function optionalAccessTargetType(
    type: TargetTypeRef | undefined,
    optionalChain: boolean,
  ): TargetTypeRef | undefined {
    return type === undefined || !optionalChain
      ? type
      : csharpNullableTargetType(type);
  }

  function resolveSelectedDeclarationResult(
    declaration: Node | undefined,
    semanticType: Type | undefined,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    receiverType?: TargetTypeRef,
  ): TargetTypeRef | undefined {
    const enumMemberTarget = resolveProjectEnumMemberTarget(declaration);
    if (enumMemberTarget !== undefined) {
      return enumMemberTarget;
    }
    const declarationType = declaration === undefined ||
        !host.navigation.isProjectDeclaration(declaration)
      ? undefined
      : declarationResultTypeNode(declaration);
    const declarationSourceFile = declarationType === undefined
      ? queries.sourceFile
      : host.ast.getSourceFile(declaration) ?? queries.sourceFile;
    const authored = declarationType === undefined
      ? undefined
      : resolveNodeWithState(
          declarationType,
          declarationSourceFile,
          nextState(state),
        );
    if (authored !== undefined) {
      const instantiated = host.projectTypes().instantiateMemberType(
        declaration,
        receiverType,
        authored,
      );
      if (instantiated.kind === "unresolved") {
        return undefined;
      }
      if (instantiated.kind === "resolved") {
        return instantiated.type;
      }
    }
    return resolveAuthoredAndSelectedSourceType(
      declarationType,
      declarationSourceFile,
      semanticType,
      queries.sourceFile,
      state,
    );
  }

  function resolveProjectEnumMemberTarget(
    declaration: Node | undefined,
  ): TargetTypeRef | undefined {
    if (declaration === undefined || !host.ast.is.IsEnumMember(declaration)) {
      return undefined;
    }
    const parent = host.ast.parent(declaration);
    return parent !== undefined && host.ast.is.IsEnumDeclaration(parent)
      ? projectSourceDeclarationTargetType(parent, [])
      : undefined;
  }

  function declarationResultTypeNode(
    declaration: Node | undefined,
  ): Node | undefined {
    if (declaration === undefined) {
      return undefined;
    }
    if (host.ast.is.IsFunctionDeclaration(declaration)) {
      return host.ast.as.AsFunctionDeclaration(declaration)?.Type;
    }
    if (host.ast.is.IsMethodDeclaration(declaration)) {
      return host.ast.as.AsMethodDeclaration(declaration)?.Type;
    }
    if (host.ast.is.IsMethodSignatureDeclaration(declaration)) {
      return host.ast.as.AsMethodSignatureDeclaration(declaration)?.Type;
    }
    if (host.ast.is.IsCallSignatureDeclaration(declaration)) {
      return host.ast.as.AsCallSignatureDeclaration(declaration)?.Type;
    }
    if (host.ast.is.IsFunctionTypeNode(declaration)) {
      return host.ast.as.AsFunctionTypeNode(declaration)?.Type;
    }
    if (host.ast.is.IsArrowFunction(declaration)) {
      return host.ast.as.AsArrowFunction(declaration)?.Type;
    }
    if (host.ast.is.IsFunctionExpression(declaration)) {
      return host.ast.as.AsFunctionExpression(declaration)?.Type;
    }
    if (host.ast.is.IsGetAccessorDeclaration(declaration)) {
      return host.ast.as.AsGetAccessorDeclaration(declaration)?.Type;
    }
    if (host.ast.is.IsPropertyDeclaration(declaration)) {
      return host.ast.as.AsPropertyDeclaration(declaration)?.Type;
    }
    if (host.ast.is.IsPropertySignatureDeclaration(declaration)) {
      return host.ast.as.AsPropertySignatureDeclaration(declaration)?.Type;
    }
    if (host.ast.is.IsIndexSignatureDeclaration(declaration)) {
      return host.ast.as.AsIndexSignatureDeclaration(declaration)?.Type;
    }
    return undefined;
  }

  function resolveTypeReferenceNode(
    node: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const reference = host.ast.as.AsTypeReferenceNode(node)!;
    const typeName = reference.TypeName;
    if (typeName === undefined) {
      return undefined;
    }
    const semanticType = queries.getTypeFromTypeNode(node);
    const subjects = [
      ...sourceFactSubjectsForNode(typeName, queries, node),
      ...(semanticType === undefined
        ? []
        : queries.getTypeFactSubjects(semanticType)),
    ];
    const direct = resolveDirectSourceFacts(subjects, queries.sourceFile, state);
    if (direct !== undefined) {
      return direct;
    }
    const typeArguments = csharpSourceTypeArgumentNodes(host.ast, node).map((argument) =>
      resolveNodeWithState(argument, queries.sourceFile, nextState(state))
    );
    if (typeArguments.some((argument) => argument === undefined)) {
      return undefined;
    }
    const providerType = resolveProviderType(
      subjects,
      typeArguments as readonly TargetTypeRef[],
    );
    if (providerType !== undefined) {
      return providerType;
    }
    const sourceProfileType = semanticType === undefined
      ? undefined
      : resolveSourceProfileType(
          classifyCsharpSourceProfileType(semanticType, queries, host.ast),
          typeArguments as readonly TargetTypeRef[],
        );
    if (sourceProfileType !== undefined) {
      return sourceProfileType;
    }
    const sourceAlias = resolveCompositionalSourceTypeAlias(
      typeName,
      typeArguments as readonly TargetTypeRef[],
      state,
    );
    if (sourceAlias.kind === "resolved") {
      return sourceAlias.type;
    }
    if (sourceAlias.kind === "rejected") {
      return undefined;
    }
    const projectType = resolveProjectSourceType(
      typeName,
      queries.sourceFile,
      state,
      typeArguments as readonly TargetTypeRef[],
    );
    if (projectType !== undefined) {
      return projectType;
    }
    const semanticTarget = resolveTypeWithState(
      semanticType,
      queries.sourceFile,
      nextState(state),
    );
    return sourceAlias.kind === "checker-transformed-alias" &&
        semanticTarget !== undefined &&
        !targetPreservesAuthoredSourcePrimitiveFacts(
          node,
          semanticTarget,
          queries,
        )
      ? { kind: "opaque", id: "source-fact-dependent-type-transform" }
      : semanticTarget;
  }

  function resolveCompositionalSourceTypeAlias(
    typeName: Node,
    typeArguments: readonly TargetTypeRef[],
    state: CsharpTypeResolutionState,
  ):
    | { readonly kind: "not-alias" }
    | { readonly kind: "checker-transformed-alias" }
    | { readonly kind: "resolved"; readonly type: TargetTypeRef }
    | { readonly kind: "rejected" } {
    const reference = host.navigation.referenceFor(typeName);
    if (
      reference === undefined ||
      !host.ast.is.IsTypeAliasDeclaration(reference.declaration)
    ) {
      return { kind: "not-alias" };
    }
    const declaration = host.ast.as.AsTypeAliasDeclaration(
      reference.declaration,
    );
    const target = declaration?.Type;
    if (!sourceTypeSyntaxIsCompositional(host.ast, target)) {
      return { kind: "checker-transformed-alias" };
    }
    const parameters = host.ast.typeParameters(reference.declaration);
    if (target === undefined || parameters.length !== typeArguments.length) {
      return { kind: "rejected" };
    }
    const substitutions = new Map<string, TargetTypeRef>();
    for (let index = 0; index < parameters.length; index += 1) {
      const parameter = parameters[index];
      const name = host.ast.name(parameter);
      const argument = typeArguments[index];
      if (parameter === undefined || name === undefined || argument === undefined) {
        return { kind: "rejected" };
      }
      const key = host.ast.text(name);
      if (substitutions.has(key)) {
        return { kind: "rejected" };
      }
      substitutions.set(key, argument);
    }
    const resolved = resolveNodeWithState(
      target,
      reference.sourceFile,
      nextState(state),
    );
    return resolved === undefined
      ? { kind: "rejected" }
      : {
          kind: "resolved",
          type: substituteTargetTypeParameters(resolved, substitutions),
        };
  }

  function targetPreservesAuthoredSourcePrimitiveFacts(
    node: Node,
    target: TargetTypeRef,
    queries: SourceFileSemantics,
  ): boolean {
    const required = new Set(definedValues(
      queries.getAuthoredTypeFactSubjects(node)
        .map((subject) =>
          host.sourceFacts?.getFact(subject, sourcePrimitiveFactKey)?.kind
        ),
    ));
    if (required.size === 0) {
      return true;
    }
    const preserved = new Set<string>();
    collectTargetSourcePrimitiveNames(target, preserved);
    return [...required].every((kind) => preserved.has(kind));
  }

  function collectTargetSourcePrimitiveNames(
    target: TargetTypeRef,
    names: Set<string>,
    visited: Set<string> = new Set(),
  ): void {
    const key = targetTypeRefKey(target);
    if (visited.has(key)) {
      return;
    }
    visited.add(key);
    if (target.kind === "source-primitive") {
      names.add(target.name);
    }
    for (const component of host.targetTypeComponents(target)) {
      collectTargetSourcePrimitiveNames(component, names, visited);
    }
  }

  function resolveSourceValueDeclaration(
    node: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
    selectedType?: Type,
  ): TargetTypeRef | undefined {
    const reference = host.navigation.referenceFor(node);
    const declaration = sourceValueDeclaration(node, reference?.declaration);
    if (declaration === undefined) {
      return undefined;
    }
    const sourceFile = host.ast.getSourceFile(declaration) ?? queries.sourceFile;
    const syntax = sourceValueDeclarationSyntax(declaration);
    if (syntax.type !== undefined) {
      const resolved = resolveAuthoredAndSelectedSourceType(
        syntax.type,
        sourceFile,
        selectedType ?? queries.getTypeAtLocation(node),
        queries.sourceFile,
        state,
      );
      if (resolved !== undefined) {
        return resolved;
      }
    }
    if (host.ast.is.IsBindingElement(declaration)) {
      return undefined;
    }
    const declarationQueries = host.semantics(sourceFile);
    const declaredTarget = resolveTypeWithState(
      declarationQueries.getDeclaredValueType(declaration),
      sourceFile,
      nextState(state),
    );
    if (syntax.initializer === undefined) {
      return declaredTarget;
    }
    const selectedInitializerTarget = resolveSelectedExpressionType(
      syntax.initializer,
      declarationQueries,
      nextState(state),
    );
    if (
      host.ast.variableDeclarationKind(declaration) !== "const" &&
      selectedInitializerTarget === undefined &&
      declaredTarget !== undefined
    ) {
      return declaredTarget;
    }
    const initializerTarget = selectedInitializerTarget ??
      resolveNodeWithState(
        syntax.initializer,
        sourceFile,
        nextState(state),
      );
    if (initializerTarget === undefined) {
      return declaredTarget;
    }
    const declaredType = declarationQueries.getTypeAtLocation(
      syntax.initializer,
    );
    const selectedValueType = selectedType ?? queries.getTypeAtLocation(node);
    if (declaredType === undefined || selectedValueType === undefined) {
      return initializerTarget;
    }
    const refinement = declarationQueries.selectTypeRefinement(
      declaredType,
      selectedValueType,
    );
    if (refinement.kind === "ambiguous") {
      return undefined;
    }
    if (
      refinement.kind === "members" &&
      refinement.types.length > 0 &&
      refinement.types.every((member) => !declarationQueries.isNullish(member))
    ) {
      return getCsharpNullableElementTargetType(initializerTarget) ??
        initializerTarget;
    }
    return initializerTarget;
  }

  function resolveAuthoredAndSelectedSourceType(
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
    const authoredSemanticType = authoredQueries?.getTypeFromTypeNode(
      authoredTypeNode,
    );
    if (authoredSemanticType === undefined) {
      return resolveTypeWithState(
        selectedType,
        selectedSourceFile,
        nextState(state),
      );
    }
    const authoredSelection = authoredQueries.selectAuthoredType(
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
        : combineTargetUnionMembers(
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
      authoredQueries.getTypeRelationship(authoredSemanticType, selectedType),
    );
  }

  function resolveSourceCallInstantiation(
    source: ResolvedSourceCallInfo,
    sourceFile: SourceFile,
    expectedTypeParameterNames?: readonly string[],
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
      const targetArgument = resolveSelectedType(
        selected.explicitTypeNode,
        selected.selectedType,
        sourceFile,
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

  function resolveSourceCallSelectedType(
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

  function resolveSourceCallableContractType(
    source: ResolvedSourceCallInfo,
    callable: CsharpSourceCallableContract,
    type: TargetTypeRef,
    selectedSourceFile: SourceFile,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const instantiation = resolveSourceCallInstantiation(
      source,
      selectedSourceFile,
      callable.methodTypeParameterNames,
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

  function sourceCallSelectedDeclaration(
    source: ResolvedSourceCallInfo,
  ): Node | undefined {
    return source.sourceCalleeAccess?.selectedDeclaration ??
      source.sourceCallee.selectedDeclaration;
  }

  function resolveSourceCallReceiverTargetType(
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

  function sourceCallableTypeParametersMatch(
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

  function sourceValueDeclaration(
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

  function sourceValueDeclarationSyntax(
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

  function resolveTypeWithState(
    type: Type | undefined,
    sourceFile: SourceFile,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    if (type === undefined || state.depth > maximumTypeResolutionDepth) {
      return undefined;
    }
    const queries = host.semantics(sourceFile);
    const subjects = queries.getTypeFactSubjects(type);
    const direct = resolveDirectSourceFacts(subjects, sourceFile, state);
    if (direct !== undefined) {
      return direct;
    }
    const targetTypeArguments = resolveSemanticTypeArguments(type, queries, state);
    if (targetTypeArguments === undefined) {
      return undefined;
    }
    const providerType = resolveProviderType(subjects, targetTypeArguments);
    if (providerType !== undefined) {
      return providerType;
    }
    const typeParameter = resolveTypeParameter(type, queries, host.ast);
    if (typeParameter !== undefined) {
      return typeParameter;
    }
    if (queries.isAny(type)) {
      return csharpAnyTargetType(
        readCsharpTypescriptCompatibilityMode(host.target),
      );
    }
    if (queries.isUnknown(type)) {
      return readCsharpTypescriptCompatibilityMode(host.target) === "compat"
        ? csharpTsValueTargetType()
        : { kind: "opaque", id: "unknown" };
    }
    if (queries.isNever(type)) {
      return csharpNeverTargetType();
    }
    if (queries.isNullish(type)) {
      return isUndefinedType(type, queries)
        ? csharpRuntimeUndefinedTargetType()
        : csharpRuntimeNullTargetType();
    }
    if (queries.isUnion(type)) {
      return resolveUnionType(type, queries, state);
    }
    if (queries.isTuple(type)) {
      const rawSourceElements = queries.getTupleElementTypes(type);
      const sourceElements = definedValues(
        rawSourceElements,
      );
      if (sourceElements.length !== rawSourceElements.length) {
        return undefined;
      }
      const elements = sourceElements.map((element) =>
        resolveTypeWithState(element, sourceFile, nextState(state))
      );
      return elements.some((element) => element === undefined)
        ? undefined
        : {
            kind: "tuple",
            elements: elements as readonly TargetTypeRef[],
          };
    }
    const profileType = classifyCsharpSourceProfileType(type, queries, host.ast);
    if (profileType !== undefined) {
      const resolvedProfileType = resolveSourceProfileType(
        profileType,
        targetTypeArguments,
      );
      if (resolvedProfileType !== undefined) {
        return resolvedProfileType;
      }
    }
    const projectType = resolveProjectSourceSemanticType(
      type,
      queries,
      targetTypeArguments,
    );
    if (projectType !== undefined) {
      return projectType;
    }
    const callable = resolveCallableType(type, queries, state);
    if (callable !== undefined) {
      return callable;
    }
    if (queries.isBooleanLike(type)) {
      return csharpSourcePrimitiveTargetType("bool");
    }
    if (queries.isNumberLike(type)) {
      return csharpSourcePrimitiveTargetType("float64");
    }
    if (queries.isStringLike(type)) {
      return csharpStringTargetType();
    }
    if (queries.isBigIntLike(type)) {
      return csharpBigIntegerTargetType();
    }
    if (queries.isVoidLike(type)) {
      return csharpVoidTargetType();
    }
    return host.structuralTypes.resolveType(type, sourceFile);
  }

  function resolveDirectSourceFacts(
    subjects: readonly ExtensionFactSubject[],
    sourceFile: SourceFile,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    for (const subject of subjects) {
      const defaultValue = host.sourceFacts?.getFact(
        subject,
        defaultValueFactKey,
      );
      if (defaultValue !== undefined) {
        const type = resolveNodeWithState(
          defaultValue.type,
          sourceFile,
          nextState(state),
        );
        if (type !== undefined) {
          return type;
        }
      }
      const primitive = host.sourceFacts?.getFact(subject, sourcePrimitiveFactKey);
      if (primitive !== undefined) {
        return csharpSourcePrimitiveTargetType(primitive.kind);
      }
      const pointer = host.sourceFacts?.getFact(subject, pointerFactKey);
      if (pointer !== undefined) {
        const pointee = resolveNodeWithState(
          pointer.pointee,
          sourceFile,
          nextState(state),
        );
        if (pointee !== undefined) {
          return {
            kind: "pointer",
            pointee,
            mutability: pointer.mutability === "readwrite"
              ? "mut"
              : pointer.mutability === "readonly"
                ? "const"
                : "target-defined",
          };
        }
      }
      const functionPointer = host.sourceFacts?.getFact(
        subject,
        functionPointerFactKey,
      );
      if (functionPointer !== undefined) {
        const parameters = functionPointer.parameters.map((parameter) =>
          resolveNodeWithState(parameter, sourceFile, nextState(state))
        );
        const result = resolveNodeWithState(
          functionPointer.result,
          sourceFile,
          nextState(state),
        );
        if (
          result !== undefined &&
          parameters.every((parameter) => parameter !== undefined)
        ) {
          return {
            kind: "function-pointer",
            args: parameters as readonly TargetTypeRef[],
            result,
            ...(functionPointer.abi.length === 0
              ? {}
              : { abi: functionPointer.abi }),
          };
        }
      }
    }
    return undefined;
  }

  function resolveProviderType(
    subjects: readonly ExtensionFactSubject[],
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    for (const subject of subjects) {
      const declaration = host.sourceFacts?.getFact(
        subject,
        providerVirtualDeclarationFactKey,
      );
      if (declaration === undefined) {
        continue;
      }
      const resolution = host.providers.resolveType(declaration);
      if (resolution.kind !== "resolved") {
        continue;
      }
      const typeRelations = resolution.relations.filter(
        (relation) => relation.kind === "type",
      );
      if (typeRelations.length !== 1) {
        continue;
      }
      const relation = typeRelations[0]!;
      const targetArguments = relateTypeArguments(
        typeArguments,
        relation.bindingTypeParameters,
        relation.targetBinding.typeParameters?.length ?? 0,
      );
      if (targetArguments === undefined) {
        continue;
      }
      const targetType = csharpTargetTypeFromBinding(
        relation.targetBinding,
        targetArguments,
      );
      if (targetType !== undefined) {
        return targetType;
      }
    }
    return undefined;
  }

  function resolveSemanticTypeArguments(
    type: Type,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): readonly TargetTypeRef[] | undefined {
    if (!queries.isTypeReference(type)) {
      return [];
    }
    const sourceArguments = queries.getEffectiveTypeArguments(type);
    if (sourceArguments === undefined) {
      return undefined;
    }
    const resolved = sourceArguments.map((argument) =>
      resolveTypeWithState(argument, queries.sourceFile, nextState(state))
    );
    return resolved.some((argument) => argument === undefined)
      ? undefined
      : resolved as readonly TargetTypeRef[];
  }

  function resolveSourceProfileType(
    identity: ReturnType<typeof classifyCsharpSourceProfileType>,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    if (identity === undefined) {
      return undefined;
    }
    switch (identity.kind) {
      case "boolean":
        return typeArguments.length === 0
          ? csharpSourcePrimitiveTargetType("bool")
          : undefined;
      case "number":
        return typeArguments.length === 0
          ? csharpSourcePrimitiveTargetType("float64")
          : undefined;
      case "string":
        return typeArguments.length === 0
          ? csharpStringTargetType()
          : undefined;
      case "array":
      case "readonly-array": {
        const elementType = typeArguments.length === 1
          ? typeArguments[0]
          : undefined;
        if (elementType === undefined) {
          return undefined;
        }
        return identity.ownerId === "js"
          ? csharpJsArrayTargetType(elementType)
          : { kind: "array", element: elementType };
      }
      case "promise": {
        const resultType = typeArguments.length === 1
          ? typeArguments[0]
          : undefined;
        return resultType === undefined
          ? undefined
          : csharpTaskTargetType(resultType);
      }
      case "record": {
        if (typeArguments.length !== 2) {
          return undefined;
        }
        const binding = host.providers.findTargetBindingByMetadataName(
          "System.Collections.Generic.Dictionary`2",
        );
        const targetType = binding === undefined
          ? undefined
          : csharpTargetTypeFromBinding(binding, typeArguments);
        if (targetType?.kind !== "target-named") {
          return undefined;
        }
        return {
          ...(targetType as CsharpTargetNamedTypeRef),
          csharpCollectionSurface: "record",
          csharpPropertyKeyIteration: {
            kind: "key-collection",
            memberName: "Keys",
          },
        } as CsharpTargetNamedTypeRef;
      }
      case "date":
        return typeArguments.length === 0
          ? csharpJsDateTargetType()
          : undefined;
      case "regexp":
        return typeArguments.length !== 0
          ? undefined
          : identity.ownerId === "js"
            ? csharpJsRegExpTargetType()
            : csharpTargetNamedType(
                "System.Text.RegularExpressions.Regex",
                undefined,
                csharpQualifiedTypeRenderShape(
                  "System.Text.RegularExpressions",
                  "Regex",
                ),
              );
      case "map":
      case "readonly-map":
        return typeArguments.length === 2
          ? csharpJsMapTargetType(typeArguments[0]!, typeArguments[1]!)
          : undefined;
      case "set":
      case "readonly-set":
        return typeArguments.length === 1
          ? csharpJsSetTargetType(typeArguments[0]!)
          : undefined;
      case "iterable":
        return typeArguments.length === 1
          ? csharpEnumerableTargetType(typeArguments[0]!)
          : undefined;
    }
  }

  function resolveUnionType(
    type: Type,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const rawSourceMembers = queries.getUnionOrIntersectionTypes(type);
    const sourceMembers = definedValues(rawSourceMembers);
    if (sourceMembers.length !== rawSourceMembers.length) {
      return undefined;
    }
    const resolved = sourceMembers.map((member) =>
      resolveTypeWithState(member, queries.sourceFile, nextState(state))
    );
    if (resolved.some((member) => member === undefined)) {
      return undefined;
    }
    return combineTargetUnionMembers(
      resolved as readonly TargetTypeRef[],
    );
  }

  function combineTargetUnionMembers(
    members: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    const canonicalMembers = uniqueTargetTypes(members);
    const nonNullishMembers = canonicalMembers.filter(
      (member) =>
        !isCsharpRuntimeNullTargetType(member) &&
        !isCsharpRuntimeUndefinedTargetType(member),
    );
    const nullishMembers = canonicalMembers.filter(
      (member) =>
        isCsharpRuntimeNullTargetType(member) ||
        isCsharpRuntimeUndefinedTargetType(member),
    );
    if (nonNullishMembers.length === 0) {
      return nullishMembers.length === 1
        ? nullishMembers[0]
        : csharpRuntimeUnionTargetType(nullishMembers);
    }
    if (nullishMembers.length === 0) {
      return nonNullishMembers.length === 1
        ? nonNullishMembers[0]
        : csharpRuntimeUnionTargetType(nonNullishMembers);
    }
    return nonNullishMembers.length === 1
      ? csharpNullableTargetType(nonNullishMembers[0]!)
      : csharpRuntimeUnionTargetType([
          ...nonNullishMembers,
          ...nullishMembers,
        ]);
  }

  function resolveCallableType(
    type: Type,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const rawSignatures = queries.getCallSignatures(type);
    const signatures = definedValues(rawSignatures);
    if (signatures.length !== rawSignatures.length) {
      return undefined;
    }
    if (signatures.length !== 1) {
      return undefined;
    }
    const signature = signatures[0]!;
    const rawParameters = queries.getSignatureParameters(signature);
    const parameters = definedValues(rawParameters);
    if (parameters.length !== rawParameters.length) {
      return undefined;
    }
    const parameterTypes = parameters.map((parameter) =>
        resolveSymbolType(parameter, queries, nextState(state))
      );
    if (parameterTypes.some((parameter) => parameter === undefined)) {
      return undefined;
    }
    const returnType = resolveSelectedDeclarationResult(
      queries.getSignatureDeclaration(signature),
      queries.getReturnTypeOfSignature(signature),
      queries,
      state,
    );
    if (returnType === undefined) {
      return undefined;
    }
    return returnType.kind === "target-named" &&
        (returnType as CsharpTargetNamedTypeRef).csharpSpecialType === "void"
      ? csharpDelegateTargetType(
          "System.Action",
          parameterTypes as readonly TargetTypeRef[],
        )
      : csharpDelegateTargetType(
          "System.Func",
          parameterTypes as readonly TargetTypeRef[],
          returnType,
        );
  }

  function resolveSymbolType(
    symbol: Symbol,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    const direct = resolveDirectSourceFacts(
      [
        symbol,
        ...definedValues(queries.getSymbolDeclarations(symbol)),
      ],
      queries.sourceFile,
      state,
    );
    if (direct !== undefined) {
      return direct;
    }
    for (const declaration of definedValues(
      queries.getSymbolDeclarations(symbol),
    )) {
      if (host.ast.is.IsParameterDeclaration(declaration)) {
        const typeNode = host.ast.as.AsParameterDeclaration(declaration)!.Type;
        if (typeNode !== undefined) {
          const declared = resolveNodeWithState(
            typeNode,
            queries.sourceFile,
            nextState(state),
          );
          if (declared !== undefined) {
            return declared;
          }
        }
      }
    }
    return resolveTypeWithState(
      queries.getTypeOfSymbol(symbol),
      queries.sourceFile,
      nextState(state),
    );
  }

  function resolveProjectSourceSemanticType(
    type: Type,
    queries: SourceFileSemantics,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    const symbols = [
      queries.getTypeAliasSymbol(type),
      queries.getTypeSymbol(type),
    ];
    for (const symbol of symbols) {
      if (symbol === undefined) {
        continue;
      }
      for (const declaration of definedValues(
        queries.getSymbolDeclarations(symbol),
      )) {
        const targetType = projectSourceDeclarationTargetType(
          declaration,
          typeArguments,
        );
        if (targetType !== undefined) {
          return targetType;
        }
      }
    }
    return undefined;
  }

  function resolveProjectSourceType(
    node: Node,
    sourceFile: SourceFile,
    state: CsharpTypeResolutionState,
    typeArguments?: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    const reference = host.navigation.referenceFor(node);
    if (reference === undefined) {
      return undefined;
    }
    const resolvedArguments = typeArguments ??
      csharpSourceTypeArgumentNodes(host.ast, node).map((argument) =>
        resolveNodeWithState(argument, sourceFile, nextState(state))
      );
    if (resolvedArguments.some((argument) => argument === undefined)) {
      return undefined;
    }
    return projectSourceDeclarationTargetType(
      reference.declaration,
      resolvedArguments as readonly TargetTypeRef[],
    );
  }

  function projectSourceDeclarationTargetType(
    declaration: Node,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    return host.projectTypeCatalog.targetTypeForDeclaration(
      declaration,
      typeArguments,
    );
  }

  return Object.freeze(policy);
}

function resolveBinaryTargetRepresentation(
  ast: AstReader,
  operator: ReturnType<typeof sourceOperatorFromKindName>,
  leftNode: Node | undefined,
  left: TargetTypeRef | undefined,
  rightNode: Node | undefined,
  right: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (operator === undefined || left === undefined || right === undefined) {
    return undefined;
  }
  if (isCsharpAssignmentOperator(operator)) {
    return operator === "=" &&
        isCsharpDestructuringAssignmentPattern(ast, leftNode)
      ? right
      : left;
  }
  switch (operator) {
    case "===":
    case "==":
    case "!==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "in":
    case "instanceof":
    case "&&":
    case "||":
      return csharpSourcePrimitiveTargetType("bool");
    case ",":
      return right;
    case "<<":
    case ">>":
    case ">>>":
      return left;
    case "??": {
      const nonNullableLeft = getNonNullableTargetRepresentation(left);
      const numeric = leftNode === undefined || rightNode === undefined
        ? undefined
        : selectCsharpNumericBinaryPromotion(
            { ast },
            leftNode,
            nonNullableLeft,
            rightNode,
            right,
          );
      return numeric?.resultType ??
        commonTargetRepresentation(nonNullableLeft, right);
    }
    default: {
      const numeric = leftNode === undefined || rightNode === undefined
        ? undefined
        : selectCsharpNumericBinaryPromotion(
            { ast },
            leftNode,
            left,
            rightNode,
            right,
          );
      return numeric?.resultType ?? commonTargetRepresentation(left, right);
    }
  }
}

function commonTargetRepresentation(
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (left === undefined || right === undefined) {
    return undefined;
  }
  if (targetTypeRefEquals(left, right)) {
    return left;
  }
  if (sourcePrimitiveImplicitlyConverts(right, left)) {
    return right;
  }
  if (sourcePrimitiveImplicitlyConverts(left, right)) {
    return left;
  }
  return undefined;
}

function getNonNullableTargetRepresentation(
  type: TargetTypeRef,
): TargetTypeRef {
  return getCsharpNullableElementTargetType(type) ?? type;
}

function getTaskResultType(
  type: TargetTypeRef,
): TargetTypeRef | undefined {
  return getCsharpTaskResultTargetType(type);
}

function relateTypeArguments(
  sourceArguments: readonly TargetTypeRef[],
  relations: readonly {
    readonly sourceTypeParameterIndex: number;
    readonly targetTypeParameterIndex: number;
  }[],
  targetArity: number,
): readonly TargetTypeRef[] | undefined {
  if (relations.length !== sourceArguments.length) {
    return undefined;
  }
  const targetArguments: (TargetTypeRef | undefined)[] =
    Array.from({ length: targetArity });
  for (const relation of relations) {
    const source = sourceArguments[relation.sourceTypeParameterIndex];
    if (
      source === undefined ||
      relation.targetTypeParameterIndex < 0 ||
      relation.targetTypeParameterIndex >= targetArity ||
      targetArguments[relation.targetTypeParameterIndex] !== undefined
    ) {
      return undefined;
    }
    targetArguments[relation.targetTypeParameterIndex] = source;
  }
  return targetArguments.every(
      (argument): argument is TargetTypeRef => argument !== undefined,
    )
    ? targetArguments
    : undefined;
}

function sourceFactSubjectsForNode(
  node: Node,
  queries: SourceFileSemantics,
  parent?: Node,
): readonly ExtensionFactSubject[] {
  const symbols = definedValues([
    queries.getResolvedSymbolOrNil(node),
    queries.getSymbolAtLocation(node),
  ]);
  const subjects: ExtensionFactSubject[] = [];
  if (parent !== undefined) {
    subjects.push(parent);
  }
  subjects.push(node, ...symbols);
  for (const symbol of symbols) {
    subjects.push(
      ...definedValues(queries.getSymbolDeclarations(symbol)),
    );
  }
  return subjects;
}

function resolveTypeParameter(
  type: Type,
  queries: SourceFileSemantics,
  ast: AstReader,
): TargetTypeRef | undefined {
  const symbol = queries.getTypeSymbol(type);
  if (symbol === undefined) {
    return undefined;
  }
  for (const declaration of definedValues(
    queries.getSymbolDeclarations(symbol),
  )) {
    if (!ast.is.IsTypeParameterDeclaration(declaration)) {
      continue;
    }
    const nameNode = ast.name(declaration);
    if (nameNode !== undefined) {
      return {
        kind: "type-parameter",
        name: ast.text(nameNode),
      };
    }
  }
  return undefined;
}

function definedValues<T>(
  values: readonly (T | undefined)[],
): T[] {
  return values.filter((value): value is T => value !== undefined);
}

function uniqueTargetTypes(
  types: readonly TargetTypeRef[],
): readonly TargetTypeRef[] {
  const byIdentity = new Map<string, TargetTypeRef>();
  for (const type of types) {
    byIdentity.set(targetTypeRefKey(type), type);
  }
  return [...byIdentity.values()];
}

function resolveKeywordType(
  kind: string,
  target: TargetSelection,
): TargetTypeRef | undefined {
  switch (kind) {
    case "KindBooleanKeyword":
      return csharpSourcePrimitiveTargetType("bool");
    case "KindNumberKeyword":
      return csharpSourcePrimitiveTargetType("float64");
    case "KindStringKeyword":
      return csharpStringTargetType();
    case "KindBigIntKeyword":
      return csharpBigIntegerTargetType();
    case "KindVoidKeyword":
      return csharpVoidTargetType();
    case "KindAnyKeyword":
      return csharpAnyTargetType(
        readCsharpTypescriptCompatibilityMode(target),
      );
    case "KindUnknownKeyword":
      return readCsharpTypescriptCompatibilityMode(target) === "compat"
        ? csharpTsValueTargetType()
        : { kind: "opaque", id: "unknown" };
    case "KindNeverKeyword":
      return csharpNeverTargetType();
    default:
      return undefined;
  }
}

function isUndefinedType(
  type: Type,
  queries: SourceFileSemantics,
): boolean {
  return queries.isNullish(type) &&
    queries.isNever(
      queries.removeMissingOrUndefined(type),
    );
}

function nextState(
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState {
  return { depth: state.depth + 1 };
}
