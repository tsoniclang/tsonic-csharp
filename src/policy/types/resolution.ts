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
  csharpSourceTypeArgumentNodes,
} from "./source-syntax.js";
import type {
  CsharpProjectTypeCatalog,
  CsharpProjectTypePolicy,
} from "./project-types.js";
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

export interface CsharpTypePolicyBaseHost {
  readonly ast: AstReader;
  readonly sourceFiles: readonly SourceFile[];
  readonly sourceFacts?: ReadonlySourceFactResolver;
  readonly navigation: SourceProgramNavigation;
  readonly providers: CsharpProviderRelationResolver;
  readonly target: TargetSelection;
  semantics(sourceFile: SourceFile): SourceFileSemantics;
  semanticsFor(node: Node): SourceFileSemantics;
  hasSemantics(sourceFile: SourceFile): boolean;
}

export interface CsharpTypePolicyHost extends CsharpTypePolicyBaseHost {
  readonly projectTypeCatalog: CsharpProjectTypeCatalog;
  projectTypes(): CsharpProjectTypePolicy;
  readonly structuralTypes: {
    resolveNode(
      node: Node,
      sourceFile: SourceFile,
    ): TargetTypeRef | undefined;
  };
}

export interface CsharpTypePolicy {
  resolveNode(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveStorage(node: Node | undefined, sourceFile?: SourceFile): TargetTypeRef | undefined;
  resolveType(type: Type | undefined, sourceFile: SourceFile): TargetTypeRef | undefined;
  resolveValue(
    node: Node | undefined,
    type: Type | undefined,
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
  resolveDeclaredNamedType(
    reference: SourceDeclarationReference,
    typeArguments: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined;
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
    resolveSelectedType,
    resolveSelectedResult,
    resolveDeclaredNamedType,
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

  function resolveNodeWithState(
    node: Node | undefined,
    sourceFile: SourceFile | undefined,
    state: CsharpTypeResolutionState,
  ): TargetTypeRef | undefined {
    if (node === undefined || state.depth > maximumTypeResolutionDepth) {
      return undefined;
    }
    const queries = sourceFile === undefined
      ? host.semanticsFor(node)
      : host.semantics(sourceFile);
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
    if (host.ast.is.IsTypeOperatorNode(node)) {
      return resolveNodeWithState(
        host.ast.as.AsTypeOperatorNode(node)!.Type,
        queries.sourceFile,
        nextState(state),
      );
    }
    if (host.ast.is.IsTypeReferenceNode(node)) {
      const resolved = resolveTypeReferenceNode(node, queries, state);
      if (resolved !== undefined) {
        return resolved;
      }
    }
    const selectedExpression = resolveSelectedExpressionType(
      node,
      queries,
      state,
    );
    if (selectedExpression !== undefined) {
      return selectedExpression;
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
      host.ast.is.IsSatisfiesExpression(node) ||
      host.ast.is.IsNonNullExpression(node)
    ) {
      const expression = host.ast.is.IsParenthesizedExpression(node)
        ? host.ast.as.AsParenthesizedExpression(node)?.Expression
        : host.ast.is.IsSatisfiesExpression(node)
          ? host.ast.as.AsSatisfiesExpression(node)?.Expression
          : host.ast.as.AsNonNullExpression(node)?.Expression;
      return resolveNodeWithState(
        expression,
        queries.sourceFile,
        nextState(state),
      );
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
        sourceOperatorFromKindName(host.ast.operatorKindName(node)),
        resolveNodeWithState(
          binary?.Left,
          queries.sourceFile,
          nextState(state),
        ),
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
        return host.ast.is.IsNewExpression(node)
          ? selection.call.targetMember.declaringType ??
            selection.call.targetMember.returnType
          : selection.call.targetMember.returnType;
      }
      if (selection.kind === "source-owned") {
        return host.ast.is.IsNewExpression(node)
          ? resolveSourceOwnedConstructionResult(
              selection.source,
              queries,
              state,
            )
          : resolveSourceOwnedCallResult(selection.source, queries, state);
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
        return optionalAccessTargetType(
          resolveSelectedDeclarationResult(
            selection.source.selectedDeclaration,
            selection.source.sourceReadType ??
              selection.source.sourceWriteType,
            queries,
            state,
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
        const receiver = resolveNodeWithState(
          selection.source.receiver.expression,
          queries.sourceFile,
          nextState(state),
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
          ),
          selection.source.optionalChain,
        );
      }
      return undefined;
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
    return resolveSelectedDeclarationResult(
      queries.getSignatureDeclaration(source.selectedSignature),
      source.sourceResultType,
      queries,
      state,
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
  ): TargetTypeRef | undefined {
    const declarationType = declaration === undefined ||
        !host.navigation.isProjectDeclaration(declaration)
      ? undefined
      : declarationResultTypeNode(declaration);
    const declarationSourceFile = declarationType === undefined
      ? queries.sourceFile
      : host.ast.getSourceFile(declaration) ?? queries.sourceFile;
    return resolveAuthoredAndSelectedSourceType(
      declarationType,
      declarationSourceFile,
      semanticType,
      queries.sourceFile,
      state,
    );
  }

  function declarationResultTypeNode(
    declaration: Node,
  ): Node | undefined {
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
    const projectType = resolveProjectSourceType(
      typeName,
      queries.sourceFile,
      state,
      typeArguments as readonly TargetTypeRef[],
    );
    if (projectType !== undefined) {
      return projectType;
    }
    return resolveTypeWithState(
      semanticType,
      queries.sourceFile,
      nextState(state),
    );
  }

  function resolveSourceValueDeclaration(
    node: Node,
    queries: SourceFileSemantics,
    state: CsharpTypeResolutionState,
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
        queries.getTypeAtLocation(node),
        queries.sourceFile,
        state,
      );
      if (resolved !== undefined) {
        return resolved;
      }
    }
    if (syntax.initializer === undefined) {
      return undefined;
    }
    const initializerTarget = resolveNodeWithState(
      syntax.initializer,
      sourceFile,
      nextState(state),
    );
    if (initializerTarget === undefined) {
      return undefined;
    }
    const declarationQueries = host.semantics(sourceFile);
    const declaredType = declarationQueries.getTypeAtLocation(
      syntax.initializer,
    );
    const selectedType = queries.getTypeAtLocation(node);
    if (declaredType === undefined || selectedType === undefined) {
      return initializerTarget;
    }
    const refinement = declarationQueries.selectTypeRefinement(
      declaredType,
      selectedType,
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
      return { kind: "opaque", id: "never" };
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
    return undefined;
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
    const nonNullish = sourceMembers.filter(
      (member) => !queries.isNullish(member),
    );
    const resolved = nonNullish.map((member) =>
      resolveTypeWithState(member, queries.sourceFile, nextState(state))
    );
    if (resolved.some((member) => member === undefined)) {
      return undefined;
    }
    if (resolved.length === 0) {
      return sourceMembers.some((member) => isUndefinedType(member, queries))
        ? csharpRuntimeUndefinedTargetType()
        : csharpRuntimeNullTargetType();
    }
    const targetMembers = uniqueTargetTypes(
      resolved as readonly TargetTypeRef[],
    );
    if (nonNullish.length !== sourceMembers.length) {
      return targetMembers.length === 1
        ? csharpNullableTargetType(targetMembers[0]!)
        : csharpRuntimeUnionTargetType(targetMembers);
    }
    return targetMembers.length === 1
      ? targetMembers[0]
      : csharpRuntimeUnionTargetType(targetMembers);
  }

  function combineTargetUnionMembers(
    members: readonly TargetTypeRef[],
  ): TargetTypeRef | undefined {
    const valueMembers = uniqueTargetTypes(
      members.filter(
        (member) =>
          !isCsharpRuntimeNullTargetType(member) &&
          !isCsharpRuntimeUndefinedTargetType(member),
      ),
    );
    const containsNullish = valueMembers.length !== members.length;
    if (valueMembers.length === 0) {
      return members.some(isCsharpRuntimeUndefinedTargetType)
        ? csharpRuntimeUndefinedTargetType()
        : csharpRuntimeNullTargetType();
    }
    const valueType = valueMembers.length === 1
      ? valueMembers[0]!
      : csharpRuntimeUnionTargetType(valueMembers);
    return valueType === undefined || !containsNullish
      ? valueType
      : csharpNullableTargetType(valueType);
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
  operator: ReturnType<typeof sourceOperatorFromKindName>,
  left: TargetTypeRef | undefined,
  right: TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  if (operator === undefined || left === undefined || right === undefined) {
    return undefined;
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
    case "=":
    case "&&=":
    case "||=":
    case "??=":
      return left;
    case ",":
      return right;
    case "<<":
    case ">>":
    case ">>>":
    case "<<=":
    case ">>=":
    case ">>>=":
      return left;
    case "??":
      return commonTargetRepresentation(
        getNonNullableTargetRepresentation(left),
        right,
      );
    default:
      return commonTargetRepresentation(left, right);
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
      return { kind: "opaque", id: "never" };
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
