import {
  acceptObservation,
  rejectObservation,
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  CheckedElementAccessMappingRequest,
  CheckedOperationMappingResult,
  ExtensionObservation,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
  Type,
} from "@tsonic/tsts";
import type { CsharpJsSurfaceHost } from "../source-library.js";
import {
  csharpJsCheckedTypeQuery,
  csharpSourcePrimitiveTargetType,
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  targetOperation,
} from "../source-library.js";
import {
  csharpTargetOperationFactKey,
} from "../../../../csharp-facts.js";
import {
  getCsharpArrayLikeElementType,
} from "../array-carriers.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import {
  csharpTargetId,
} from "../../../identity.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
import {
  isSourceLibraryType,
} from "../../../source-library.js";

export function mapCsharpJsArrayElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  receiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const elementType = getCsharpArrayLikeElementType(receiverType);
  if (elementType === undefined) {
    return undefined;
  }
  const indexType = host.getTargetTypeRefForSubject(request.argument, context, csharpJsCheckedTypeQuery);
  if (!host.isIntegralTargetTypeRef(indexType) && !host.isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context)) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100111, "C# JS surface array element access requires an integral provider-backed index type."));
  }
  recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation("tsonic.csharp.js.array.indexer", "indexer", "Item", {
    resultType: elementType,
  }), [{ message: "C# JS surface array indexer operation recorded from checked TypeScript element access." }]);
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.js.array.indexer", "indexer", "System.Array.Item", {
      resultType: elementType,
    }),
  }, [{ message: "C# JS surface array indexer selected from checked TypeScript element access." }]);
}

export function recordCsharpJsArrayElementAccessFactsBeforeFinalization(
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
  host: CsharpJsSurfaceHost,
): void {
  const compiler = lifecycleContext.compiler;
  if (compiler === undefined) {
    return;
  }
  const context = createRuntimeCarrierLifecycleObservationContext(lifecycleContext);
  for (const sourceFile of compiler.getSourceFiles()) {
    if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (
        !compiler.ast.is.IsElementAccessExpression(node) ||
        context.host.facts.get(node, targetOperationFactKey) !== undefined ||
        context.host.facts.get(node, csharpTargetOperationFactKey) !== undefined ||
        context.factResolver.resolve(node, targetOperationFactKey) !== undefined ||
        context.factResolver.resolve(node, csharpTargetOperationFactKey) !== undefined
      ) {
        return;
      }
      recordCsharpJsArrayElementAccessFact(node, context, host);
    });
  }
}

function recordCsharpJsArrayElementAccessFact(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): void {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return;
  }
  const receiver = asNodeSubject(getNodeField(node, "Expression"));
  const argument = asNodeSubject(getNodeField(node, "ArgumentExpression"));
  const sourceFile = compiler.ast.getSourceFile(node);
  if (receiver === undefined || argument === undefined || sourceFile === undefined) {
    return;
  }
  const receiverType = compiler.checker.getTypeAtLocation(receiver, { sourceFile });
  const receiverCarrier = getFinalizedArrayElementReceiverCarrier(receiver, receiverType, context, host);
  const request = {
    expression: node,
    receiver,
    receiverType,
    argument,
    target: csharpTargetId,
  } satisfies CheckedElementAccessMappingRequest;
  const mapped = mapCsharpJsArrayElementAccess(
    request,
    context as ExtensionObservationContext<"operation.mapCheckedElementAccess">,
    receiverCarrier,
    host,
  );
  if (mapped?.kind === "reject") {
    context.diagnostics.append(mapped.diagnostic);
    return;
  }
  if (mapped?.kind !== "accept") {
    if (receiverCarrier === undefined && isSourceLibraryArrayType(receiverType, context)) {
      context.diagnostics.append(host.csharpProviderDiagnostic(
        host.extensionId,
        "CSHARP_JS_ARRAY_ELEMENT_ACCESS_REQUIRES_CARRIER",
        9100145,
        "C# JS surface array element access requires finalized array runtime carrier facts; semantic TypeScript Array<T> shape is not enough for target emission.",
      ));
    }
    return;
  }
  const csharpOperation = context.host.facts.get(node, csharpTargetOperationFactKey);
  context.host.facts.set(node, targetOperationFactKey, csharpOperation?.kind === "member" && csharpOperation.operationKind === "indexer"
    ? targetOperation(csharpOperation.operationId, "indexer", csharpOperation.memberName, {
        ...(csharpOperation.resultType !== undefined ? { resultType: csharpOperation.resultType } : {}),
      })
    : mapped.value.operation, mapped.evidence ?? [{ message: "C# JS surface array indexer selected from checked TypeScript element access." }]);
}

function getFinalizedArrayElementReceiverCarrier(
  receiver: Node,
  receiverType: Type | undefined,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return host.unwrapNullableTargetType(
    context.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
      (receiverType === undefined ? undefined : context.factResolver.resolve(receiverType, runtimeCarrierFactKey)?.carrier) ??
      host.getTargetTypeRefForSubject(receiver, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }) ??
      host.getTargetTypeRefForSubject(receiverType, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }),
  );
}

function isSourceLibraryArrayType(
  type: Type | undefined,
  context: ExtensionObservationContext,
): boolean {
  return type !== undefined &&
    (
      isSourceLibraryType(type, context, "Array") ||
      isSourceLibraryType(type, context, "ReadonlyArray")
    );
}
