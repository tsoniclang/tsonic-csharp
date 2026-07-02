import {
  ExtensionObservationPoint,
  acceptObservation,
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
  ExtensionFactSubject,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetMember,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
  SourceLibraryMember,
} from "./source-library.js";
import {
  csharpTargetOperationFromMember,
  csharpJsCheckedTypeQuery,
  resolveSourceLibraryMemberIdentity,
  recordCsharpTargetOperation,
  sourceLibraryMemberIdentity,
  targetOperation,
  targetOperationFromMember,
} from "./source-library.js";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";
import {
  csharpJsSourceLibraryMemberHasCallableProvider,
} from "./calls/member-providers/index.js";
import {
  csharpJsSourceLibraryPropertyAllowsCallableValue,
  csharpJsSourceLibraryPropertyReceiverHasClosedFacts,
  csharpJsSourceLibraryPropertyDeferredOperation,
  csharpJsSourceLibraryPropertyDeferredResultType,
  csharpJsSourceLibraryPropertyPrecheck,
  csharpJsSourceLibraryPropertyRequiresFinalCarrierSelection,
  csharpJsSourceLibraryPropertyRequiresSeededReceiverFacts,
  getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity,
} from "./properties/member-providers/index.js";
import {
  rejectUnmappedCsharpJsSourceLibraryPropertyAccess,
  rejectUnsupportedCsharpJsSourceLibraryPropertyAccess,
} from "./unsupported.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  createCsharpLifecycleObservationContext,
} from "../../runtime-carriers.js";
import {
  getCsharpCheckedPropertyAccessRequestContext,
} from "../../checked-member-access-request-context.js";
import type {
  JsSurfaceSelectedSourceIdentity,
} from "./target-member-metadata.js";
import {
  jsSurfaceSelectedSourceIdentityForMember,
} from "./target-member-metadata.js";
import {
  getCsharpArrayBoundaryCoreCarrierForReference,
} from "./array-boundary-facts.js";

export function mapCsharpDirectSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" } = {},
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const sourceMember = resolveSourceLibraryMemberIdentity(request.sourceSelectedSymbol, context) ??
    resolveSourceLibraryMemberIdentity(requestContext.sourceSelectedDeclaration, context);
  return mapCsharpSourceLibraryPropertyOperation(request, context, sourceMember, host, options);
}

export function recordCsharpSourceLibraryPropertyFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createCsharpLifecycleObservationContext(lifecycleContext, ExtensionObservationPoint.mapCheckedPropertyAccess);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      recordCsharpSourceLibraryPropertyFact(node, sourceFile, context, host);
    });
  }
}

function recordCsharpSourceLibraryPropertyFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
): void {
  const compiler = context.compiler;
  if (compiler === undefined || !compiler.ast.is.IsPropertyAccessExpression(node)) {
    return;
  }
  if (isCallCalleePropertyAccess(node, compiler.ast)) {
    return;
  }
  const receiver = asNodeSubject(getNodeField(node, "Expression"));
  const name = asNodeSubject(getNodeField(node, "name"));
  if (receiver === undefined || name === undefined) {
    return;
  }
  const propertyName = compiler.ast.text(name);
  const receiverSemanticType = compiler.checker.getTypeAtLocation(receiver, { sourceFile });
  const propertySymbol = compiler.checker.getSymbolAtLocation(name, { sourceFile }) ??
    safeGetResolvedSymbol(name, sourceFile, context) ??
    compiler.checker.getSymbolAtLocation(node, { sourceFile }) ??
    safeGetResolvedSymbol(node, sourceFile, context) ??
    compiler.checker.getPropertyOfType(receiverSemanticType, propertyName, { sourceFile }) ??
    compiler.typeShape.getProperty(receiverSemanticType, propertyName, { sourceFile });
  const declaration = firstSymbolDeclaration(propertySymbol, context);
  const sourceMember = resolveSourceLibraryMemberIdentity(propertySymbol, context) ??
    resolveSourceLibraryMemberIdentity(declaration, context);
  if (sourceMember === undefined) {
    return;
  }
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  if (
    hasRecordedCsharpPropertyOperation(context, node) &&
    hasRecordedGenericPropertyOperation(context, node) &&
    !sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity)
  ) {
    return;
  }
  const mapped = mapCsharpSourceLibraryPropertyOperation({
    expression: node,
    receiver,
    propertyName,
    ...(propertySymbol !== undefined ? { sourceSelectedSymbol: propertySymbol } : {}),
    target: host.targetId,
  }, context, sourceMember, host, { phase: "finalization" });
  if (mapped?.kind === "reject") {
    context.diagnostics.append(mapped.diagnostic);
    return;
  }
  if (mapped?.kind !== "accept") {
    return;
  }
  if (
    context.facts.get(node, targetOperationFactKey) === undefined &&
    context.factResolver.resolve(node, targetOperationFactKey) === undefined
  ) {
    context.facts.set(
      node,
      targetOperationFactKey,
      mapped.value.operation,
      mapped.evidence ?? [{ message: "C# JS surface property operation selected from checked TypeScript library property before finalization." }],
    );
  }
}

