import {
  AsArrayTypeNode,
  AsFunctionTypeNode,
  AsInterfaceDeclaration,
  AsMethodSignatureDeclaration,
  AsNumericLiteral,
  AsParameterDeclaration,
  AsPropertyAccessExpression,
  AsPropertySignatureDeclaration,
  AsTupleTypeNode,
  AsTypeParameterDeclaration,
  AsTypeReferenceNode,
  GetSourceFileOfNode,
  KindAnyKeyword,
  KindArrayType,
  KindBigIntKeyword,
  KindBooleanKeyword,
  KindBindingElement,
  KindCatchClause,
  KindClassDeclaration,
  KindEnumDeclaration,
  KindEnumMember,
  KindFunctionType,
  KindGetAccessor,
  KindIdentifier,
  KindInterfaceDeclaration,
  KindMethodSignature,
  KindNeverKeyword,
  KindNewExpression,
  KindNoSubstitutionTemplateLiteral,
  KindNumberKeyword,
  KindNumericLiteral,
  KindParameter,
  KindPropertyAccessExpression,
  KindPropertyDeclaration,
  KindPropertySignature,
  KindStringKeyword,
  KindStringLiteral,
  KindSetAccessor,
  KindTupleType,
  KindTypeLiteral,
  KindTypeReference,
  KindUnknownKeyword,
  KindVariableDeclaration,
  KindVoidKeyword,
  Node_Members,
  SourceFile_FileName,
  TstsProviderContractVersion,
  TypeFlagsAny,
  TypeFlagsBigIntLike,
  TypeFlagsBooleanLike,
  TypeFlagsEnumLike,
  TypeFlagsNever,
  TypeFlagsNumberLike,
  TypeFlagsStringLike,
  TypeFlagsTypeParameter,
  TypeFlagsUnknown,
  TypeFlagsVoidLike,
  acceptDecision,
  createSourceSemanticsExtension,
  deferDecision,
  functionPointerFactKey,
  getSingleTypeScriptCallSignatureInfo,
  getTypeScriptArrayElementType,
  getTypeScriptUnionTypes,
  getTypeScriptTypeReferenceInfo,
  isTypeScriptStringLikeType,
  isTypeScriptNullishType,
  Node_Name,
  Node_Pos,
  Node_Symbol,
  Node_Text,
  Node_Type,
  objectShapeFactKey,
  pointerFactKey,
  runtimeCarrierFactKey,
  sourcePrimitive,
  sourcePrimitiveFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import type {
  CompilerExtension,
  ExtensionDecisionContext,
  ExtensionDiagnostic,
  ExtensionEvidence,
  ExtensionFactSubject,
  ExtensionFactResolverContext,
  FunctionPointerFact,
  Node,
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderIdentity,
  ProviderMemberDeclaration,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  ProviderTypeExpression,
  ResolveCallRequest,
  ResolveCallResult,
  ResolveOperationResult,
  ResolveOperatorRequest,
  ResolvePropertyAccessRequest,
  ObjectShapeFact,
  ObjectShapeMemberFact,
  PointerFact,
  RuntimeCarrierFact,
  SourceCallMarkerDeclaration,
  SourcePrimitiveDeclaration,
  SourcePrimitiveFact,
  SourcePrimitiveKind,
  SourceSemanticsExportDeclaration,
  SourceSemanticsModule,
  SourceTypeMarkerDeclaration,
  Symbol,
  TargetBindingProvider,
  TargetBindingFact,
  TargetIterationFact,
  TargetMember,
  TargetOperationFact,
  TargetSemanticProvider,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type { TargetExtensionContext } from "@tsonic/target-api";

export const neutralTypesModule = "@tsonic/core/types.js";
export const csharpTypesModule = "@tsonic/csharp/types.js";
export const neutralLangModule = "@tsonic/core/lang.js";
export const csharpLangModule = "@tsonic/csharp/lang.js";

type AttributeBuilderTypeName =
  | "AttributeBuilder"
  | "AttributeMemberBuilder"
  | "AttributeMethodBuilder"
  | "AttributeParameterBuilder";

const attributeTargetTypeName = "__TsonicCsharpAttributeTarget";
const attributeArgumentTypeName = "__TsonicCsharpAttributeArgument";

interface TargetBindingAccess {
  readonly binding: TargetBindingFact;
  readonly staticAccess: boolean;
}

export function createCsharpSourceSemanticsExtension(_context: TargetExtensionContext): CompilerExtension {
  return createSourceSemanticsExtension({
    identity: {
      id: "tsonic.csharp.source-semantics",
      version: "0.0.1",
      capabilityNamespace: "tsonic.csharp.source",
    },
    modules: csharpSourceSemanticsModules(),
  });
}

export function createCsharpTargetSemanticsExtension(_context: TargetExtensionContext): CompilerExtension {
  return {
    identity: {
      id: "tsonic.csharp.target-semantics",
      version: "0.0.1",
      capabilityNamespace: "tsonic.csharp.target",
    },
    composition: {
      kind: "target",
      target: "csharp",
    },
    initialize(context): void {
      context.registerTargetBindingProvider(createCsharpCoreVirtualModulesProvider());
      const provider = createCsharpSurfaceOperationsProvider();
      context.registerTargetSemanticProvider(provider);
      context.factResolver.register(runtimeCarrierFactKey, (subject, resolverContext) =>
        resolveCsharpRuntimeCarrier(subject, resolverContext));
      context.factResolver.register(objectShapeFactKey, (subject, resolverContext) =>
        resolveCsharpObjectShape(subject, resolverContext));
    },
  };
}

function createCsharpSurfaceOperationsProvider(): TargetSemanticProvider {
  return {
    identity: {
      id: "tsonic.csharp.surface-operations",
      version: "0.0.1",
      target: "csharp",
      extensionContractVersion: TstsProviderContractVersion,
      providerKind: "semantic",
    },
    resolveCall(request, context) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
      }
      const delegateCall = resolveDelegateCall(
        [request.callee, request.calleeSymbol, request.calleeType],
        request.callee,
        request.calleeSymbol,
        request.arguments,
        context,
      );
      const providerConstructorCall = resolveProviderTargetConstructorCall(request, context);
      const builtinMethodCall = resolveCsharpBuiltinMethodCall(request, context);
      const providerMethodCall = resolveProviderTargetMethodCall(request, context);
      const call = delegateCall ?? providerConstructorCall ?? builtinMethodCall ?? providerMethodCall;
      return call === undefined ? deferDecision : acceptDecision(call);
    },
    resolvePropertyAccess(request, context) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
      }
      if (request.propertyName === "length" && isTypeScriptStringLikeType(request.receiverType as Type | undefined)) {
        const resultType = sourcePrimitiveInt32();
        return acceptDecision({
          operation: {
            operationId: "System.String.Length",
            operationKind: "property",
            targetOperation: "Length",
            resultType,
          } satisfies TargetOperationFact,
          resultType,
        });
      }
      if (request.propertyName === "length" && getTypeScriptArrayElementType(request.receiverType as Type | undefined) !== undefined) {
        const resultType = sourcePrimitiveInt32();
        return acceptDecision({
          operation: {
            operationId: "System.Array.Length",
            operationKind: "property",
            targetOperation: "Length",
            resultType,
          } satisfies TargetOperationFact,
          resultType,
        });
      }
      const providerPropertyAccess = resolveProviderTargetPropertyAccess(request, context);
      const sourceProjectPropertyAccess = resolveSourceProjectPropertyAccess(request);
      const propertyAccess = providerPropertyAccess ?? sourceProjectPropertyAccess;
      return propertyAccess === undefined ? deferDecision : acceptDecision(propertyAccess);
    },
    resolveElementAccess(request, context) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
      }
      if (!isCsharpIntegralIndexArgument(request, context)) {
        return deferDecision;
      }
      if (isTypeScriptStringLikeType(request.receiverType as Type | undefined)) {
        const elementType = csharpNamed("System.String");
        return acceptDecision({
          operation: {
            operationId: "System.String.CodeUnitAt",
            operationKind: "indexer",
            targetOperation: "string-code-unit",
            resultType: elementType,
          } satisfies TargetOperationFact,
          resultType: elementType,
        });
      }
      const elementType = getTypeScriptArrayElementType(request.receiverType as Type | undefined);
      if (elementType === undefined) {
        return deferDecision;
      }
      return acceptDecision({
        operation: {
          operationId: "System.Array.GetItem",
          operationKind: "indexer",
          targetOperation: "[]",
          resultType: elementType,
        } satisfies TargetOperationFact,
        resultType: elementType,
      });
    },
    resolveIteration(request, context) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
      }
      if (request.iterationKind === "sync" && isTypeScriptStringLikeType(request.iterableType as Type | undefined)) {
        const elementType = csharpNamed("System.String");
        return acceptDecision({
          iteration: {
            operationId: "System.String.CodePointIteration",
            iterationKind: "sync",
            targetOperation: "string-code-points",
            elementType,
          } satisfies TargetIterationFact,
          elementType,
        });
      }
      if (request.iterationKind === "property-key") {
        const objectShape = context.factResolver.resolve(request.iterable, objectShapeFactKey) ??
          (request.iterableType === undefined
            ? undefined
            : context.factResolver.resolve(request.iterableType, objectShapeFactKey));
        if (objectShape !== undefined) {
          const keyType = csharpNamed("System.String");
          return acceptDecision({
            iteration: {
              operationId: "Tsonic.CSharp.ObjectShape.Keys",
              iterationKind: "property-key",
              targetOperation: "object-shape-keys",
              elementType: keyType,
            } satisfies TargetIterationFact,
            elementType: keyType,
          });
        }
      }
      const elementType = getTypeScriptArrayElementType(request.iterableType as Type | undefined);
      if (elementType === undefined) {
        return deferDecision;
      }
      if (request.iterationKind === "property-key") {
        const keyType = csharpNamed("System.String");
        return acceptDecision({
          iteration: {
            operationId: "System.Array.Keys",
            iterationKind: "property-key",
            targetOperation: "array-index-keys",
            elementType: keyType,
          } satisfies TargetIterationFact,
          elementType: keyType,
        });
      }
      if (request.iterationKind !== "sync") {
        return deferDecision;
      }
      return acceptDecision({
        iteration: {
          operationId: "System.Array.Enumerate",
          iterationKind: "sync",
          targetOperation: "foreach",
          elementType,
        } satisfies TargetIterationFact,
        elementType,
      });
    },
    resolveOperator(request, context) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
      }
      const operation = resolveCsharpOperator(request, context);
      return operation === undefined ? deferDecision : acceptDecision(operation);
    },
    getContextualType(request, context) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
      }
      const targetType = resolveFirstRuntimeCarrier([request.context], context);
      if (targetType === undefined) {
        return deferDecision;
      }
      return acceptDecision({
        type: request.context,
        targetType,
      });
    },
  };
}

function resolveDelegateCall(
  carrierSubjects: readonly (ExtensionFactSubject | undefined)[],
  callee: ExtensionFactSubject,
  calleeSymbol: ExtensionFactSubject | undefined,
  args: readonly ExtensionFactSubject[],
  context: ExtensionDecisionContext,
): ResolveCallResult | undefined {
  if (!isDelegateValueSymbol(calleeSymbol)) {
    return undefined;
  }
  const carrier = resolveFirstRuntimeCarrier(carrierSubjects, context);
  if (!isCsharpDelegateCarrier(carrier)) {
    return undefined;
  }
  const parameters = getDelegateParameterTypes(carrier);
  if (parameters === undefined || parameters.length !== args.length) {
    return undefined;
  }
  const calleeSourceName = getCallCalleeSourceName(callee);
  if (calleeSourceName === undefined) {
    return undefined;
  }
  const returnType = getDelegateReturnType(carrier);
  const member = {
    id: "tsonic.csharp.delegate.Invoke",
    sourceName: calleeSourceName,
    targetName: calleeSourceName,
    kind: "method",
    static: false,
    parameters: parameters.map((type, index) => ({
      name: `arg${index}`,
      type,
      passingMode: "by-value",
    })),
    ...(returnType === undefined ? {} : { returnType }),
  } satisfies TargetMember;
  return {
    selectedSignature: { member },
    ...(returnType === undefined ? {} : { returnType }),
  };
}

function isDelegateValueSymbol(subject: ExtensionFactSubject | undefined): boolean {
  const symbol = subject as Symbol | undefined;
  const declaration = symbol?.ValueDeclaration ?? symbol?.Declarations?.find((candidate): candidate is Node => candidate !== undefined);
  if (isDeclarationFileNode(declaration)) {
    return false;
  }
  switch (declaration?.Kind) {
    case KindVariableDeclaration:
    case KindParameter:
    case KindPropertyDeclaration:
    case KindBindingElement:
      return true;
    default:
      return false;
  }
}

function isDeclarationFileNode(node: Node | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  const sourceFile = GetSourceFileOfNode(node);
  if (sourceFile === undefined) {
    return false;
  }
  const fileName = SourceFile_FileName(sourceFile);
  return fileName.endsWith(".d.ts");
}

function resolveFirstRuntimeCarrier(
  subjects: readonly (ExtensionFactSubject | undefined)[],
  context: ExtensionDecisionContext,
): TargetTypeRef | undefined {
  for (const subject of subjects) {
    if (subject === undefined) {
      continue;
    }
    const carrier = context.factResolver.resolve(subject, runtimeCarrierFactKey)?.carrier;
    if (carrier !== undefined) {
      return carrier;
    }
  }
  return undefined;
}

function isCsharpDelegateCarrier(type: TargetTypeRef | undefined): type is Extract<TargetTypeRef, { readonly kind: "target-named" }> {
  return type?.kind === "target-named" &&
    (type.id.startsWith("System.Func`") || type.id.startsWith("System.Action`"));
}

