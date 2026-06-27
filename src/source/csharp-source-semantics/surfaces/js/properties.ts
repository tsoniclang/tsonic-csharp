import {
  ExtensionObservationPoint,
  acceptObservation,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  CheckedOperationMappingResult,
  CheckedPropertyAccessMappingRequest,
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
  csharpJsSourceLibraryPropertyReceiverHasClosedFacts,
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
import type {
  JsSurfaceSelectedSourceIdentity,
} from "./target-member-metadata.js";
import {
  jsSurfaceSelectedSourceIdentityForMember,
} from "./target-member-metadata.js";

export function mapCsharpDirectSourceLibraryCheckedPropertyAccess(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const sourceMember = resolveSourceLibraryMemberIdentity(request.sourceSelectedDeclaration, context);
  return mapCsharpSourceLibraryPropertyOperation(request, context, sourceMember, host);
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
    context.host.facts.get(node, csharpTargetOperationFactKey) !== undefined
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
  const declaration = firstSymbolDeclaration(propertySymbol);
  const receiverType = compiler.checker.getTypeAtLocation(receiver, { sourceFile });
  const sourceMember = resolveSourceLibraryMemberIdentity(declaration, context);
  if (sourceMember === undefined) {
    return;
  }
  const mapped = mapCsharpSourceLibraryPropertyOperation({
    expression: node,
    receiver,
    ...(receiverType !== undefined ? { receiverType } : {}),
    propertyName: compiler.ast.text(name),
    ...(propertySymbol !== undefined ? { sourceSelectedPropertySymbol: propertySymbol } : {}),
    ...(declaration !== undefined ? { sourceSelectedDeclaration: declaration } : {}),
    target: host.targetId,
  }, context, sourceMember, host);
  if (mapped?.kind === "reject") {
    context.diagnostics.append(mapped.diagnostic);
    return;
  }
  if (mapped?.kind !== "accept") {
    return;
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

function firstSymbolDeclaration(symbol: unknown): Node | undefined {
  return ((symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (symbol as { readonly declarations?: readonly Node[] } | undefined)?.declarations)?.[0];
}

function mapCsharpSourceLibraryPropertyOperation(
  request: CheckedPropertyAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedPropertyAccess">,
  sourceMember: SourceLibraryMember | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  if (sourceMember === undefined) {
    return undefined;
  }
  if (sourceLibrarySelectedDeclarationHasCallTarget(sourceMember)) {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(
        `tsonic.csharp.js.${sourceLibraryMemberIdentity(sourceMember)}.callee`,
        "method",
        sourceLibraryMemberIdentity(sourceMember),
      ),
    }, [{ message: `C# JS surface callable property accepted from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'. Call expressions record the concrete target member; standalone callable values require finalized callable carrier facts before emission.` }]);
  }
  const selectedIdentity = jsSurfaceSelectedSourceIdentityForMember(sourceMember);
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
  const receiverType = getSourceLibraryPropertyReceiverType(request, context, selectedIdentity, host);
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
  if (!sourceLibraryPropertyRequiresFinalCarrierSelection(selectedIdentity) || receiverType?.kind !== "array") {
    recordCsharpTargetOperation(context, request.expression, csharpTargetOperationFromMember(member), [{ message: `C# JS surface property operation recorded from checked TypeScript library declaration '${sourceLibraryMemberIdentity(sourceMember)}'.` }]);
  }
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
  if (sourceLibraryPropertyRequiresSeededReceiverFacts(selectedIdentity)) {
    return host.unwrapNullableTargetType(
      host.getTargetTypeRefForSubject(request.receiver, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }) ??
        host.getTargetTypeRefForSubject(request.receiverType, context, {
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: false,
        }) ??
        context.factResolver.resolve(request.receiver, runtimeCarrierFactKey)?.carrier ??
        (request.receiverType === undefined ? undefined : context.factResolver.resolve(request.receiverType, runtimeCarrierFactKey)?.carrier) ??
        host.getTargetTypeRefForSubject(request.receiver, context, {
          allowRuntimeCarrier: true,
          allowSemanticTypeQuery: false,
        }) ??
          host.getTargetTypeRefForSubject(request.receiverType, context, {
            allowRuntimeCarrier: true,
            allowSemanticTypeQuery: false,
          }),
    );
  }
  return host.unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(request.receiver, context, csharpJsCheckedTypeQuery) ??
      host.getTargetTypeRefForSubject(request.receiverType, context, csharpJsCheckedTypeQuery),
  );
}

function getSourceLibraryPropertyMember(selectedIdentity: JsSurfaceSelectedSourceIdentity, receiverType: ReturnType<typeof getSourceLibraryPropertyReceiverType>): TargetMember | undefined {
  return getCsharpJsSourceLibraryPropertyMemberForSelectedIdentity(selectedIdentity, receiverType);
}

function sourceLibrarySelectedDeclarationHasCallTarget(sourceMember: SourceLibraryMember): boolean {
  return csharpJsSourceLibraryMemberHasCallableProvider(sourceMember);
}
