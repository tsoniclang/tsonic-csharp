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
  isCsharpUserSourceFile,
  visitAstReaderNodes,
} from "../../../ast-utils.js";
import {
  csharpTargetId,
} from "../../../identity.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../../runtime-carriers.js";
export function mapCsharpJsArrayElementAccess(
  request: CheckedElementAccessMappingRequest,
  context: ExtensionObservationContext<"operation.mapCheckedElementAccess">,
  receiverCarrier: TargetTypeRef | undefined,
  semanticReceiverType: TargetTypeRef | undefined,
  host: CsharpJsSurfaceHost,
): ExtensionObservation<CheckedOperationMappingResult> | undefined {
  const elementType = getCsharpArrayLikeElementType(receiverCarrier ?? semanticReceiverType);
  if (elementType === undefined) {
    return undefined;
  }
  const existingOperation = context.factResolver.resolve(request.expression, targetOperationFactKey);
  if (existingOperation !== undefined) {
    if (
      existingOperation.operationKind === "indexer" &&
      receiverCarrier !== undefined &&
      context.factResolver.resolve(request.expression, csharpTargetOperationFactKey) === undefined &&
      context.facts.get(request.expression, csharpTargetOperationFactKey) === undefined
    ) {
      recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation(existingOperation.operationId, "indexer", "Item", {
        resultType: elementType,
      }), [{ message: "C# JS surface array indexer C# operation recorded from finalized receiver carrier for an existing checked target operation." }]);
    }
    return acceptObservation<CheckedOperationMappingResult>({
      operation: existingOperation,
    }, [{ message: "C# JS surface array indexer reused existing finalized target operation for repeated checked-element observation." }]);
  }
  const existingCsharpOperation = context.factResolver.resolve(request.expression, csharpTargetOperationFactKey) ??
    context.facts.get(request.expression, csharpTargetOperationFactKey);
  if (existingCsharpOperation?.kind === "member" && existingCsharpOperation.operationKind === "indexer") {
    return acceptObservation<CheckedOperationMappingResult>({
      operation: targetOperation(existingCsharpOperation.operationId, "indexer", "System.Array.Item", {
        ...(existingCsharpOperation.resultType !== undefined ? { resultType: existingCsharpOperation.resultType } : {}),
      }),
    }, [{ message: "C# JS surface array indexer reused existing finalized C# target indexer operation after proving no canonical target operation already exists." }]);
  }
  const literalIndex = host.isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), request.argument, context);
  const indexType = literalIndex
    ? undefined
    : host.getTargetTypeRefForSubject(request.argument, context, csharpJsCheckedTypeQuery);
  if (!literalIndex && !host.isIntegralTargetTypeRef(indexType)) {
    return rejectObservation(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100111, "C# JS surface array element access requires an integral provider-backed index type."));
  }
  if (receiverCarrier !== undefined) {
    recordCsharpTargetOperation(context, request.expression, csharpTargetMemberOperation("tsonic.csharp.js.array.indexer", "indexer", "Item", {
      resultType: elementType,
    }), [{ message: "C# JS surface array indexer operation recorded from finalized array receiver carrier facts." }]);
  }
  return acceptObservation<CheckedOperationMappingResult>({
    operation: targetOperation("tsonic.csharp.js.array.indexer", "indexer", "System.Array.Item", {
      resultType: elementType,
    }),
  }, [{ message: receiverCarrier === undefined
    ? "C# JS surface array indexer selected from checked TypeScript array semantics; C# operation finalization still requires receiver carrier facts."
    : "C# JS surface array indexer selected from finalized array receiver carrier facts." }]);
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
    if (!isCsharpUserSourceFile(sourceFile, compiler.ast)) {
      continue;
    }
    visitAstReaderNodes(compiler.ast, sourceFile, (node) => {
      if (
        !compiler.ast.is.IsElementAccessExpression(node) ||
        context.facts.get(node, csharpTargetOperationFactKey) !== undefined ||
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
  const receiverCarrier = getFinalizedArrayElementReceiverCarrier(receiver, context, host);
  const request = {
    expression: node,
    receiver,
    argument,
    target: csharpTargetId,
  } satisfies CheckedElementAccessMappingRequest;
  const mapped = mapCsharpJsArrayElementAccess(
    request,
    context as ExtensionObservationContext<"operation.mapCheckedElementAccess">,
    receiverCarrier,
    receiverCarrier,
    host,
  );
  if (mapped?.kind === "reject") {
    context.diagnostics.append(mapped.diagnostic);
    return;
  }
  if (mapped?.kind !== "accept") {
    return;
  }
  const existingOperation = context.facts.get(node, targetOperationFactKey) ??
    context.factResolver.resolve(node, targetOperationFactKey);
  if (existingOperation !== undefined) {
    return;
  }
  const csharpOperation = context.facts.get(node, csharpTargetOperationFactKey);
  context.facts.set(node, targetOperationFactKey, csharpOperation?.kind === "member" && csharpOperation.operationKind === "indexer"
    ? targetOperation(csharpOperation.operationId, "indexer", "System.Array.Item", {
        ...(csharpOperation.resultType !== undefined ? { resultType: csharpOperation.resultType } : {}),
      })
    : mapped.value.operation, mapped.evidence ?? [{ message: "C# JS surface array indexer selected from checked TypeScript element access." }]);
}

function getFinalizedArrayElementReceiverCarrier(
  receiver: Node,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  return host.unwrapNullableTargetType(
    context.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
      host.getTargetTypeRefForSubject(receiver, context, {
        allowRuntimeCarrier: true,
        allowSemanticTypeQuery: false,
      }),
  );
}