function getDelegateParameterTypes(type: Extract<TargetTypeRef, { readonly kind: "target-named" }>): readonly TargetTypeRef[] | undefined {
  const typeArguments = type.typeArguments ?? [];
  if (type.id.startsWith("System.Action`")) {
    return typeArguments;
  }
  if (type.id.startsWith("System.Func`")) {
    return typeArguments.length === 0 ? undefined : typeArguments.slice(0, -1);
  }
  return undefined;
}

function getDelegateReturnType(type: Extract<TargetTypeRef, { readonly kind: "target-named" }>): TargetTypeRef | undefined {
  if (type.id.startsWith("System.Action`")) {
    return undefined;
  }
  return type.typeArguments?.[type.typeArguments.length - 1];
}

function resolveCsharpBuiltinMethodCall(
  request: ResolveCallRequest,
  context: ExtensionDecisionContext,
): ResolveCallResult | undefined {
  if (!isNodeSubject(request.callee) || request.callee.Kind !== KindPropertyAccessExpression) {
    return undefined;
  }
  const propertyAccess = AsPropertyAccessExpression(request.callee);
  const name = propertyAccess?.name;
  if (name === undefined) {
    return undefined;
  }
  const sourceName = Node_Text(name);
  if (sourceName === "toString" && request.arguments.length === 0 && isTypeScriptStringLikeType(request.receiverType as Type | undefined)) {
    const returnType = csharpNamed("System.String");
    return {
      selectedSignature: {
        member: {
          id: "System.String.ToString()",
          sourceName,
          targetName: "ToString",
          kind: "method",
          static: false,
          parameters: [],
          returnType,
        },
      },
      returnType: {
        carrier: returnType,
      } satisfies RuntimeCarrierFact,
    };
  }
  if (sourceName === "join") {
    return resolveArrayJoinMethodCall(sourceName, request, context);
  }
  return undefined;
}

function resolveArrayJoinMethodCall(
  sourceName: string,
  request: ResolveCallRequest,
  context: ExtensionDecisionContext,
): ResolveCallResult | undefined {
  if (request.arguments.length !== 1) {
    return undefined;
  }
  const separatorType = csharpNamed("System.String");
  const separatorCarrier = resolveCallArgumentCarrier(request, 0, context);
  if (separatorCarrier === undefined || !targetTypeRefMatches(separatorCarrier, separatorType)) {
    return undefined;
  }
  const elementType = getTypeScriptArrayElementType(request.receiverType as Type | undefined);
  if (elementType === undefined) {
    return undefined;
  }
  const elementCarrier = context.factResolver.resolve(elementType, runtimeCarrierFactKey)?.carrier;
  if (elementCarrier === undefined) {
    return undefined;
  }
  const receiverType = {
    kind: "array",
    element: elementCarrier,
  } satisfies TargetTypeRef;
  const returnType = csharpNamed("System.String");
  return {
    selectedSignature: {
      member: {
        id: "System.String.Join(System.String,T[])",
        sourceName,
        targetName: "Join",
        kind: "method",
        static: true,
        declaringType: returnType,
        parameters: [
          { name: "separator", type: separatorType, passingMode: "by-value" },
          { name: "values", type: receiverType, passingMode: "by-value" },
        ],
        receiverArgumentIndex: 1,
        returnType,
      },
    },
    returnType: {
      carrier: returnType,
    } satisfies RuntimeCarrierFact,
  };
}

function resolveProviderTargetConstructorCall(
  request: ResolveCallRequest,
  context: ExtensionDecisionContext,
): ResolveCallResult | undefined {
  if (!isNodeSubject(request.call) || request.call.Kind !== KindNewExpression) {
    return undefined;
  }
  const targetBinding = getTargetBindingFromSubject(context, request.calleeSymbol) ??
    getTargetBindingFromSubject(context, request.resolvedCalleeSymbol) ??
    getTargetBindingFromSubject(context, request.calleeType);
  if (targetBinding === undefined || targetBinding.kind !== "class") {
    return undefined;
  }
  const constructors = (targetBinding.members ?? [])
    .filter((member) => member.kind === "constructor" && targetMemberAcceptsCall(member, request, context));
  if (constructors.length !== 1) {
    return undefined;
  }
  const returnType = {
    kind: "target-named",
    id: targetBinding.id,
  } satisfies TargetTypeRef;
  return {
    selectedSignature: {
      member: {
        ...constructors[0]!,
        returnType,
      },
    },
    returnType: {
      carrier: returnType,
    } satisfies RuntimeCarrierFact,
  };
}

function resolveProviderTargetMethodCall(
  request: ResolveCallRequest,
  context: ExtensionDecisionContext,
): ResolveCallResult | undefined {
  if (!isNodeSubject(request.callee) || request.callee.Kind !== KindPropertyAccessExpression) {
    return undefined;
  }
  const propertyAccess = AsPropertyAccessExpression(request.callee);
  const receiver = propertyAccess?.Expression;
  const name = propertyAccess?.name;
  if (receiver === undefined || name === undefined) {
    return undefined;
  }
  const sourceName = Node_Text(name);
  if (sourceName.length === 0) {
    return undefined;
  }
  const member = selectProviderTargetMember(
    context,
    receiver,
    request.receiverSymbol,
    request.resolvedReceiverSymbol,
    request.receiverType,
    (member, staticAccess) =>
      member.kind === "method" &&
      memberStaticMatchesAccess(member, staticAccess) &&
      member.sourceName === sourceName &&
      targetMemberAcceptsCall(member, request, context),
  );
  if (member === undefined) {
    return undefined;
  }
  return {
    selectedSignature: { member },
    ...(member.returnType === undefined
      ? {}
      : {
        returnType: {
          carrier: member.returnType,
        } satisfies RuntimeCarrierFact,
      }),
  };
}

function resolveProviderTargetPropertyAccess(
  request: ResolvePropertyAccessRequest,
  context: ExtensionDecisionContext,
): ResolveOperationResult | undefined {
  const receiverNode = isNodeSubject(request.receiver) ? request.receiver : undefined;
  const member = selectProviderTargetMember(
    context,
    receiverNode,
    request.receiverSymbol,
    request.resolvedReceiverSymbol,
    request.receiverType,
    (member, staticAccess) =>
      (member.kind === "property" || member.kind === "field") &&
      memberStaticMatchesAccess(member, staticAccess) &&
      member.sourceName === request.propertyName,
  );
  if (member === undefined) {
    return undefined;
  }
  const operation = {
    operationId: member.id,
    operationKind: "property",
    targetOperation: member.targetName,
    ...(member.static !== undefined ? { static: member.static } : {}),
    ...(member.declaringType !== undefined ? { declaringType: member.declaringType } : {}),
    ...(member.returnType !== undefined ? { resultType: member.returnType } : {}),
  } satisfies TargetOperationFact;
  return {
    operation,
    ...(member.returnType !== undefined ? { resultType: member.returnType } : {}),
  };
}

function resolveSourceProjectPropertyAccess(
  request: ResolvePropertyAccessRequest,
): ResolveOperationResult | undefined {
  const receiverType = request.receiverType !== undefined && isTypeSubject(request.receiverType)
    ? request.receiverType
    : undefined;
  const effectiveReceiverType = getSingleNonNullishUnionType(receiverType) ?? receiverType;
  const sourceTypeName = getSourceProjectShapeName(effectiveReceiverType?.symbol);
  const propertyTargetName = getSourceProjectPropertyTargetName(request);
  if (sourceTypeName === undefined || propertyTargetName === undefined) {
    return undefined;
  }
  return {
    operation: {
      operationId: `tsonic.csharp.source.${sourceTypeName}.${request.propertyName}`,
      operationKind: "property",
      targetOperation: propertyTargetName,
    } satisfies TargetOperationFact,
  };
}

function getSourceProjectPropertyTargetName(request: ResolvePropertyAccessRequest): string | undefined {
  const symbol = firstSourceProjectPropertySymbol([
    request.propertySymbol,
    request.resolvedPropertySymbol,
  ]);
  if (symbol === undefined) {
    return undefined;
  }
  const sourceName = symbol.Name;
  if (sourceName !== request.propertyName) {
    return undefined;
  }
  return sanitizeCsharpIdentifier(sourceName);
}

function firstSourceProjectPropertySymbol(subjects: readonly (ExtensionFactSubject | undefined)[]): Symbol | undefined {
  for (const subject of subjects) {
    if (subject === undefined || !isSymbolSubject(subject)) {
      continue;
    }
    const declaration = sourceProjectPropertyDeclaration(subject);
    if (declaration !== undefined) {
      return subject;
    }
  }
  return undefined;
}

function sourceProjectPropertyDeclaration(symbol: Symbol): Node | undefined {
  const declaration = symbol.ValueDeclaration ?? symbol.Declarations?.find((candidate): candidate is Node => candidate !== undefined);
  if (
    declaration?.Kind !== KindPropertyDeclaration &&
    declaration?.Kind !== KindPropertySignature &&
    declaration?.Kind !== KindGetAccessor &&
    declaration?.Kind !== KindSetAccessor &&
    declaration?.Kind !== KindVariableDeclaration &&
    declaration?.Kind !== KindParameter &&
    declaration?.Kind !== KindBindingElement
  ) {
    return undefined;
  }
  return isDeclarationFileNode(declaration) ? undefined : declaration;
}