function hasRecordedCsharpPropertyOperation(
  context: ExtensionObservationContext,
  node: Node,
): boolean {
  return context.facts.get(node, csharpTargetOperationFactKey) !== undefined ||
    context.factResolver.resolve(node, csharpTargetOperationFactKey) !== undefined;
}

function hasRecordedGenericPropertyOperation(
  context: ExtensionObservationContext,
  node: Node,
): boolean {
  return context.facts.get(node, targetOperationFactKey) !== undefined ||
    context.factResolver.resolve(node, targetOperationFactKey) !== undefined;
}

function safeGetResolvedSymbol(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
): ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getResolvedSymbol"]> | undefined {
  try {
    return context.compiler?.checker.getResolvedSymbol(node, { sourceFile });
  } catch {
    return undefined;
  }
}

function isCallCalleePropertyAccess(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"] | undefined,
): boolean {
  if (ast === undefined) {
    return false;
  }
  const parent = ast.parent(node);
  return parent !== undefined &&
    ast.is.IsCallExpression(parent) &&
    asNodeSubject(getNodeField(parent, "Expression")) === node;
}

function firstSymbolDeclaration(symbol: ReturnType<NonNullable<ExtensionObservationContext["compiler"]>["checker"]["getSymbolAtLocation"]>, context: ExtensionObservationContext): Node | undefined {
  return context.compiler?.checker.getSymbolDeclarations(symbol)[0];
}

function mapCsharpSourceLibraryPropertyOperation(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  sourceMember: SourceLibraryMember | undefined,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" } = {},
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (sourceMember === undefined) {
    return undefined;
  }
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  const receiverType = getSourceLibraryPropertyReceiverType(request, context, selectedIdentity, host);
  const expressionNode = asNodeSubject(request.expression);
  if (
    request.expression !== undefined &&
    sourceLibrarySelectedDeclarationHasCallTarget(
      sourceMember,
      receiverType,
      expressionNode !== undefined && isCallCalleePropertyAccess(expressionNode, context.compiler?.ast),
      requestContext.sourceSelectedDeclaration,
      context,
    )
  ) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(
        `tsonic.csharp.js.${sourceLibraryMemberIdentity(sourceMember)}.callee`,
        "method",
        sourceLibraryMemberIdentity(sourceMember),
      ),
    }, [{ message: `C# JS surface callable property accepted from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'. Call expressions record the concrete target member; standalone callable values require finalized callable carrier facts before emission.` }]);
  }
  const precheck = csharpJsSourceLibraryPropertyPrecheck(selectedIdentity);
  if (precheck === "defer") {
    return undefined;
  }
  if (precheck === "reject-unmapped") {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host, request.expression);
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(sourceMember, host, request.expression);
  if (unsupported !== undefined) {
    return unsupported;
  }
  if (sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity) && options.phase !== "finalization") {
    const deferredOperation = csharpJsSourceLibraryPropertyDeferredOperation(selectedIdentity);
    if (deferredOperation === undefined) {
      return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host, request.expression);
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(
        deferredOperation.operationId,
        "property",
        deferredOperation.targetOperation,
        {
          resultType: csharpJsSourceLibraryPropertyDeferredResultType(selectedIdentity),
        },
      ),
    }, [{ message: `C# JS surface property '${sourceLibraryMemberIdentity(sourceMember)}' accepted from checked TypeScript declaration; target member selection is deferred until finalized receiver carrier facts exist.` }]);
  }
  if (receiverType === undefined && sourceLibraryPropertyRequiresSeededReceiverFacts(selectedIdentity)) {
    return undefined;
  }
  if (!sourceLibraryPropertyReceiverHasClosedFacts(receiverType, selectedIdentity, host)) {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host, request.expression);
  }
  const member = getSourceLibraryPropertyMember(selectedIdentity, receiverType, host);
  if (member === undefined) {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host, request.expression);
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(member), [{ message: `C# JS surface property operation recorded from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity)
      ? targetOperation(member.id, "property", member.sourceName, {
          ...(member.returnType !== undefined ? { resultType: member.returnType } : {}),
        })
      : targetOperationFromMember(member),
  }, [{ message: `C# JS surface target property selected from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
}

function sourceLibraryPropertyRequiresSeededReceiverFacts(selectedIdentity: JsSurfaceSelectedSourceIdentity): boolean {
  return csharpJsSourceLibraryPropertyRequiresSeededReceiverFacts(selectedIdentity);
}

function sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity: JsSurfaceSelectedSourceIdentity): boolean {
  return csharpJsSourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity);
}

