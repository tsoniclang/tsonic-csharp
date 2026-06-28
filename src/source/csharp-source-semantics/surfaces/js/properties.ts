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
  asType,
  createSourceLibraryMember,
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
  getSourceStandardLibraryDeclaringNameForType,
} from "../../source-type-classification.js";

export function mapCsharpDirectSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
  options: { readonly phase?: "checking" | "finalization" } = {},
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const requestContext = getCsharpCheckedPropertyAccessRequestContext(request, context);
  const sourceMember = resolveSourceLibraryMemberIdentity(request.sourceSelectedSymbol, context) ??
    resolveSourceLibraryMemberIdentity(requestContext.sourceSelectedDeclaration, context) ??
    sourceLibraryMemberFromCheckedReceiverType(requestContext.receiverType, request.propertyName, context);
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
  if (
    (context.host.facts.get(node, csharpTargetOperationFactKey) !== undefined ||
      context.factResolver.resolve(node, csharpTargetOperationFactKey) !== undefined) &&
    (context.host.facts.get(node, targetOperationFactKey) !== undefined ||
      context.factResolver.resolve(node, targetOperationFactKey) !== undefined)
  ) {
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
  const propertySymbol = compiler.checker.getSymbolAtLocation(name, { sourceFile }) ??
    safeGetResolvedSymbol(name, sourceFile, context) ??
    compiler.checker.getSymbolAtLocation(node, { sourceFile }) ??
    safeGetResolvedSymbol(node, sourceFile, context);
  const declaration = firstSymbolDeclaration(propertySymbol, context);
  const receiverType = compiler.checker.getTypeAtLocation(receiver, { sourceFile });
  const propertyName = compiler.ast.text(name);
  const sourceMember = resolveSourceLibraryMemberIdentity(declaration, context) ??
    sourceLibraryMemberFromCheckedReceiverType(receiverType, propertyName, context);
  if (sourceMember === undefined) {
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
    context.host.facts.get(node, targetOperationFactKey) === undefined &&
    context.factResolver.resolve(node, targetOperationFactKey) === undefined
  ) {
    context.host.facts.set(
      node,
      targetOperationFactKey,
      mapped.value.operation,
      mapped.evidence ?? [{ message: "C# JS surface property operation selected from checked TypeScript library property before finalization." }],
    );
  }
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

function sourceLibraryMemberFromCheckedReceiverType(
  receiverType: ExtensionFactSubject | undefined,
  propertyName: string | undefined,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  if (receiverType === undefined || propertyName === undefined || propertyName === "") {
    return undefined;
  }
  const type = asType(receiverType);
  if (type === undefined) {
    return undefined;
  }
  const declaringName = getSourceStandardLibraryDeclaringNameForType(type, context);
  return declaringName === undefined
    ? undefined
    : createSourceLibraryMember(declaringName, propertyName);
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
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
  const receiverType = getSourceLibraryPropertyReceiverType(request, context, selectedIdentity, host);
  if (sourceLibrarySelectedDeclarationHasCallTarget(sourceMember, receiverType)) {
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
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  }
  const unsupported = rejectUnsupportedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  if (unsupported !== undefined) {
    return unsupported;
  }
  if (sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity) && options.phase !== "finalization") {
    const deferredOperation = csharpJsSourceLibraryPropertyDeferredOperation(selectedIdentity);
    if (deferredOperation === undefined) {
      return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
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
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
  }
  const member = getSourceLibraryPropertyMember(selectedIdentity, receiverType);
  if (member === undefined) {
    return rejectUnmappedCsharpJsSourceLibraryPropertyAccess(sourceMember, host);
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

function getSourceLibraryPropertyMember(selectedIdentity: JsSurfaceSelectedSourceIdentity, receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>): TargetMember | undefined {
  return getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity(selectedIdentity, receiverType);
}

function sourceLibrarySelectedDeclarationHasCallTarget(
  sourceMember: SourceLibraryMember,
  receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>,
): boolean {
  return csharpJsSourceLibraryMemberHasCallableProvider(sourceMember, {
    contextualDeclaringType: receiverType,
  });
}