function selectProviderTargetMember(
  context: ExtensionDecisionContext,
  receiverNode: Node | undefined,
  receiverSymbol: ExtensionFactSubject | undefined,
  resolvedReceiverSymbol: ExtensionFactSubject | undefined,
  receiverType: ExtensionFactSubject | undefined,
  predicate: (member: TargetMember, staticAccess: boolean) => boolean,
): TargetMember | undefined {
  const matches: TargetMember[] = [];
  for (const candidate of getTargetBindingAccessCandidates(context, receiverNode, receiverSymbol, resolvedReceiverSymbol, receiverType)) {
    for (const member of candidate.binding.members ?? []) {
      if (predicate(member, candidate.staticAccess) && !matches.some((existing) => existing.id === member.id && existing.static === member.static)) {
        matches.push(member);
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function getTargetBindingAccessCandidates(
  context: ExtensionDecisionContext,
  receiverNode: Node | undefined,
  receiverSymbol: ExtensionFactSubject | undefined,
  resolvedReceiverSymbol: ExtensionFactSubject | undefined,
  receiverType: ExtensionFactSubject | undefined,
): readonly TargetBindingAccess[] {
  const candidates: TargetBindingAccess[] = [];
  const staticBinding = getFirstTargetBinding(context, [
    receiverNode === undefined ? undefined : Node_Symbol(receiverNode),
    receiverSymbol,
    resolvedReceiverSymbol,
  ]);
  if (staticBinding !== undefined) {
    candidates.push({
      binding: staticBinding,
      staticAccess: true,
    });
  }
  const typeBinding = getTargetBindingFromSubject(context, receiverType);
  if (typeBinding !== undefined) {
    candidates.push({
      binding: typeBinding,
      staticAccess: true,
    });
    candidates.push({
      binding: typeBinding,
      staticAccess: false,
    });
  }
  return candidates;
}

function getFirstTargetBinding(
  context: ExtensionDecisionContext,
  subjects: readonly (ExtensionFactSubject | undefined)[],
): TargetBindingFact | undefined {
  for (const subject of subjects) {
    const binding = getTargetBindingFromSubject(context, subject);
    if (binding !== undefined) {
      return binding;
    }
  }
  return undefined;
}

function memberStaticMatchesAccess(member: TargetMember, staticAccess: boolean): boolean {
  return staticAccess ? member.static === true : member.static !== true;
}

function getTargetBindingFromSubject(
  context: ExtensionDecisionContext,
  subject: ExtensionFactSubject | undefined,
): TargetBindingFact | undefined {
  if (subject === undefined) {
    return undefined;
  }
  const direct = context.facts.get(subject, targetBindingFactKey);
  if (direct !== undefined) {
    return direct;
  }
  return isTypeSubject(subject)
    ? context.facts.get(subject.symbol, targetBindingFactKey)
    : undefined;
}

function targetMemberAcceptsArity(member: TargetMember, argumentCount: number): boolean {
  const parameters = getSourceVisibleParameters(member);
  if (parameters === undefined) {
    return false;
  }
  const required = parameters.filter((parameter) => parameter.optional !== true && parameter.paramsArray !== true).length;
  if (parameters.some((parameter) => parameter.paramsArray === true)) {
    return argumentCount >= required;
  }
  return argumentCount >= required && argumentCount <= parameters.length;
}

function targetMemberAcceptsCall(
  member: TargetMember,
  request: Pick<ResolveCallRequest, "arguments" | "argumentSymbols" | "resolvedArgumentSymbols" | "argumentTypes">,
  context: ExtensionDecisionContext,
): boolean {
  if (!targetMemberAcceptsArity(member, request.arguments.length)) {
    return false;
  }
  for (let index = 0; index < request.arguments.length; index += 1) {
    const parameter = getTargetParameterForArgument(member, index);
    if (parameter === undefined) {
      return false;
    }
    const argumentCarrier = resolveCallArgumentCarrier(request, index, context);
    if (argumentCarrier === undefined || !targetTypeRefMatches(argumentCarrier, parameter.type)) {
      return false;
    }
  }
  return true;
}

function resolveCallArgumentCarrier(
  request: Pick<ResolveCallRequest, "arguments" | "argumentSymbols" | "resolvedArgumentSymbols" | "argumentTypes">,
  index: number,
  context: ExtensionDecisionContext,
): TargetTypeRef | undefined {
  const argument = request.arguments[index];
  const argumentSymbol = request.argumentSymbols?.[index];
  const resolvedArgumentSymbol = request.resolvedArgumentSymbols?.[index];
  const argumentType = request.argumentTypes?.[index];
  return resolveFirstRuntimeCarrier([
    argument,
    argumentSymbol,
    resolvedArgumentSymbol,
    argumentType,
  ], context);
}

function getTargetParameterForArgument(member: TargetMember, index: number): TargetMember["parameters"][number] | undefined {
  const parameters = getSourceVisibleParameters(member);
  if (parameters === undefined) {
    return undefined;
  }
  const direct = parameters[index];
  if (direct !== undefined) {
    return direct;
  }
  const last = parameters[parameters.length - 1];
  return last?.paramsArray === true ? last : undefined;
}

function getSourceVisibleParameters(member: TargetMember): readonly TargetMember["parameters"][number][] | undefined {
  const receiverArgumentIndex = member.receiverArgumentIndex;
  if (receiverArgumentIndex === undefined) {
    return member.parameters;
  }
  if (!Number.isInteger(receiverArgumentIndex) || receiverArgumentIndex < 0 || receiverArgumentIndex >= member.parameters.length) {
    return undefined;
  }
  return member.parameters.filter((_, index) => index !== receiverArgumentIndex);
}

function targetTypeRefMatches(actual: TargetTypeRef, expected: TargetTypeRef): boolean {
  const actualKey = targetTypeRefKey(actual);
  const expectedKey = targetTypeRefKey(expected);
  return actualKey !== undefined && actualKey === expectedKey;
}

function targetTypeRefKey(type: TargetTypeRef): string | undefined {
  switch (type.kind) {
    case "source-primitive":
      return `target:${sourcePrimitiveTargetId(type.name)}`;
    case "target-named": {
      const typeArguments = targetTypeArgumentsKey(type.typeArguments);
      return typeArguments === undefined ? undefined : `target:${type.id}${typeArguments}`;
    }
    case "type-parameter":
      return `type-parameter:${type.name}`;
    case "nullable": {
      const inner = targetTypeRefKey(type.inner);
      return inner === undefined ? undefined : `nullable:${inner}`;
    }
    case "array": {
      const element = targetTypeRefKey(type.element);
      return element === undefined ? undefined : `array:${type.rank ?? 1}:${element}`;
    }
    case "tuple": {
      const elements = type.elements.map(targetTypeRefKey);
      return elements.some((element) => element === undefined)
        ? undefined
        : `tuple:${elements.join(",")}`;
    }
    default:
      return undefined;
  }
}

function targetTypeArgumentsKey(typeArguments: readonly TargetTypeRef[] | undefined): string | undefined {
  if (typeArguments === undefined || typeArguments.length === 0) {
    return "";
  }
  const keys = typeArguments.map(targetTypeRefKey);
  return keys.some((key) => key === undefined) ? undefined : `<${keys.join(",")}>`;
}

function sourcePrimitiveTargetId(kind: SourcePrimitiveKind): string {
  switch (kind) {
    case "bool":
      return "System.Boolean";
    case "char16":
      return "System.Char";
    case "char32":
      return "System.Text.Rune";
    case "int8":
      return "System.SByte";
    case "uint8":
      return "System.Byte";
    case "int16":
      return "System.Int16";
    case "uint16":
      return "System.UInt16";
    case "int32":
      return "System.Int32";
    case "uint32":
      return "System.UInt32";
    case "int64":
      return "System.Int64";
    case "uint64":
      return "System.UInt64";
    case "native-int":
      return "System.IntPtr";
    case "native-uint":
      return "System.UIntPtr";
    case "float16":
      return "System.Half";
    case "float32":
      return "System.Single";
    case "float64":
      return "System.Double";
    case "decimal128":
      return "System.Decimal";
    case "int128":
      return "System.Int128";
    case "uint128":
      return "System.UInt128";
  }
}

function getCallCalleeSourceName(callee: ExtensionFactSubject): string | undefined {
  if (!isNodeSubject(callee)) {
    return undefined;
  }
  if (callee.Kind === KindIdentifier) {
    const sourceName = Node_Text(callee);
    return sourceName.length === 0 ? undefined : sourceName;
  }
  if (callee.Kind === KindPropertyAccessExpression) {
    const name = Node_Name(callee);
    if (name === undefined) {
      return undefined;
    }
    const sourceName = Node_Text(name);
    return sourceName.length === 0 ? undefined : sourceName;
  }
  return undefined;
}

function sourcePrimitiveInt32(): SourcePrimitiveFact {
  return {
    kind: "int32",
    runtimeBase: "number",
    signed: true,
    width: 32,
  };
}

function resolveCsharpRuntimeCarrier(
  subject: ExtensionFactSubject,
  context: ExtensionFactResolverContext,
): { readonly value: RuntimeCarrierFact; readonly evidence?: readonly ExtensionEvidence[] } | undefined {
  const sourcePrimitiveFact = context.factResolver.resolve(subject, sourcePrimitiveFactKey);
  if (sourcePrimitiveFact !== undefined) {
    return {
      value: {
        carrier: {
          kind: "source-primitive",
          name: sourcePrimitiveFact.kind,
        },
      },
      evidence: [{ message: `C# carrier from source primitive '${sourcePrimitiveFact.kind}'.` }],
    };
  }

  const pointerCarrier = resolveCsharpPointerCarrier(subject, context);
  if (pointerCarrier !== undefined) {
    return {
      value: { carrier: pointerCarrier },
      evidence: [{ message: "C# carrier from source pointer/function-pointer fact." }],
    };
  }

  if (isNodeSubject(subject)) {
    const catchCarrier = resolveCsharpCatchVariableCarrier(subject);
    if (catchCarrier !== undefined) {
      return {
        value: { carrier: catchCarrier },
        evidence: [{ message: "C# catch binding carrier from target exception model." }],
      };
    }
  }

  const directTargetBinding = context.facts.get(subject, targetBindingFactKey);
  if (directTargetBinding !== undefined) {
    return runtimeCarrierFromTargetBinding(directTargetBinding.id);
  }

  if (isNodeSubject(subject)) {
    const nodeCarrier = resolveCsharpRuntimeCarrierForTypeNode(subject, context);
    if (nodeCarrier !== undefined) {
      return {
        value: { carrier: nodeCarrier },
        evidence: [{ message: "C# carrier from TypeScript type syntax." }],
      };
    }
    const nodeSymbol = Node_Symbol(subject);
    const nodeSymbolCarrier = nodeSymbol === undefined ? undefined : resolveCsharpRuntimeCarrierForSymbol(nodeSymbol, context);
    if (nodeSymbolCarrier !== undefined) {
      return {
        value: { carrier: nodeSymbolCarrier },
        evidence: [{ message: "C# carrier from source declaration annotation." }],
      };
    }
  }

  if (isSymbolSubject(subject)) {
    const symbolCarrier = resolveCsharpRuntimeCarrierForSymbol(subject, context);
    if (symbolCarrier !== undefined) {
      return {
        value: { carrier: symbolCarrier },
        evidence: [{ message: "C# carrier from source declaration annotation." }],
      };
    }
  }

  if (isTypeSubject(subject)) {
    const typeCarrier = resolveCsharpRuntimeCarrierForTstsType(subject, context);
    if (typeCarrier !== undefined) {
      return {
        value: { carrier: typeCarrier },
        evidence: [{ message: "C# carrier from TSTS semantic type." }],
      };
    }
  }

  return undefined;
}

function resolveCsharpPointerCarrier(
  subject: ExtensionFactSubject,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  const pointer = context.facts.get(subject, pointerFactKey);
  if (pointer !== undefined) {
    return pointerFactToTargetTypeRef(pointer, context);
  }
  const functionPointer = context.facts.get(subject, functionPointerFactKey);
  return functionPointer === undefined
    ? undefined
    : functionPointerFactToTargetTypeRef(functionPointer, context);
}

function pointerFactToTargetTypeRef(
  pointer: PointerFact,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  const pointee = context.factResolver.resolve(pointer.pointee, runtimeCarrierFactKey)?.carrier;
  return pointee === undefined
    ? undefined
    : { kind: "pointer", pointee, mutability: targetPointerMutability(pointer.mutability) };
}

function targetPointerMutability(mutability: PointerFact["mutability"]): Extract<TargetTypeRef, { readonly kind: "pointer" }>["mutability"] {
  switch (mutability) {
    case "readonly":
      return "const";
    case "readwrite":
      return "mut";
    case "target-defined":
      return "target-defined";
  }
}

function functionPointerFactToTargetTypeRef(
  pointer: FunctionPointerFact,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  const args = pointer.parameters.map((parameter) => context.factResolver.resolve(parameter, runtimeCarrierFactKey)?.carrier);
  const result = context.factResolver.resolve(pointer.result, runtimeCarrierFactKey)?.carrier;
  return result === undefined || args.some((argument) => argument === undefined)
    ? undefined
    : {
      kind: "function-pointer",
      args: args as readonly TargetTypeRef[],
      result,
      abi: pointer.abi,
    };
}

function runtimeCarrierFromTargetBinding(id: string): { readonly value: RuntimeCarrierFact; readonly evidence?: readonly ExtensionEvidence[] } {
  return {
    value: {
      carrier: {
        kind: "target-named",
        id,
      },
    },
    evidence: [{ message: `C# carrier from target binding '${id}'.` }],
  };
}

function resolveCsharpObjectShape(
  subject: ExtensionFactSubject,
  context: ExtensionFactResolverContext,
): { readonly value: ObjectShapeFact; readonly evidence?: readonly ExtensionEvidence[] } | undefined {
  const shapeSubject = getObjectShapeSubject(subject, context);
  if (shapeSubject === undefined) {
    return undefined;
  }
  const members = resolveCsharpObjectShapeMembers(shapeSubject.declaration, context, shapeSubject.typeParameterSubstitutions);
  if (members === undefined) {
    return undefined;
  }
  const implementedContracts = shapeSubject.implementedContract === undefined
    ? undefined
    : [shapeSubject.implementedContract];
  return {
    value: {
      targetType: {
        kind: "target-named",
        id: csharpObjectShapeId(shapeSubject),
      },
      members,
      ...(implementedContracts === undefined ? {} : { implements: implementedContracts }),
      constructible: true,
    },
    evidence: [{ message: shapeSubject.evidenceMessage }],
  };
}

interface CsharpObjectShapeSubject {
  readonly declaration: Node;
  readonly implementedContract?: TargetTypeRef;
  readonly typeParameterSubstitutions?: ReadonlyMap<string, TargetTypeRef>;
  readonly evidenceMessage: string;
}

function getObjectShapeSubject(
  subject: ExtensionFactSubject,
  context: ExtensionFactResolverContext,
): CsharpObjectShapeSubject | undefined {
  if (isNodeSubject(subject)) {
    return getObjectShapeDeclarationSubject(subject, context, undefined);
  }
  if (isTypeSubject(subject)) {
    const typeReference = getTypeScriptTypeReferenceInfo(subject);
    const symbol = typeReference?.targetSymbol ?? subject.symbol;
    const declaration = symbol?.ValueDeclaration ?? symbol?.Declarations?.find((candidate): candidate is Node => candidate !== undefined);
    return declaration === undefined ? undefined : getObjectShapeDeclarationSubject(declaration, context, subject);
  }
  return undefined;
}

function getObjectShapeDeclarationSubject(
  declaration: Node,
  context: ExtensionFactResolverContext,
  semanticType: Type | undefined,
): CsharpObjectShapeSubject | undefined {
  if (declaration.Kind === KindTypeLiteral) {
    return {
      declaration,
      evidenceMessage: "C# structural object carrier from TypeScript type literal.",
    };
  }
  if (declaration.Kind !== KindInterfaceDeclaration) {
    return undefined;
  }
  const interfaceDeclaration = AsInterfaceDeclaration(declaration);
  const typeParameters = interfaceDeclaration?.TypeParameters?.Nodes ?? [];
  const concreteTypeParameters = typeParameters.filter((typeParameter): typeParameter is Node => typeParameter !== undefined);
  const genericSpecialization = concreteTypeParameters.length === 0
    ? { substitutions: undefined, typeArguments: undefined }
    : resolveInterfaceObjectShapeSpecialization(concreteTypeParameters, semanticType, context);
  if (genericSpecialization === undefined) {
    return undefined;
  }
  const name = getCsharpObjectShapeDeclarationName(declaration);
  if (name === undefined) {
    return undefined;
  }
  return {
    declaration,
    implementedContract: {
      kind: "target-named",
      id: sanitizeCsharpIdentifier(name),
      ...(genericSpecialization.typeArguments === undefined ? {} : { typeArguments: genericSpecialization.typeArguments }),
    },
    ...(genericSpecialization.substitutions === undefined ? {} : { typeParameterSubstitutions: genericSpecialization.substitutions }),
    evidenceMessage: `C# structural object carrier implementing source interface '${name}'.`,
  };
}

function resolveInterfaceObjectShapeSpecialization(
  typeParameterNodes: readonly Node[],
  semanticType: Type | undefined,
  context: ExtensionFactResolverContext,
): { readonly substitutions: ReadonlyMap<string, TargetTypeRef>; readonly typeArguments: readonly TargetTypeRef[] } | undefined {
  if (semanticType === undefined) {
    return undefined;
  }
  const typeReference = getTypeScriptTypeReferenceInfo(semanticType);
  if (typeReference === undefined || typeReference.typeArguments.length !== typeParameterNodes.length) {
    return undefined;
  }
  const substitutions = new Map<string, TargetTypeRef>();
  const typeArguments: TargetTypeRef[] = [];
  for (let index = 0; index < typeParameterNodes.length; index += 1) {
    const parameter = AsTypeParameterDeclaration(typeParameterNodes[index]!);
    const parameterName = parameter?.name === undefined ? undefined : Node_Text(parameter.name);
    const argument = typeReference.typeArguments[index];
    const argumentCarrier = argument === undefined
      ? undefined
      : context.factResolver.resolve(argument, runtimeCarrierFactKey)?.carrier;
    if (parameterName === undefined || parameterName.length === 0 || argumentCarrier === undefined) {
      return undefined;
    }
    substitutions.set(parameterName, argumentCarrier);
    typeArguments.push(argumentCarrier);
  }
  return { substitutions, typeArguments };
}

function resolveCsharpObjectShapeMembers(
  typeLiteral: Node,
  context: ExtensionFactResolverContext,
  typeParameterSubstitutions: ReadonlyMap<string, TargetTypeRef> | undefined,
): readonly ObjectShapeMemberFact[] | undefined {
  const members = Node_Members(typeLiteral) ?? [];
  const shaped: ObjectShapeMemberFact[] = [];
  for (const member of members) {
    if (member === undefined || (member.Kind !== KindPropertySignature && member.Kind !== KindMethodSignature)) {
      return undefined;
    }
    const name = getCsharpObjectShapePropertyName(member);
    if (name === undefined) {
      return undefined;
    }
    const carrier = member.Kind === KindPropertySignature
      ? resolveObjectShapePropertyMemberCarrier(member, context, typeParameterSubstitutions)
      : resolveObjectShapeMethodMemberCarrier(member, context, typeParameterSubstitutions);
    if (carrier === undefined) {
      return undefined;
    }
    shaped.push({
      sourceName: name.sourceName,
      targetName: name.targetName,
      memberKind: member.Kind === KindMethodSignature ? "method" : "property",
      type: carrier,
    });
  }
  return shaped;
}

function resolveObjectShapePropertyMemberCarrier(
  member: Node,
  context: ExtensionFactResolverContext,
  typeParameterSubstitutions: ReadonlyMap<string, TargetTypeRef> | undefined,
): TargetTypeRef | undefined {
  const signature = AsPropertySignatureDeclaration(member);
  return signature?.Type === undefined
    ? undefined
    : resolveObjectShapeMemberCarrier(signature.Type, context, typeParameterSubstitutions);
}

function resolveObjectShapeMemberCarrier(
  typeNode: Node,
  context: ExtensionFactResolverContext,
  typeParameterSubstitutions: ReadonlyMap<string, TargetTypeRef> | undefined,
): TargetTypeRef | undefined {
  const substituted = getTypeParameterSubstitution(typeNode, typeParameterSubstitutions);
  if (substituted !== undefined) {
    return substituted;
  }
  switch (typeNode.Kind) {
    case KindArrayType: {
      const elementType = AsArrayTypeNode(typeNode)?.ElementType;
      const elementCarrier = elementType === undefined
        ? undefined
        : resolveObjectShapeMemberCarrier(elementType, context, typeParameterSubstitutions);
      return elementCarrier === undefined
        ? undefined
        : { kind: "array", element: elementCarrier };
    }
    case KindTupleType: {
      const elements = AsTupleTypeNode(typeNode)?.Elements?.Nodes ?? [];
      const elementCarriers = elements
        .filter((element): element is Node => element !== undefined)
        .map((element) => resolveObjectShapeMemberCarrier(element, context, typeParameterSubstitutions));
      return elementCarriers.some((element) => element === undefined)
        ? undefined
        : { kind: "tuple", elements: elementCarriers as readonly TargetTypeRef[] };
    }
    case KindFunctionType:
      return resolveObjectShapeFunctionMemberCarrier(typeNode, context, typeParameterSubstitutions);
    default: {
      const carrier = context.factResolver.resolve(typeNode, runtimeCarrierFactKey)?.carrier;
      return carrier === undefined
        ? undefined
        : substituteObjectShapeMemberType(carrier, typeParameterSubstitutions);
    }
  }
}

function resolveObjectShapeFunctionMemberCarrier(
  typeNode: Node,
  context: ExtensionFactResolverContext,
  typeParameterSubstitutions: ReadonlyMap<string, TargetTypeRef> | undefined,
): TargetTypeRef | undefined {
  const functionType = AsFunctionTypeNode(typeNode);
  if (functionType === undefined || (functionType.TypeParameters?.Nodes ?? []).some((typeParameter) => typeParameter !== undefined)) {
    return undefined;
  }
  const parameterCarriers: TargetTypeRef[] = [];
  for (const parameterNode of functionType.Parameters?.Nodes ?? []) {
    const parameter = parameterNode === undefined ? undefined : AsParameterDeclaration(parameterNode);
    if (parameter === undefined || parameter.DotDotDotToken !== undefined || parameter.QuestionToken !== undefined || parameter.Initializer !== undefined || parameter.Type === undefined) {
      return undefined;
    }
    const parameterCarrier = resolveObjectShapeMemberCarrier(parameter.Type, context, typeParameterSubstitutions);
    if (parameterCarrier === undefined) {
      return undefined;
    }
    parameterCarriers.push(parameterCarrier);
  }
  const returnCarrier = functionType.Type === undefined
    ? csharpNamed("System.Void")
    : resolveObjectShapeMemberCarrier(functionType.Type, context, typeParameterSubstitutions);
  if (returnCarrier === undefined) {
    return undefined;
  }
  return csharpDelegateTargetTypeRef(parameterCarriers, returnCarrier);
}

function resolveObjectShapeMethodMemberCarrier(
  methodNode: Node,
  context: ExtensionFactResolverContext,
  typeParameterSubstitutions: ReadonlyMap<string, TargetTypeRef> | undefined,
): TargetTypeRef | undefined {
  const method = AsMethodSignatureDeclaration(methodNode);
  if (method === undefined || (method.TypeParameters?.Nodes ?? []).some((typeParameter) => typeParameter !== undefined)) {
    return undefined;
  }
  const parameterCarriers: TargetTypeRef[] = [];
  for (const parameterNode of method.Parameters?.Nodes ?? []) {
    const parameter = parameterNode === undefined ? undefined : AsParameterDeclaration(parameterNode);
    if (parameter === undefined || parameter.DotDotDotToken !== undefined || parameter.QuestionToken !== undefined || parameter.Initializer !== undefined || parameter.Type === undefined) {
      return undefined;
    }
    const parameterCarrier = resolveObjectShapeMemberCarrier(parameter.Type, context, typeParameterSubstitutions);
    if (parameterCarrier === undefined) {
      return undefined;
    }
    parameterCarriers.push(parameterCarrier);
  }
  const returnCarrier = method.Type === undefined
    ? csharpNamed("System.Void")
    : resolveObjectShapeMemberCarrier(method.Type, context, typeParameterSubstitutions);
  return returnCarrier === undefined
    ? undefined
    : csharpDelegateTargetTypeRef(parameterCarriers, returnCarrier);
}

function getTypeParameterSubstitution(
  typeNode: Node,
  typeParameterSubstitutions: ReadonlyMap<string, TargetTypeRef> | undefined,
): TargetTypeRef | undefined {
  if (typeParameterSubstitutions === undefined || typeNode.Kind !== KindTypeReference) {
    return undefined;
  }
  const typeName = AsTypeReferenceNode(typeNode)?.TypeName;
  if (typeName?.Kind !== KindIdentifier) {
    return undefined;
  }
  return typeParameterSubstitutions.get(Node_Text(typeName));
}

function substituteObjectShapeMemberType(
  type: TargetTypeRef,
  substitutions: ReadonlyMap<string, TargetTypeRef> | undefined,
): TargetTypeRef {
  if (substitutions === undefined) {
    return type;
  }
  switch (type.kind) {
    case "type-parameter":
      return substitutions.get(type.name) ?? type;
    case "target-named": {
      const typeArguments = type.typeArguments?.map((argument) => substituteObjectShapeMemberType(argument, substitutions));
      return typeArguments === undefined ? type : { ...type, typeArguments };
    }
    case "nullable":
      return { ...type, inner: substituteObjectShapeMemberType(type.inner, substitutions) };
    case "array":
      return { ...type, element: substituteObjectShapeMemberType(type.element, substitutions) };
    case "tuple":
      return { ...type, elements: type.elements.map((element) => substituteObjectShapeMemberType(element, substitutions)) };
    case "pointer":
      return { ...type, pointee: substituteObjectShapeMemberType(type.pointee, substitutions) };
    case "function-pointer":
      return {
        ...type,
        args: type.args.map((argument) => substituteObjectShapeMemberType(argument, substitutions)),
        result: substituteObjectShapeMemberType(type.result, substitutions),
      };
    case "associated-type":
      return { ...type, owner: substituteObjectShapeMemberType(type.owner, substitutions) };
    default:
      return type;
  }
}

function getCsharpObjectShapePropertyName(member: Node): { readonly sourceName: string; readonly targetName: string } | undefined {
  const name = Node_Name(member);
  if (name === undefined) {
    return undefined;
  }
  if (name.Kind !== KindIdentifier && name.Kind !== KindStringLiteral) {
    return undefined;
  }
  const sourceName = Node_Text(name);
  if (sourceName.length === 0) {
    return undefined;
  }
  return {
    sourceName,
    targetName: sanitizeCsharpIdentifier(sourceName),
  };
}

function csharpObjectShapeId(shapeSubject: CsharpObjectShapeSubject): string {
  const node = shapeSubject.declaration;
  const sourceFile = GetSourceFileOfNode(node);
  const fileName = sourceFile === undefined ? "unknown" : SourceFile_FileName(sourceFile);
  const sourceName = getCsharpObjectShapeDeclarationName(node);
  const namePart = sourceName === undefined ? "" : `${sanitizeCsharpIdentifier(sourceName)}_`;
  const specializationPart = getObjectShapeSpecializationIdPart(shapeSubject);
  return `__TsonicShape_${namePart}${stableIdentifierHash(fileName)}_${Node_Pos(node)}${specializationPart}`;
}

function getObjectShapeSpecializationIdPart(shapeSubject: CsharpObjectShapeSubject): string {
  if (shapeSubject.implementedContract?.kind !== "target-named" || (shapeSubject.implementedContract.typeArguments ?? []).length === 0) {
    return "";
  }
  const key = targetTypeRefKey(shapeSubject.implementedContract);
  return key === undefined ? "" : `_${stableIdentifierHash(key)}`;
}

function getCsharpObjectShapeDeclarationName(node: Node): string | undefined {
  const name = Node_Name(node);
  return name === undefined || name.Kind !== KindIdentifier ? undefined : Node_Text(name);
}

function stableIdentifierHash(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(36);
}

function sanitizeCsharpIdentifier(text: string): string {
  const sanitized = text.replace(/[^A-Za-z0-9_]/g, "_");
  const prefixed = /^[A-Za-z_]/.test(sanitized) ? sanitized : `_${sanitized}`;
  return csharpReservedIdentifiers.has(prefixed) ? `@${prefixed}` : prefixed;
}

const csharpReservedIdentifiers = new Set([
  "abstract",
  "as",
  "base",
  "bool",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "checked",
  "class",
  "const",
  "continue",
  "decimal",
  "default",
  "delegate",
  "do",
  "double",
  "else",
  "enum",
  "event",
  "explicit",
  "extern",
  "false",
  "finally",
  "fixed",
  "float",
  "for",
  "foreach",
  "goto",
  "if",
  "implicit",
  "in",
  "int",
  "interface",
  "internal",
  "is",
  "lock",
  "long",
  "namespace",
  "new",
  "null",
  "object",
  "operator",
  "out",
  "override",
  "params",
  "private",
  "protected",
  "public",
  "readonly",
  "ref",
  "return",
  "sbyte",
  "sealed",
  "short",
  "sizeof",
  "stackalloc",
  "static",
  "string",
  "struct",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "uint",
  "ulong",
  "unchecked",
  "unsafe",
  "ushort",
  "using",
  "virtual",
  "void",
  "volatile",
  "while",
]);

function resolveCsharpCatchVariableCarrier(node: Node): TargetTypeRef | undefined {
  if (node.Kind === KindVariableDeclaration && node.Parent?.Kind === KindCatchClause) {
    return csharpNamed("System.Exception");
  }
  if (node.Kind === KindIdentifier && node.Parent?.Kind === KindVariableDeclaration && node.Parent.Parent?.Kind === KindCatchClause) {
    return csharpNamed("System.Exception");
  }
  return undefined;
}

function resolveCsharpRuntimeCarrierForSymbol(
  symbol: Symbol,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  const declaration = symbol.ValueDeclaration ?? symbol.Declarations?.find((candidate) => candidate !== undefined);
  const typeNode = declaration === undefined ? undefined : getRuntimeCarrierDeclarationTypeNode(declaration);
  return typeNode === undefined
    ? undefined
    : context.factResolver.resolve(typeNode, runtimeCarrierFactKey)?.carrier;
}

function getRuntimeCarrierDeclarationTypeNode(declaration: Node): Node | undefined {
  switch (declaration.Kind) {
    case KindVariableDeclaration:
    case KindParameter:
    case KindPropertyDeclaration:
    case KindBindingElement:
      return Node_Type(declaration);
    default:
      return undefined;
  }
}

function resolveCsharpRuntimeCarrierForTypeNode(
  node: Node,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  switch (node.Kind) {
    case KindStringKeyword:
      return csharpNamed("System.String");
    case KindNumberKeyword:
      return csharpNamed("System.Double");
    case KindBooleanKeyword:
      return csharpNamed("System.Boolean");
    case KindBigIntKeyword:
      return csharpNamed("System.Numerics.BigInteger");
    case KindVoidKeyword:
    case KindNeverKeyword:
      return csharpNamed("System.Void");
    case KindAnyKeyword:
    case KindUnknownKeyword:
      return undefined;
    case KindArrayType: {
      const elementType = AsArrayTypeNode(node)?.ElementType;
      const elementCarrier = elementType === undefined
        ? undefined
        : context.factResolver.resolve(elementType, runtimeCarrierFactKey)?.carrier;
      return elementCarrier === undefined
        ? undefined
        : { kind: "array", element: elementCarrier };
    }
    case KindTupleType: {
      const elements = AsTupleTypeNode(node)?.Elements?.Nodes ?? [];
      const elementCarriers = elements
        .filter((element): element is Node => element !== undefined)
        .map((element) => context.factResolver.resolve(element, runtimeCarrierFactKey)?.carrier);
      return elementCarriers.some((element) => element === undefined)
        ? undefined
        : { kind: "tuple", elements: elementCarriers as readonly TargetTypeRef[] };
    }
    case KindFunctionType:
      return resolveCsharpFunctionTypeCarrier(node, context);
    default:
      return undefined;
  }
}

function resolveCsharpFunctionTypeCarrier(
  node: Node,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  const functionType = AsFunctionTypeNode(node);
  if (functionType === undefined || (functionType.TypeParameters?.Nodes ?? []).some((typeParameter) => typeParameter !== undefined)) {
    return undefined;
  }
  const parameters = functionType.Parameters?.Nodes ?? [];
  const parameterTypes: TargetTypeRef[] = [];
  for (const parameter of parameters) {
    const declaration = parameter === undefined ? undefined : AsParameterDeclaration(parameter);
    if (declaration === undefined || declaration.DotDotDotToken !== undefined || declaration.QuestionToken !== undefined || declaration.Initializer !== undefined || declaration.Type === undefined) {
      return undefined;
    }
    const carrier = context.factResolver.resolve(declaration.Type, runtimeCarrierFactKey)?.carrier;
    if (carrier === undefined) {
      return undefined;
    }
    parameterTypes.push(carrier);
  }
  const returnCarrier = functionType.Type === undefined
    ? csharpNamed("System.Void")
    : context.factResolver.resolve(functionType.Type, runtimeCarrierFactKey)?.carrier;
  if (returnCarrier === undefined) {
    return undefined;
  }
  return csharpDelegateTargetTypeRef(parameterTypes, returnCarrier);
}

function resolveCsharpRuntimeCarrierForTstsType(
  type: Type,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  const targetBinding = context.facts.get(type.symbol, targetBindingFactKey);
  if (targetBinding !== undefined) {
    return {
      kind: "target-named",
      id: targetBinding.id,
    };
  }
  const nullableUnionCarrier = resolveNullableUnionCarrierForTstsType(type, context);
  if (nullableUnionCarrier !== undefined) {
    return nullableUnionCarrier;
  }
  const arrayElementType = getTypeScriptArrayElementType(type);
  if (arrayElementType !== undefined) {
    const elementCarrier = context.factResolver.resolve(arrayElementType, runtimeCarrierFactKey)?.carrier;
    return elementCarrier === undefined
      ? undefined
      : { kind: "array", element: elementCarrier };
  }
  const callSignatureCarrier = resolveCsharpRuntimeCarrierForCallSignature(type, context);
  if (callSignatureCarrier !== undefined) {
    return callSignatureCarrier;
  }
  const typeReference = getTypeScriptTypeReferenceInfo(type);
  if (typeReference !== undefined) {
    const promiseCarrier = resolveStandardPromiseCarrier(typeReference, context);
    if (promiseCarrier !== undefined) {
      return promiseCarrier;
    }
    const referenceBinding = context.facts.get(typeReference.targetSymbol, targetBindingFactKey);
    if (referenceBinding !== undefined) {
      const typeArguments = typeReference.typeArguments
        .map((argument) => context.factResolver.resolve(argument, runtimeCarrierFactKey)?.carrier);
      if (typeArguments.some((argument) => argument === undefined)) {
        return undefined;
      }
      return {
        kind: "target-named",
        id: referenceBinding.id,
        typeArguments: typeArguments as readonly TargetTypeRef[],
      };
    }
  }
  const sourceProjectCarrier = resolveCsharpSourceProjectTypeCarrier(type, context);
  if (sourceProjectCarrier !== undefined) {
    return sourceProjectCarrier;
  }
  if ((type.flags & (TypeFlagsAny | TypeFlagsUnknown)) !== 0) {
    return undefined;
  }
  if ((type.flags & TypeFlagsTypeParameter) !== 0 && type.symbol?.Name !== undefined && type.symbol.Name.length > 0) {
    return {
      kind: "type-parameter",
      name: type.symbol.Name,
    };
  }
  if (isSourceEnumType(type)) {
    return undefined;
  }
  if ((type.flags & TypeFlagsStringLike) !== 0) {
    return csharpNamed("System.String");
  }
  if ((type.flags & TypeFlagsBooleanLike) !== 0) {
    return csharpNamed("System.Boolean");
  }
  if ((type.flags & TypeFlagsBigIntLike) !== 0) {
    return csharpNamed("System.Numerics.BigInteger");
  }
  if ((type.flags & TypeFlagsNumberLike) !== 0) {
    return csharpNamed("System.Double");
  }
  if ((type.flags & (TypeFlagsVoidLike | TypeFlagsNever)) !== 0) {
    return csharpNamed("System.Void");
  }
  return undefined;
}

function resolveStandardPromiseCarrier(
  typeReference: NonNullable<ReturnType<typeof getTypeScriptTypeReferenceInfo>>,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  if (!isStandardPromiseSymbol(typeReference.targetSymbol) || typeReference.typeArguments.length !== 1) {
    return undefined;
  }
  const promisedType = typeReference.typeArguments[0];
  const promisedCarrier = promisedType === undefined
    ? undefined
    : context.factResolver.resolve(promisedType, runtimeCarrierFactKey)?.carrier;
  if (promisedCarrier === undefined) {
    return undefined;
  }
  if (isVoidTargetType(promisedCarrier)) {
    return csharpNamed("System.Threading.Tasks.Task");
  }
  return {
    kind: "target-named",
    id: "System.Threading.Tasks.Task`1",
    typeArguments: [promisedCarrier],
  };
}

function isStandardPromiseSymbol(symbol: Symbol | undefined): boolean {
  if (symbol?.Name !== "Promise") {
    return false;
  }
  return (symbol.Declarations ?? []).some((declaration) => {
    const sourceFile = declaration === undefined ? undefined : GetSourceFileOfNode(declaration);
    return sourceFile !== undefined &&
      sourceFile.IsDeclarationFile &&
      SourceFile_FileName(sourceFile).endsWith("lib.es2015.promise.d.ts");
  });
}

function resolveCsharpSourceProjectTypeCarrier(
  type: Type,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  const typeReference = getTypeScriptTypeReferenceInfo(type);
  const symbol = typeReference?.targetSymbol ?? type.symbol;
  const sourceName = getSourceProjectTypeName(symbol);
  if (sourceName === undefined) {
    return undefined;
  }
  const typeArgumentNodes = typeReference?.typeArguments ?? [];
  if (typeArgumentNodes.length === 0) {
    return csharpNamed(sourceName);
  }
  const typeArguments = typeArgumentNodes
    .map((argument) => context.factResolver.resolve(argument, runtimeCarrierFactKey)?.carrier);
  if (typeArguments.some((argument) => argument === undefined)) {
    return undefined;
  }
  return {
    kind: "target-named",
    id: sourceName,
    typeArguments: typeArguments as readonly TargetTypeRef[],
  };
}

function getSourceProjectTypeName(symbol: Symbol | undefined): string | undefined {
  const declaration = symbol?.ValueDeclaration ?? symbol?.Declarations?.find((candidate) => candidate !== undefined);
  if (
    declaration?.Kind !== KindClassDeclaration &&
    declaration?.Kind !== KindInterfaceDeclaration &&
    declaration?.Kind !== KindEnumDeclaration
  ) {
    return undefined;
  }
  const sourceFile = GetSourceFileOfNode(declaration);
  if (sourceFile === undefined || sourceFile.IsDeclarationFile) {
    return undefined;
  }
  const fileName = SourceFile_FileName(sourceFile);
  if (fileName.startsWith("tsts-provider://")) {
    return undefined;
  }
  const name = symbol?.Name;
  return name === undefined || name.length === 0 ? undefined : sanitizeCsharpIdentifier(name);
}

function getSourceProjectShapeName(symbol: Symbol | undefined): string | undefined {
  const declaration = symbol?.ValueDeclaration ?? symbol?.Declarations?.find((candidate) => candidate !== undefined);
  if (
    declaration?.Kind !== KindClassDeclaration &&
    declaration?.Kind !== KindInterfaceDeclaration
  ) {
    return undefined;
  }
  const sourceFile = GetSourceFileOfNode(declaration);
  if (sourceFile === undefined || sourceFile.IsDeclarationFile) {
    return undefined;
  }
  const fileName = SourceFile_FileName(sourceFile);
  if (fileName.startsWith("tsts-provider://")) {
    return undefined;
  }
  const name = symbol?.Name;
  return name === undefined || name.length === 0 ? undefined : sanitizeCsharpIdentifier(name);
}

function getSourceProjectClassName(symbol: Symbol | undefined): string | undefined {
  const declaration = symbol?.ValueDeclaration ?? symbol?.Declarations?.find((candidate) => candidate !== undefined);
  if (declaration?.Kind !== KindClassDeclaration) {
    return undefined;
  }
  const sourceFile = GetSourceFileOfNode(declaration);
  if (sourceFile === undefined || sourceFile.IsDeclarationFile) {
    return undefined;
  }
  const fileName = SourceFile_FileName(sourceFile);
  if (fileName.startsWith("tsts-provider://")) {
    return undefined;
  }
  const name = symbol?.Name;
  return name === undefined || name.length === 0 ? undefined : sanitizeCsharpIdentifier(name);
}

function resolveNullableUnionCarrierForTstsType(
  type: Type,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  const unionTypes = getTypeScriptUnionTypes(type);
  if (unionTypes === undefined) {
    return undefined;
  }
  const nonNullishTypes = unionTypes.filter((unionType) => !isTypeScriptNullishType(unionType));
  if (nonNullishTypes.length !== 1 || nonNullishTypes.length === unionTypes.length) {
    return undefined;
  }
  const inner = context.factResolver.resolve(nonNullishTypes[0]!, runtimeCarrierFactKey)?.carrier;
  return inner === undefined ? undefined : nullableTargetType(inner);
}

function nullableTargetType(inner: TargetTypeRef): TargetTypeRef | undefined {
  if (inner.kind === "type-parameter" || isVoidTargetType(inner)) {
    return undefined;
  }
  return {
    kind: "nullable",
    inner,
  };
}

function csharpNamed(id: string): TargetTypeRef {
  return {
    kind: "target-named",
    id,
  };
}

function isVoidTargetType(type: TargetTypeRef): boolean {
  return type.kind === "target-named" && type.id === "System.Void";
}

function isNodeSubject(subject: ExtensionFactSubject): subject is Node {
  return typeof subject === "object" &&
    subject !== null &&
    typeof (subject as { readonly Kind?: unknown }).Kind === "number";
}

function isSymbolSubject(subject: ExtensionFactSubject): subject is Symbol {
  return typeof subject === "object" &&
    subject !== null &&
    typeof (subject as { readonly Name?: unknown }).Name === "string" &&
    ("Declarations" in subject || "ValueDeclaration" in subject);
}

function isTypeSubject(subject: ExtensionFactSubject): subject is Type {
  return typeof subject === "object" &&
    subject !== null &&
    typeof (subject as { readonly flags?: unknown }).flags === "number";
}

function resolveCsharpRuntimeCarrierForCallSignature(
  type: Type,
  context: ExtensionFactResolverContext,
): TargetTypeRef | undefined {
  const signature = getSingleTypeScriptCallSignatureInfo(type);
  if (signature === undefined || signature.hasRestParameter || signature.returnType === undefined) {
    return undefined;
  }
  const parameterTypes = signature.parameterTypes
    .map((parameterType) => context.factResolver.resolve(parameterType, runtimeCarrierFactKey)?.carrier);
  if (parameterTypes.some((parameterType) => parameterType === undefined)) {
    return undefined;
  }
  const returnType = context.factResolver.resolve(signature.returnType, runtimeCarrierFactKey)?.carrier;
  if (returnType === undefined) {
    return undefined;
  }
  return csharpDelegateTargetTypeRef(parameterTypes as readonly TargetTypeRef[], returnType);
}

function csharpDelegateTargetTypeRef(
  parameterTypes: readonly TargetTypeRef[],
  returnType: TargetTypeRef,
): TargetTypeRef {
  if (isVoidTargetType(returnType)) {
    return {
      kind: "target-named",
      id: `System.Action\`${parameterTypes.length}`,
      typeArguments: parameterTypes,
    };
  }
  return {
    kind: "target-named",
    id: `System.Func\`${parameterTypes.length + 1}`,
    typeArguments: [...parameterTypes, returnType],
  };
}

function isSourceEnumType(type: Type): boolean {
  const declaration = type.symbol?.ValueDeclaration ?? type.symbol?.Declarations?.find((candidate) => candidate !== undefined);
  return declaration?.Kind === KindEnumDeclaration || declaration?.Kind === KindEnumMember;
}

function resolveCsharpOperator(
  request: ResolveOperatorRequest,
  context: ExtensionDecisionContext,
): ResolveOperationResult | undefined {
  return resolveTypeofComparisonOperator(request, context) ??
    resolveSourceProjectInstanceOfOperator(request) ??
    resolveSourcePrimitiveOperator(request, context) ??
    resolveBuiltinTypeOperator(request);
}

function resolveTypeofComparisonOperator(
  request: ResolveOperatorRequest,
  context: ExtensionDecisionContext,
): ResolveOperationResult | undefined {
  const comparison = getTypeofComparison(request);
  if (comparison === undefined) {
    return undefined;
  }
  const operandCarrier = resolveFirstRuntimeCarrier([
    comparison.operand,
    comparison.operandSymbol,
    comparison.operandType,
  ], context);
  const targetType = getTypeofPatternTargetType(operandCarrier, comparison.runtimeKind);
  if (targetType === undefined) {
    return undefined;
  }
  const resultType = csharpNamed("System.Boolean");
  return {
    operation: {
      operationId: `tsonic.csharp.typeof.${comparison.runtimeKind}.${comparison.negated ? "not" : "is"}`,
      operationKind: "operator",
      targetOperation: comparison.negated ? "typeof-is-not" : "typeof-is",
      targetType,
      resultType,
    } satisfies TargetOperationFact,
    resultType,
  };
}

type TypeofRuntimeKind = "string" | "number" | "boolean" | "bigint";

interface TypeofComparison {
  readonly operand: ExtensionFactSubject;
  readonly operandType?: ExtensionFactSubject;
  readonly operandSymbol?: ExtensionFactSubject;
  readonly runtimeKind: TypeofRuntimeKind;
  readonly negated: boolean;
}

function getTypeofComparison(request: ResolveOperatorRequest): TypeofComparison | undefined {
  const negated = getTypeofNegation(request.operator);
  if (negated === undefined) {
    return undefined;
  }
  const rightRuntimeKind = getTypeofRuntimeKindLiteral(request.right);
  if (request.leftTypeofOperand !== undefined && rightRuntimeKind !== undefined) {
    return {
      operand: request.leftTypeofOperand,
      ...(request.leftTypeofOperandType !== undefined ? { operandType: request.leftTypeofOperandType } : {}),
      ...(request.leftTypeofOperandSymbol !== undefined ? { operandSymbol: request.leftTypeofOperandSymbol } : {}),
      runtimeKind: rightRuntimeKind,
      negated,
    };
  }
  const leftRuntimeKind = getTypeofRuntimeKindLiteral(request.left);
  if (request.rightTypeofOperand !== undefined && leftRuntimeKind !== undefined) {
    return {
      operand: request.rightTypeofOperand,
      ...(request.rightTypeofOperandType !== undefined ? { operandType: request.rightTypeofOperandType } : {}),
      ...(request.rightTypeofOperandSymbol !== undefined ? { operandSymbol: request.rightTypeofOperandSymbol } : {}),
      runtimeKind: leftRuntimeKind,
      negated,
    };
  }
  return undefined;
}

function getTypeofNegation(operator: string): boolean | undefined {
  switch (operator) {
    case "==":
    case "===":
      return false;
    case "!=":
    case "!==":
      return true;
    default:
      return undefined;
  }
}

function getTypeofRuntimeKindLiteral(subject: ExtensionFactSubject | undefined): TypeofRuntimeKind | undefined {
  if (subject === undefined || !isNodeSubject(subject)) {
    return undefined;
  }
  if (subject.Kind !== KindStringLiteral && subject.Kind !== KindNoSubstitutionTemplateLiteral) {
    return undefined;
  }
  const value = Node_Text(subject);
  switch (value) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
      return value;
    default:
      return undefined;
  }
}

function getTypeofPatternTargetType(
  carrier: TargetTypeRef | undefined,
  runtimeKind: TypeofRuntimeKind,
): TargetTypeRef | undefined {
  const targetType = carrier?.kind === "nullable" ? carrier.inner : carrier;
  return targetType !== undefined && getTypeofRuntimeKindForTargetType(targetType) === runtimeKind
    ? targetType
    : undefined;
}

function getTypeofRuntimeKindForTargetType(type: TargetTypeRef): TypeofRuntimeKind | undefined {
  switch (type.kind) {
    case "source-primitive":
      return getTypeofRuntimeKindForSourcePrimitive(type.name);
    case "target-named":
      return getTypeofRuntimeKindForTargetId(type.id);
    default:
      return undefined;
  }
}

function getTypeofRuntimeKindForSourcePrimitive(kind: SourcePrimitiveKind): TypeofRuntimeKind | undefined {
  switch (kind) {
    case "bool":
      return "boolean";
    case "int8":
    case "uint8":
    case "int16":
    case "uint16":
    case "int32":
    case "uint32":
    case "int64":
    case "uint64":
    case "native-int":
    case "native-uint":
    case "float16":
    case "float32":
    case "float64":
    case "decimal128":
    case "int128":
    case "uint128":
      return "number";
    default:
      return undefined;
  }
}

function getTypeofRuntimeKindForTargetId(id: string): TypeofRuntimeKind | undefined {
  switch (id) {
    case "System.String":
      return "string";
    case "System.Boolean":
      return "boolean";
    case "System.Numerics.BigInteger":
      return "bigint";
    case "System.SByte":
    case "System.Byte":
    case "System.Int16":
    case "System.UInt16":
    case "System.Int32":
    case "System.UInt32":
    case "System.Int64":
    case "System.UInt64":
    case "System.Int128":
    case "System.UInt128":
    case "System.IntPtr":
    case "System.UIntPtr":
    case "System.Half":
    case "System.Single":
    case "System.Double":
    case "System.Decimal":
      return "number";
    default:
      return undefined;
  }
}

function resolveSourceProjectInstanceOfOperator(request: ResolveOperatorRequest): ResolveOperationResult | undefined {
  if (request.operator !== "instanceof") {
    return undefined;
  }
  const rightSymbol = request.rightAliasedSymbol !== undefined && isSymbolSubject(request.rightAliasedSymbol)
    ? request.rightAliasedSymbol
    : request.rightResolvedSymbol !== undefined && isSymbolSubject(request.rightResolvedSymbol)
    ? request.rightResolvedSymbol
    : request.rightSymbol !== undefined && isSymbolSubject(request.rightSymbol)
    ? request.rightSymbol
    : undefined;
  if (getSourceProjectClassName(rightSymbol) === undefined) {
    return undefined;
  }
  const resultType = csharpNamed("System.Boolean");
  return {
    operation: {
      operationId: "tsonic.csharp.source.instanceof",
      operationKind: "operator",
      targetOperation: "is",
      resultType,
    } satisfies TargetOperationFact,
    resultType,
  };
}

function resolveSourcePrimitiveOperator(
  request: ResolveOperatorRequest,
  context: ExtensionDecisionContext,
): ResolveOperationResult | undefined {
  const leftPrimitive = request.leftSourcePrimitive ??
    resolveSourcePrimitiveSubject(context, request.left) ??
    resolveSourcePrimitiveSubject(context, request.leftSymbol) ??
    resolveSourcePrimitiveSubject(context, request.leftType);
  const rightPrimitive = request.rightSourcePrimitive ??
    resolveSourcePrimitiveSubject(context, request.right) ??
    resolveSourcePrimitiveSubject(context, request.rightSymbol) ??
    resolveSourcePrimitiveSubject(context, request.rightType);
  if (leftPrimitive === undefined && rightPrimitive === undefined) {
    return undefined;
  }
  const semanticOperator = normalizeSourcePrimitiveOperator(request.operator, request.right);
  const targetOperation = csharpOperatorToken(semanticOperator);
  if (targetOperation === undefined) {
    return undefined;
  }
  const resultType = getSourcePrimitiveOperatorResult(
    semanticOperator,
    leftPrimitive,
    rightPrimitive,
    isIntegerNumericLiteral(request.left),
    isIntegerNumericLiteral(request.right),
  );
  if (resultType === undefined) {
    return undefined;
  }
  return {
    operation: {
      operationId: `tsonic.csharp.source.${sourcePrimitiveResultName(resultType)}.${semanticOperator}`,
      operationKind: "operator",
      targetOperation,
      resultType,
    } satisfies TargetOperationFact,
    resultType,
  };
}

type BuiltinOperatorKind = "string" | "number" | "boolean" | "bigint" | "enum" | "type-parameter";

function resolveBuiltinTypeOperator(
  request: ResolveOperatorRequest,
): ResolveOperationResult | undefined {
  const semanticOperator = normalizeSourcePrimitiveOperator(request.operator, request.right);
  const nullishCoalesce = semanticOperator === "??"
    ? resolveNullishCoalesceOperator(request)
    : undefined;
  if (nullishCoalesce !== undefined) {
    return nullishCoalesce;
  }
  const targetOperation = csharpOperatorToken(semanticOperator);
  if (targetOperation === undefined) {
    return undefined;
  }
  const left = getBuiltinOperatorKind(request.leftType);
  const right = getBuiltinOperatorKind(request.rightType);
  const leftLiteral = isIntegerNumericLiteral(request.left);
  const rightLiteral = isIntegerNumericLiteral(request.right);
  if (left === "type-parameter" || right === "type-parameter") {
    return undefined;
  }
  const allowed = isBuiltinOperatorAllowed(semanticOperator, left, right, leftLiteral, rightLiteral);
  if (!allowed) {
    return undefined;
  }
  const resultType = getBuiltinOperatorResultSubject(semanticOperator, request, left, right);
  return {
    operation: {
      operationId: `tsonic.csharp.builtin.${left ?? "none"}.${semanticOperator}.${right ?? "none"}`,
      operationKind: "operator",
      targetOperation,
      ...(resultType !== undefined ? { resultType } : {}),
    } satisfies TargetOperationFact,
    ...(resultType !== undefined ? { resultType } : {}),
  };
}

function resolveNullishCoalesceOperator(request: ResolveOperatorRequest): ResolveOperationResult | undefined {
  const leftType = request.leftType !== undefined && isTypeSubject(request.leftType) ? request.leftType : undefined;
  const rightType = request.rightType !== undefined && isTypeSubject(request.rightType) ? request.rightType : undefined;
  const leftInnerType = getSingleNonNullishUnionType(leftType);
  if (leftInnerType === undefined || rightType === undefined) {
    return undefined;
  }
  const leftKind = getBuiltinOperatorKind(leftInnerType);
  const rightKind = getBuiltinOperatorKind(rightType);
  if (leftKind === undefined || rightKind === undefined || leftKind !== rightKind || leftKind === "type-parameter") {
    return undefined;
  }
  return {
    operation: {
      operationId: `tsonic.csharp.builtin.${leftKind}.??.${rightKind}`,
      operationKind: "operator",
      targetOperation: "??",
      resultType: leftInnerType,
    } satisfies TargetOperationFact,
    resultType: leftInnerType,
  };
}

function getSingleNonNullishUnionType(type: Type | undefined): Type | undefined {
  const unionTypes = getTypeScriptUnionTypes(type);
  if (unionTypes === undefined) {
    return undefined;
  }
  const nonNullishTypes = unionTypes.filter((unionType) => !isTypeScriptNullishType(unionType));
  return nonNullishTypes.length === 1 && nonNullishTypes.length < unionTypes.length
    ? nonNullishTypes[0]
    : undefined;
}

function getBuiltinOperatorKind(subject: ExtensionFactSubject | undefined): BuiltinOperatorKind | undefined {
  if (subject === undefined || !isTypeSubject(subject)) {
    return undefined;
  }
  if ((subject.flags & TypeFlagsTypeParameter) !== 0) {
    return "type-parameter";
  }
  if ((subject.flags & TypeFlagsEnumLike) !== 0 || isSourceEnumType(subject)) {
    return "enum";
  }
  if ((subject.flags & TypeFlagsStringLike) !== 0) {
    return "string";
  }
  if ((subject.flags & TypeFlagsBooleanLike) !== 0) {
    return "boolean";
  }
  if ((subject.flags & TypeFlagsBigIntLike) !== 0) {
    return "bigint";
  }
  if ((subject.flags & TypeFlagsNumberLike) !== 0) {
    return "number";
  }
  return undefined;
}

function isBuiltinOperatorAllowed(
  operator: string,
  left: BuiltinOperatorKind | undefined,
  right: BuiltinOperatorKind | undefined,
  leftLiteral: boolean,
  rightLiteral: boolean,
): boolean {
  switch (operator) {
    case "!":
      return left === "boolean";
    case "u+":
    case "u-":
    case "++":
    case "--":
      return left === "number" || left === "bigint";
    case "&&":
    case "||":
      return left === "boolean" && right === "boolean";
    case "==":
    case "!=":
    case "===":
    case "!==":
      return left !== undefined && right !== undefined && left === right && left !== "type-parameter";
    case "??":
      return left !== undefined && right !== undefined && left === right && left !== "type-parameter";
    case "<":
    case "<=":
    case ">":
    case ">=":
      return (left === "number" && right === "number") || (left === "bigint" && right === "bigint");
    case "+":
    case "+=":
      return (left === "number" && right === "number") ||
        (left === "bigint" && right === "bigint") ||
        isStringConcatBuiltin(left, right);
    case "-":
    case "-=":
    case "*":
    case "*=":
    case "/":
    case "/=":
    case "%":
    case "%=":
      return (left === "number" && right === "number") || (left === "bigint" && right === "bigint");
    case "&":
    case "&=":
    case "|":
    case "|=":
    case "^":
    case "^=":
      return (left === "bigint" && right === "bigint") ||
        (left === "enum" && (right === "enum" || rightLiteral)) ||
        (right === "enum" && leftLiteral);
    case "<<":
    case "<<=":
    case ">>":
    case ">>=":
    case ">>>":
    case ">>>=":
      return (left === "bigint" && right === "bigint") ||
        (left === "enum" && rightLiteral);
    default:
      return false;
  }
}

function isStringConcatBuiltin(left: BuiltinOperatorKind | undefined, right: BuiltinOperatorKind | undefined): boolean {
  return (left === "string" || right === "string") &&
    (left === "string" || left === "number" || left === "boolean" || left === "bigint") &&
    (right === "string" || right === "number" || right === "boolean" || right === "bigint");
}

function getBuiltinOperatorResultSubject(
  operator: string,
  request: ResolveOperatorRequest,
  left: BuiltinOperatorKind | undefined,
  right: BuiltinOperatorKind | undefined,
): ExtensionFactSubject | undefined {
  switch (operator) {
    case "!":
    case "&&":
    case "||":
    case "==":
    case "!=":
    case "===":
    case "!==":
    case "<":
    case "<=":
    case ">":
    case ">=":
      return { carrier: csharpNamed("System.Boolean") } satisfies RuntimeCarrierFact;
    case "??":
      return request.leftType;
    case "+":
    case "+=":
      return isStringConcatBuiltin(left, right)
        ? ({ carrier: csharpNamed("System.String") } satisfies RuntimeCarrierFact)
        : request.leftType;
    case "u+":
    case "u-":
    case "++":
    case "--":
    case "-":
    case "-=":
    case "*":
    case "*=":
    case "/":
    case "/=":
    case "%":
    case "%=":
    case "&":
    case "&=":
    case "|":
    case "|=":
    case "^":
    case "^=":
    case "<<":
    case "<<=":
    case ">>":
    case ">>=":
    case ">>>":
    case ">>>=":
      return request.leftType;
    default:
      return undefined;
  }
}

function normalizeSourcePrimitiveOperator(operator: string, right: ExtensionFactSubject | undefined): string {
  if (right === undefined && (operator === "+" || operator === "-")) {
    return `u${operator}`;
  }
  return operator;
}

function resolveSourcePrimitiveSubject(
  context: ExtensionDecisionContext,
  subject: ExtensionFactSubject | undefined,
): SourcePrimitiveFact | undefined {
  return subject === undefined ? undefined : context.factResolver.resolve(subject, sourcePrimitiveFactKey);
}

function getSourcePrimitiveOperatorResult(
  operator: string,
  left: SourcePrimitiveFact | undefined,
  right: SourcePrimitiveFact | undefined,
  leftLiteral: boolean,
  rightLiteral: boolean,
): ExtensionFactSubject | undefined {
  switch (operator) {
    case "!":
      return isBoolPrimitive(left) ? sourcePrimitiveBool() : undefined;
    case "~":
      return left !== undefined && isIntegralPrimitive(left) ? sourcePrimitiveSubject(left) : undefined;
    case "++":
    case "--":
    case "u+":
    case "u-":
      return left !== undefined && isNumericPrimitive(left) ? sourcePrimitiveSubject(left) : undefined;
    case "&&":
    case "||":
      return isBoolPrimitive(left) && isBoolPrimitive(right) ? sourcePrimitiveBool() : undefined;
    case "==":
    case "===":
    case "!=":
    case "!==":
      return canCompareSourcePrimitives(left, right) ? sourcePrimitiveBool() : undefined;
    case "??":
      return left !== undefined && right !== undefined && left.kind === right.kind ? sourcePrimitiveSubject(left) : undefined;
    case "<":
    case "<=":
    case ">":
    case ">=":
      return canCompareNumericSourcePrimitives(left, right) ? sourcePrimitiveBool() : undefined;
    case "+":
    case "+=":
    case "-":
    case "-=":
    case "*":
    case "*=":
    case "/":
    case "/=":
    case "%":
    case "%=":
      return sourcePrimitiveNumericResult(left, right, leftLiteral, rightLiteral);
    case "&":
    case "&=":
    case "|":
    case "|=":
    case "^":
    case "^=":
    case "<<":
    case "<<=":
    case ">>":
    case ">>=":
    case ">>>":
    case ">>>=":
      return sourcePrimitiveIntegralResult(left, right, leftLiteral, rightLiteral);
    default:
      return undefined;
  }
}

function csharpOperatorToken(operator: string): string | undefined {
  switch (operator) {
    case "u+":
      return "+";
    case "u-":
      return "-";
    case "===":
      return "==";
    case "!==":
      return "!=";
    case "??":
      return "??";
    case "+":
    case "+=":
    case "-":
    case "-=":
    case "*":
    case "*=":
    case "/":
    case "/=":
    case "%":
    case "%=":
    case "!":
    case "~":
    case "++":
    case "--":
    case "==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "&&":
    case "||":
    case "&":
    case "&=":
    case "|":
    case "|=":
    case "^":
    case "^=":
    case "<<":
    case "<<=":
    case ">>":
    case ">>=":
    case ">>>":
    case ">>>=":
      return operator;
    default:
      return undefined;
  }
}

function sourcePrimitiveBool(): SourcePrimitiveFact {
  return {
    kind: "bool",
    runtimeBase: "boolean",
  };
}

function sourcePrimitiveSubject(fact: SourcePrimitiveFact): SourcePrimitiveFact {
  return fact;
}

function sourcePrimitiveResultName(subject: ExtensionFactSubject): string {
  const primitiveSubject = subject as { readonly kind?: string; readonly name?: string };
  return primitiveSubject.kind ?? primitiveSubject.name ?? "unknown";
}

function canCompareSourcePrimitives(left: SourcePrimitiveFact | undefined, right: SourcePrimitiveFact | undefined): boolean {
  return left !== undefined &&
    right !== undefined &&
    left.kind === right.kind &&
    (isBoolPrimitive(left) || isNumericPrimitive(left) || isCharPrimitive(left));
}

function canCompareNumericSourcePrimitives(left: SourcePrimitiveFact | undefined, right: SourcePrimitiveFact | undefined): boolean {
  return left !== undefined && right !== undefined && left.kind === right.kind && isNumericPrimitive(left);
}

function sourcePrimitiveNumericResult(
  left: SourcePrimitiveFact | undefined,
  right: SourcePrimitiveFact | undefined,
  leftLiteral: boolean,
  rightLiteral: boolean,
): ExtensionFactSubject | undefined {
  if (left !== undefined && right !== undefined && left.kind === right.kind && isNumericPrimitive(left)) {
    return sourcePrimitiveSubject(left);
  }
  if (left !== undefined && isNumericPrimitive(left) && rightLiteral) {
    return sourcePrimitiveSubject(left);
  }
  if (right !== undefined && isNumericPrimitive(right) && leftLiteral) {
    return sourcePrimitiveSubject(right);
  }
  return undefined;
}

function sourcePrimitiveIntegralResult(
  left: SourcePrimitiveFact | undefined,
  right: SourcePrimitiveFact | undefined,
  leftLiteral: boolean,
  rightLiteral: boolean,
): ExtensionFactSubject | undefined {
  if (left !== undefined && right !== undefined && isIntegralPrimitive(left) && isIntegralPrimitive(right)) {
    return sourcePrimitiveSubject(left);
  }
  if (left !== undefined && isIntegralPrimitive(left) && rightLiteral) {
    return sourcePrimitiveSubject(left);
  }
  if (right !== undefined && isIntegralPrimitive(right) && leftLiteral) {
    return sourcePrimitiveSubject(right);
  }
  return undefined;
}

function isBoolPrimitive(primitive: SourcePrimitiveFact | undefined): boolean {
  return primitive?.kind === "bool";
}

function isCharPrimitive(primitive: SourcePrimitiveFact): boolean {
  return primitive.kind === "char16" || primitive.kind === "char32";
}

function isNumericPrimitive(primitive: SourcePrimitiveFact): boolean {
  return primitive.runtimeBase !== "boolean" &&
    primitive.runtimeBase !== "string" &&
    primitive.runtimeBase !== "object";
}

function isIntegralPrimitive(primitive: SourcePrimitiveFact): boolean {
  return primitive.kind === "int8" ||
    primitive.kind === "uint8" ||
    primitive.kind === "int16" ||
    primitive.kind === "uint16" ||
    primitive.kind === "int32" ||
    primitive.kind === "uint32" ||
    primitive.kind === "int64" ||
    primitive.kind === "uint64" ||
    primitive.kind === "int128" ||
    primitive.kind === "uint128" ||
    primitive.kind === "native-int" ||
    primitive.kind === "native-uint";
}

function isIntegerNumericLiteral(subject: ExtensionFactSubject | undefined): boolean {
  const node = subject as Node | undefined;
  if (node?.Kind !== KindNumericLiteral) {
    return false;
  }
  const value = Number(AsNumericLiteral(node)!.Text.replace(/_/g, ""));
  return Number.isSafeInteger(value);
}

function isCsharpIntegralIndexArgument(
  request: {
    readonly argument: ExtensionFactSubject;
    readonly argumentSymbol?: ExtensionFactSubject;
    readonly resolvedArgumentSymbol?: ExtensionFactSubject;
    readonly argumentType?: ExtensionFactSubject;
  },
  context: ExtensionDecisionContext,
): boolean {
  if (isIntegerNumericLiteral(request.argument)) {
    return true;
  }
  const primitive = resolveSourcePrimitiveSubject(context, request.argument) ??
    resolveSourcePrimitiveSubject(context, request.argumentSymbol) ??
    resolveSourcePrimitiveSubject(context, request.resolvedArgumentSymbol) ??
    resolveSourcePrimitiveSubject(context, request.argumentType);
  return primitive !== undefined && isIntegralPrimitive(primitive);
}

function csharpSourceSemanticsModules(): readonly SourceSemanticsModule[] {
  return [
    {
      moduleSpecifier: neutralTypesModule,
      packageName: "@tsonic/core",
      subpath: "types.js",
      exports: [
        sourcePrimitive("bool", "bool", "boolean"),
        sourcePrimitive("char16", "char16", "string", false, 16),
        sourcePrimitive("int8", "int8", "number", true, 8),
        sourcePrimitive("uint8", "uint8", "number", false, 8),
        sourcePrimitive("int16", "int16", "number", true, 16),
        sourcePrimitive("uint16", "uint16", "number", false, 16),
        sourcePrimitive("int32", "int32", "number", true, 32),
        sourcePrimitive("uint32", "uint32", "number", false, 32),
        sourcePrimitive("int64", "int64", "bigint", true, 64),
        sourcePrimitive("uint64", "uint64", "bigint", false, 64),
        sourcePrimitive("int128", "int128", "bigint", true, 128),
        sourcePrimitive("uint128", "uint128", "bigint", false, 128),
        sourcePrimitive("nativeInt", "native-int", "number", true),
        sourcePrimitive("nativeUint", "native-uint", "number", false),
        sourcePrimitive("float16", "float16", "number", true, 16),
        sourcePrimitive("float32", "float32", "number", true, 32),
        sourcePrimitive("float64", "float64", "number", true, 64),
        sourcePrimitive("decimal128", "decimal128", "number", true, 128),
        sourcePrimitive("char32", "char32", "string", false, 32),
      ],
    },
    {
      moduleSpecifier: csharpTypesModule,
      packageName: "@tsonic/csharp",
      subpath: "types.js",
      exports: [
        sourcePrimitive("bool", "bool", "boolean"),
        sourcePrimitive("byte", "uint8", "number", false, 8),
        sourcePrimitive("sbyte", "int8", "number", true, 8),
        sourcePrimitive("short", "int16", "number", true, 16),
        sourcePrimitive("ushort", "uint16", "number", false, 16),
        sourcePrimitive("int", "int32", "number", true, 32),
        sourcePrimitive("uint", "uint32", "number", false, 32),
        sourcePrimitive("long", "int64", "bigint", true, 64),
        sourcePrimitive("ulong", "uint64", "bigint", false, 64),
        sourcePrimitive("nint", "native-int", "number", true),
        sourcePrimitive("nuint", "native-uint", "number", false),
        sourcePrimitive("float", "float32", "number", true, 32),
        sourcePrimitive("double", "float64", "number", true, 64),
        sourcePrimitive("decimal", "decimal128", "number", true, 128),
        sourcePrimitive("char", "char16", "string", false, 16),
      ],
    },
    {
      moduleSpecifier: neutralLangModule,
      packageName: "@tsonic/core",
      subpath: "lang.js",
      exports: [
        { kind: "call-marker", exportName: "writeonlyRef", marker: "byrefWriteonlyMustInit" },
        { kind: "call-marker", exportName: "readwriteRef", marker: "byrefReadwrite" },
        { kind: "call-marker", exportName: "readonlyRef", marker: "byrefReadonly" },
        { kind: "call-marker", exportName: "borrowShared", marker: "borrowShared" },
        { kind: "call-marker", exportName: "borrowMutable", marker: "borrowMutable" },
        { kind: "call-marker", exportName: "move", marker: "move" },
        { kind: "call-marker", exportName: "valueType", marker: "valueType" },
        { kind: "call-marker", exportName: "field", marker: "field" },
        { kind: "call-marker", exportName: "attributes", marker: "attributes" },
        { kind: "call-marker", exportName: "defaultValue", marker: "defaultValue" },
        { kind: "type-marker", exportName: "pointer", marker: "pointer" },
        { kind: "type-marker", exportName: "functionPointer", marker: "functionPointer" },
      ],
    },
    {
      moduleSpecifier: csharpLangModule,
      packageName: "@tsonic/csharp",
      subpath: "lang.js",
      exports: [
        { kind: "call-marker", exportName: "out", marker: "byrefWriteonlyMustInit" },
        { kind: "call-marker", exportName: "ref", marker: "byrefReadwrite" },
        { kind: "call-marker", exportName: "inref", marker: "byrefReadonly" },
        { kind: "call-marker", exportName: "struct", marker: "valueType" },
        { kind: "call-marker", exportName: "attribute", marker: "attribute" },
        { kind: "call-marker", exportName: "defaultof", marker: "defaultValue" },
        { kind: "type-marker", exportName: "ptr", marker: "pointer" },
        { kind: "type-marker", exportName: "fnptr", marker: "functionPointer" },
      ],
    },
  ];
}

function createCsharpCoreVirtualModulesProvider(): TargetBindingProvider {
  const modules = new Map(csharpSourceSemanticsModules().map((module) => [module.moduleSpecifier, module]));
  const identity: ProviderIdentity = {
    id: "tsonic.csharp.core-virtual-modules",
    version: "0.0.1",
    target: "csharp",
    extensionContractVersion: TstsProviderContractVersion,
    providerKind: "binding",
    displayName: "Tsonic C# source modules",
  };
  return {
    identity,
    ownsModule(specifier: string, _context: ProviderModuleContext): ProviderOwnership {
      return modules.has(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    resolveModule(specifier: string, _context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const module = modules.get(specifier);
      if (module === undefined) {
        return {
          extensionId: identity.id,
          extensionCode: "CSHARP_CORE_MODULE_UNOWNED",
          numericCode: 9100001,
          category: "error",
          message: `C# core provider does not own '${specifier}'.`,
        };
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: `tsts-provider://tsonic-csharp/${encodeURIComponent(specifier)}`,
        providerModuleId: specifier,
        ...(module.packageName !== undefined ? { packageName: module.packageName } : {}),
        ...(module.packageVersion !== undefined ? { packageVersion: module.packageVersion } : {}),
        evidence: [{ message: "C# target supplies source module as provider virtual module." }],
      };
    },
    getDeclarationModel(resolution: ProviderModuleResolution): ProviderDeclarationModel | ExtensionDiagnostic {
      const module = modules.get(resolution.moduleSpecifier);
      if (module === undefined) {
        return {
          extensionId: identity.id,
          extensionCode: "CSHARP_CORE_MODULE_DECLARATION_MISSING",
          numericCode: 9100002,
          category: "error",
          message: `No C# core declaration model exists for '${resolution.moduleSpecifier}'.`,
        };
      }
      return {
        moduleSpecifier: resolution.moduleSpecifier,
        providerModuleId: resolution.providerModuleId,
        exports: providerExportDeclarationsForModule(module),
        evidence: [{ message: "Declaration model is generated from target source semantics." }],
      };
    },
    getTargetIdentity(symbol) {
      if (symbol.exportName === undefined) {
        return undefined;
      }
      const module = modules.get(symbol.moduleSpecifier);
      const declaration = module === undefined
        ? undefined
        : providerExportDeclarationsForModule(module).find((candidate) => candidate.name === symbol.exportName);
      if (declaration === undefined) {
        return undefined;
      }
      if (declaration.targetIdentity !== undefined) {
        return declaration.targetIdentity;
      }
      return {
        target: "csharp",
        id: `${symbol.moduleSpecifier}#${symbol.exportName}`,
        displayName: symbol.exportName,
      };
    },
  };
}

function providerExportDeclarationsForModule(module: SourceSemanticsModule): readonly ProviderExportDeclaration[] {
  return [
    ...module.exports.flatMap(toProviderExportDeclarations),
    ...csharpTargetProviderExports(module.moduleSpecifier),
  ];
}

function csharpTargetProviderExports(moduleSpecifier: string): readonly ProviderExportDeclaration[] {
  if (moduleSpecifier !== csharpLangModule) {
    return [];
  }
  return [
    csharpExceptionProviderDeclaration(),
    csharpConvertProviderDeclaration(),
    csharpEnvironmentProviderDeclaration(),
    attributeSupportType(attributeTargetTypeName, attributeTargetShape()),
    csharpClsCompliantAttributeProviderDeclaration(),
  ];
}

function csharpExceptionProviderDeclaration(): ProviderExportDeclaration {
  const stringType = providerCsharpStringType();
  return {
    id: "Exception",
    name: "Exception",
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: "System.Exception",
      displayName: "System.Exception",
    },
    members: [{
      id: "constructor(message)",
      name: "constructor",
      kind: "constructor",
      signatures: [{
        id: "System.Exception..ctor(System.String)",
        parameters: [{
          name: "message",
          type: stringType,
        }],
      }],
    }, {
      id: "Message",
      name: "message",
      targetName: "Message",
      kind: "property",
      type: stringType,
    }, {
      id: "ToString",
      name: "toString",
      targetName: "ToString",
      kind: "method",
      signatures: [{
        id: "System.Exception.ToString()",
        parameters: [],
        returnType: stringType,
      }],
    }],
  };
}

function csharpConvertProviderDeclaration(): ProviderExportDeclaration {
  return {
    id: "Convert",
    name: "Convert",
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: "System.Convert",
      displayName: "System.Convert",
    },
    members: [{
      id: "toByte(value)",
      name: "toByte",
      kind: "method",
      static: true,
      signatures: [{
        id: "System.Convert.ToByte(System.Double)",
        name: "ToByte",
        parameters: [{
          name: "value",
          type: { kind: "source-primitive", name: "float64" },
        }],
        returnType: { kind: "source-primitive", name: "uint8" },
      }],
    }],
  };
}

function csharpEnvironmentProviderDeclaration(): ProviderExportDeclaration {
  const stringType = providerCsharpStringType();
  return {
    id: "Environment",
    name: "Environment",
    kind: "class",
    targetIdentity: {
      target: "csharp",
      id: "System.Environment",
      displayName: "System.Environment",
    },
    members: [{
      id: "NewLine",
      name: "newLine",
      targetName: "NewLine",
      kind: "property",
      static: true,
      type: stringType,
    }],
  };
}

function csharpClsCompliantAttributeProviderDeclaration(): ProviderExportDeclaration {
  return {
    id: "CLSCompliantAttribute",
    name: "CLSCompliantAttribute",
    kind: "value",
    targetIdentity: {
      target: "csharp",
      id: "System.CLSCompliantAttribute",
      displayName: "System.CLSCompliantAttribute",
    },
    type: { kind: "reference", name: attributeTargetTypeName },
  };
}

function toProviderExportDeclarations(declaration: SourceSemanticsExportDeclaration): readonly ProviderExportDeclaration[] {
  switch (declaration.kind) {
    case "source-primitive":
      return [primitiveExportToProviderDeclaration(declaration)];
    case "call-marker":
      return callMarkerToProviderDeclarations(declaration);
    case "type-marker":
      return [typeMarkerToProviderDeclaration(declaration)];
  }
}

function primitiveExportToProviderDeclaration(declaration: SourcePrimitiveDeclaration): ProviderExportDeclaration {
  return {
    id: declaration.exportName,
    name: declaration.exportName,
    kind: "type",
    targetIdentity: {
      target: "csharp",
      id: getCsharpPrimitiveTargetIdentity(declaration.primitive),
      displayName: getCsharpPrimitiveDisplayName(declaration.primitive),
    },
    type: { kind: "source-primitive", name: declaration.primitive },
  };
}

function callMarkerToProviderDeclarations(declaration: SourceCallMarkerDeclaration): readonly ProviderExportDeclaration[] {
  if (declaration.marker === "attributes") {
    return attributeBuilderProviderDeclarations(declaration);
  }
  const typeParameter = { name: "T" };
  const typeParameterRef: ProviderTypeExpression = { kind: "type-parameter", name: "T" };
  const parameters = declaration.marker === "defaultValue"
    ? []
    : [{ name: "value", type: typeParameterRef, optional: !isRequiredStorageMarker(declaration.marker) }];
  return [{
    id: declaration.exportName,
    name: declaration.exportName,
    kind: "function",
    signatures: [{
      id: `${declaration.exportName}<T>`,
      typeParameters: [typeParameter],
      parameters,
      returnType: typeParameterRef,
    }],
  }];
}

function attributeBuilderProviderDeclarations(declaration: SourceCallMarkerDeclaration): readonly ProviderExportDeclaration[] {
  const typeParameter = { name: "T" };
  const targetType: ProviderTypeExpression = { kind: "type-parameter", name: "T" };
  const builder = attributeBuilderType("AttributeBuilder", targetType);
  return [
    {
      id: declaration.exportName,
      name: declaration.exportName,
      kind: "function",
      signatures: [{
        id: `${declaration.exportName}<T>`,
        typeParameters: [typeParameter],
        parameters: [],
        returnType: builder,
      }],
    },
    attributeSupportType(attributeTargetTypeName, attributeTargetShape()),
    attributeSupportType(attributeArgumentTypeName, attributeArgumentShape()),
    attributeBuilderInterface("AttributeBuilder", [
      attributeAddMember("AttributeBuilder", targetType),
      selectorMember("property", "AttributeMemberBuilder", targetType),
      selectorMember("method", "AttributeMethodBuilder", targetType),
    ]),
    attributeBuilderInterface("AttributeMemberBuilder", [
      attributeAddMember("AttributeMemberBuilder", targetType),
    ]),
    attributeBuilderInterface("AttributeMethodBuilder", [
      attributeAddMember("AttributeMethodBuilder", targetType),
      {
        id: "parameter(name)",
        name: "parameter",
        kind: "method",
        signatures: [{
          id: "parameter(name)",
          parameters: [{ name: "name", type: providerCsharpStringType() }],
          returnType: attributeBuilderType("AttributeParameterBuilder", targetType),
        }],
      },
    ]),
    attributeBuilderInterface("AttributeParameterBuilder", [
      attributeAddMember("AttributeParameterBuilder", targetType),
    ]),
  ];
}

function attributeSupportType(
  name: string,
  type: ProviderTypeExpression,
): ProviderExportDeclaration {
  return {
    id: name,
    name,
    kind: "type",
    type,
  };
}

function attributeBuilderInterface(
  name: string,
  members: readonly ProviderMemberDeclaration[],
): ProviderExportDeclaration {
  return {
    id: name,
    name,
    kind: "interface",
    typeParameters: [{ name: "T" }],
    members,
  };
}

function attributeAddMember(
  builderName: AttributeBuilderTypeName,
  targetType: ProviderTypeExpression,
): ProviderMemberDeclaration {
  return {
    id: "add(attribute,args)",
    name: "add",
    kind: "method",
    signatures: [{
      id: "add(attribute,args)",
      parameters: [
        { name: "attribute", type: { kind: "reference", name: attributeTargetTypeName } },
        { name: "args", type: { kind: "array", elementType: { kind: "reference", name: attributeArgumentTypeName } }, rest: true },
      ],
      returnType: attributeBuilderType(builderName, targetType),
    }],
  };
}

function selectorMember(
  name: "method" | "property",
  builderName: AttributeBuilderTypeName,
  targetType: ProviderTypeExpression,
): ProviderMemberDeclaration {
  return {
    id: `${name}(selector)`,
    name,
    kind: "method",
    signatures: [{
      id: `${name}(selector)`,
      typeParameters: [{ name: "TSelected" }],
      parameters: [{
        name: "selector",
        type: {
          kind: "function",
          parameters: [{ name: "target", type: targetType }],
          returnType: { kind: "type-parameter", name: "TSelected" },
        },
      }],
      returnType: attributeBuilderType(builderName, targetType),
    }],
  };
}

function attributeBuilderType(
  name: AttributeBuilderTypeName,
  targetType: ProviderTypeExpression,
): ProviderTypeExpression {
  return {
    kind: "reference",
    name,
    typeArguments: [targetType],
  };
}

function isRequiredStorageMarker(marker: SourceCallMarkerDeclaration["marker"]): boolean {
  return marker === "byrefReadonly" || marker === "byrefReadwrite" || marker === "byrefWriteonlyMustInit";
}

function typeMarkerToProviderDeclaration(declaration: SourceTypeMarkerDeclaration): ProviderExportDeclaration {
  return {
    id: declaration.exportName,
    name: declaration.exportName,
    kind: "type",
    typeParameters: sourceTypeMarkerParameters(declaration.marker),
    type: sourceMarkerOpaqueType(declaration.marker),
  };
}

function sourceTypeMarkerParameters(marker: SourceTypeMarkerDeclaration["marker"]): readonly { readonly name: string }[] {
  return marker === "functionPointer"
    ? [{ name: "Args" }, { name: "Result" }]
    : [{ name: "T" }];
}

function attributeTargetShape(): ProviderTypeExpression {
  return {
    kind: "opaque",
    id: "tsonic.csharp.attribute.target",
    displayName: "C# attribute target",
    sourceShape: { kind: "object" },
  };
}

function attributeArgumentShape(): ProviderTypeExpression {
  return {
    kind: "union",
    types: [
      { kind: "string" },
      { kind: "number" },
      { kind: "boolean" },
      { kind: "bigint" },
      { kind: "literal", value: null },
      {
        kind: "opaque",
        id: "tsonic.csharp.attribute.argument",
        displayName: "C# provider-backed attribute argument",
        sourceShape: { kind: "object" },
      },
    ],
  };
}

function providerCsharpStringType(): ProviderTypeExpression {
  return {
    kind: "target-named",
    target: "csharp",
    id: "System.String",
    displayName: "string",
    sourceShape: { kind: "string" },
  };
}

function sourceMarkerOpaqueType(marker: SourceTypeMarkerDeclaration["marker"]): ProviderTypeExpression {
  return {
    kind: "opaque",
    id: `tsonic.csharp.marker.${marker}`,
    displayName: `C# ${marker} marker`,
    sourceShape: { kind: "object" },
  };
}

function getCsharpPrimitiveTargetIdentity(primitive: SourcePrimitiveKind): string {
  switch (primitive) {
    case "bool":
      return "System.Boolean";
    case "char16":
      return "System.Char";
    case "char32":
      return "System.Text.Rune";
    case "int8":
      return "System.SByte";
    case "uint8":
      return "System.Byte";
    case "int16":
      return "System.Int16";
    case "uint16":
      return "System.UInt16";
    case "int32":
      return "System.Int32";
    case "uint32":
      return "System.UInt32";
    case "int64":
      return "System.Int64";
    case "uint64":
      return "System.UInt64";
    case "native-int":
      return "System.IntPtr";
    case "native-uint":
      return "System.UIntPtr";
    case "float16":
      return "System.Half";
    case "float32":
      return "System.Single";
    case "float64":
      return "System.Double";
    case "decimal128":
      return "System.Decimal";
    case "int128":
      return "System.Int128";
    case "uint128":
      return "System.UInt128";
  }
}

function getCsharpPrimitiveDisplayName(primitive: SourcePrimitiveKind): string {
  switch (primitive) {
    case "bool":
      return "bool";
    case "char16":
      return "char";
    case "char32":
      return "System.Text.Rune";
    case "int8":
      return "sbyte";
    case "uint8":
      return "byte";
    case "int16":
      return "short";
    case "uint16":
      return "ushort";
    case "int32":
      return "int";
    case "uint32":
      return "uint";
    case "int64":
      return "long";
    case "uint64":
      return "ulong";
    case "native-int":
      return "nint";
    case "native-uint":
      return "nuint";
    case "float16":
      return "Half";
    case "float32":
      return "float";
    case "float64":
      return "double";
    case "decimal128":
      return "decimal";
    case "int128":
      return "Int128";
    case "uint128":
      return "UInt128";
  }
}