function sourceLibraryPropertyReceiverHasClosedFacts(
  receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  host: CsharpJsSurfaceHost,
): boolean {
  return csharpJsSourceLibraryPropertyReceiverHasClosedFacts(receiverType, selectedIdentity, host);
}

function getSourceLibraryPropertyReceiverType(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  host: CsharpJsSurfaceHost,
): ReturnType<CsharpJsSurfaceHost["getTargetTypeRefForSubject"]> {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  if (sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity)) {
    return host.unwrapNullableTargetType(
      getCsharpArrayBoundaryCoreCarrierForReference(request.receiver, context) ??
      context.factResolver.resolve(request.receiver, runtimeCarrierFactKey)?.carrier ??
        host.getTargetTypeRefForSubject(request.receiver, context, {
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: false,
        }),
    );
  }
  if (sourceLibraryPropertyRequiresSeededReceiverFacts(selectedIdentity)) {
    return host.unwrapNullableTargetType(
      host.getTargetTypeRefForSubject(request.receiver, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }) ??
        host.getTargetTypeRefForSubject(requestContext.receiverType, context, {
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: false,
        }) ??
        context.factResolver.resolve(request.receiver, runtimeCarrierFactKey)?.carrier ??
        (requestContext.receiverType === undefined ? undefined : context.factResolver.resolve(requestContext.receiverType, runtimeCarrierFactKey)?.carrier) ??
        host.getTargetTypeRefForSubject(request.receiver, context, {
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: false,
        }) ??
          host.getTargetTypeRefForSubject(requestContext.receiverType, context, {
            allowRuntimeCarrier: true,
            allowSemanticTypeQuery: false,
          }),
    );
  }
  return host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiver, context, csharpJsCheckedTypeQuery) ??
      host.getTargetTypeRefForSubject(requestContext.receiverType, context, csharpJsCheckedTypeQuery),
  );
}

function getSourceLibraryPropertyMember(
  selectedIdentity: JsSurfaceSelectedSourceIdentity,
  receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>,
  host: CsharpJsSurfaceHost,
): TargetMember | undefined {
  return getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity(selectedIdentity, receiverType, host);
}

function sourceLibrarySelectedDeclarationHasCallTarget(
  sourceMember: SourceLibraryMember,
  receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>,
  isCallCallee: boolean,
  sourceSelectedDeclaration: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): boolean {
  if (csharpJsSourceLibraryPropertyAllowsCallableValue(jsSurfaceSelectedSourceIdentityForMember(sourceMember))) {
    return true;
  }
  return (isCallCallee || sourceDeclarationIsCallable(sourceSelectedDeclaration, context)) &&
    csharpJsSourceLibraryMemberHasCallableProvider(sourceMember, {
      contextualDeclaringType: receiverType,
    });
}

function sourceDeclarationIsCallable(
  declaration: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
): boolean {
  const node = asNodeSubject(declaration);
  const compiler = context.compiler;
  if (node === undefined || compiler === undefined) {
    return false;
  }
  switch (compiler.ast.kindName(node)) {
    case "KindMethodSignature":
    case "MethodSignature":
    case "KindMethodDeclaration":
    case "MethodDeclaration":
    case "KindFunctionDeclaration":
    case "FunctionDeclaration":
    case "KindCallSignature":
    case "CallSignature":
    case "KindConstructSignature":
    case "ConstructSignature":
    case "KindConstructor":
    case "Constructor":
    case "KindConstructorType":
    case "ConstructorType":
      return true;
    default:
      return false;
  }
}
