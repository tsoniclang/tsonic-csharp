import {
  AsArrayTypeNode,
  AsFunctionTypeNode,
  AsNumericLiteral,
  AsParameterDeclaration,
  AsPropertyAccessExpression,
  AsTupleTypeNode,
  GetSourceFileOfNode,
  KindAnyKeyword,
  KindArrayType,
  KindBigIntKeyword,
  KindBooleanKeyword,
  KindBindingElement,
  KindCatchClause,
  KindEnumDeclaration,
  KindEnumMember,
  KindFunctionType,
  KindIdentifier,
  KindNeverKeyword,
  KindNewExpression,
  KindNumberKeyword,
  KindNumericLiteral,
  KindParameter,
  KindPropertyAccessExpression,
  KindPropertyDeclaration,
  KindStringKeyword,
  KindTupleType,
  KindUnknownKeyword,
  KindVariableDeclaration,
  KindVoidKeyword,
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
  getSingleTypeScriptCallSignatureInfo,
  getTypeScriptArrayElementType,
  getTypeScriptUnionTypes,
  getTypeScriptTypeReferenceInfo,
  isTypeScriptStringLikeType,
  isTypeScriptNullishType,
  Node_Name,
  Node_Symbol,
  Node_Text,
  Node_Type,
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

export function createCsharpCoreVirtualModulesExtension(_context: TargetExtensionContext): CompilerExtension {
  return {
    identity: {
      id: "tsonic.csharp.core-virtual-modules",
      version: "0.0.1",
      capabilityNamespace: "tsonic.csharp.core-modules",
    },
    composition: {
      kind: "target",
      target: "csharp",
    },
    initialize(context): void {
      context.registerTargetBindingProvider(createCsharpCoreVirtualModulesProvider());
    },
  };
}

export function createCsharpSurfaceOperationsExtension(_context: TargetExtensionContext): CompilerExtension {
  return {
    identity: {
      id: "tsonic.csharp.surface-operations",
      version: "0.0.1",
      capabilityNamespace: "tsonic.csharp.surface-operations",
    },
    composition: {
      kind: "target",
      target: "csharp",
    },
    initialize(context): void {
      const provider = createCsharpSurfaceOperationsProvider();
      context.registerTargetSemanticProvider(provider);
      context.factResolver.register(runtimeCarrierFactKey, (subject, resolverContext) =>
        resolveCsharpRuntimeCarrier(subject, resolverContext));
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
      const providerMethodCall = resolveProviderTargetMethodCall(request, context);
      const call = delegateCall ?? providerConstructorCall ?? providerMethodCall;
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
      return providerPropertyAccess === undefined ? deferDecision : acceptDecision(providerPropertyAccess);
    },
    resolveElementAccess(request) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
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
    resolveIteration(request) {
      if (request.target !== undefined && request.target !== "csharp") {
        return deferDecision;
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
    .filter((member) => member.kind === "constructor" && targetMemberAcceptsArity(member, request.arguments.length));
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
  const targetBinding = getTargetBindingFromSubject(context, Node_Symbol(receiver)) ??
    getTargetBindingFromSubject(context, Node_Type(receiver)) ??
    getTargetBindingFromSubject(context, request.receiverSymbol) ??
    getTargetBindingFromSubject(context, request.resolvedReceiverSymbol) ??
    getTargetBindingFromSubject(context, request.receiverType);
  if (targetBinding === undefined) {
    return undefined;
  }
  const methods = (targetBinding.members ?? [])
    .filter((member) =>
      member.kind === "method" &&
      member.static === true &&
      member.sourceName === sourceName &&
      targetMemberAcceptsArity(member, request.arguments.length));
  if (methods.length !== 1) {
    return undefined;
  }
  const member = methods[0]!;
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
  const targetBinding = getTargetBindingFromSubject(context, receiverNode === undefined ? undefined : Node_Symbol(receiverNode)) ??
    getTargetBindingFromSubject(context, receiverNode === undefined ? undefined : Node_Type(receiverNode)) ??
    getTargetBindingFromSubject(context, request.receiverSymbol) ??
    getTargetBindingFromSubject(context, request.resolvedReceiverSymbol) ??
    getTargetBindingFromSubject(context, request.receiverType);
  if (targetBinding === undefined) {
    return undefined;
  }
  const properties = (targetBinding.members ?? [])
    .filter((member) =>
      (member.kind === "property" || member.kind === "field") &&
      member.static === true &&
      member.sourceName === request.propertyName);
  if (properties.length !== 1) {
    return undefined;
  }
  const member = properties[0]!;
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
  const parameters = member.parameters;
  const required = parameters.filter((parameter) => parameter.optional !== true && parameter.paramsArray !== true).length;
  if (parameters.some((parameter) => parameter.paramsArray === true)) {
    return argumentCount >= required;
  }
  return argumentCount >= required && argumentCount <= parameters.length;
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
  if (isVoidTargetType(returnCarrier)) {
    return {
      kind: "target-named",
      id: `System.Action\`${parameterTypes.length}`,
      typeArguments: parameterTypes,
    };
  }
  return {
    kind: "target-named",
    id: `System.Func\`${parameterTypes.length + 1}`,
    typeArguments: [...parameterTypes, returnCarrier],
  };
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
  if (isVoidTargetType(returnType)) {
    return {
      kind: "target-named",
      id: `System.Action\`${parameterTypes.length}`,
      typeArguments: parameterTypes as readonly TargetTypeRef[],
    };
  }
  return {
    kind: "target-named",
    id: `System.Func\`${parameterTypes.length + 1}`,
    typeArguments: [...(parameterTypes as readonly TargetTypeRef[]), returnType],
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
  return resolveSourcePrimitiveOperator(request, context) ??
    resolveBuiltinTypeOperator(request);
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
  ];
}

function csharpExceptionProviderDeclaration(): ProviderExportDeclaration {
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
          type: { kind: "string" },
        }],
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
      type: { kind: "string" },
    }],
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
          parameters: [{ name: "name", type: { kind: "string" } }],
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
    typeParameters: [{ name: "T" }],
    type: sourceMarkerOpaqueType(declaration.marker),
  };
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
