import {
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpJsSurfaceHost,
} from "./source-library.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTargetMemberOperation,
  csharpVoidTargetType,
  recordCsharpTargetMutationOperation,
} from "./source-library.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "../../ast-utils.js";
import {
  getBinaryOperatorText,
} from "../../operator-syntax.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "../../runtime-carriers.js";
import {
  isCsharpJsArrayCarrierTargetType,
} from "./array-carriers.js";
import {
  csharpTargetOperationFactKey,
} from "../../../csharp-facts.js";
import {
  targetTypeRefKey,
} from "../../target-ref-utils.js";

export const csharpJsArrayDeleteAtOperationId = "tsonic.csharp.js.array.deleteAt";
export const csharpJsArraySetLengthOperationId = "tsonic.csharp.js.array.setLength";
export const csharpJsArrayLengthPropertyOperationIds = new Set([
  "tsonic.csharp.js.Array.length",
  "tsonic.csharp.js.ReadonlyArray.length",
]);

type LifecycleContext = {
  readonly host: ExtensionObservationContext["host"];
  readonly compiler?: ExtensionObservationContext["compiler"];
};

export function recordCsharpJsArrayMutationFactsBeforeFinalization(
  lifecycleContext: LifecycleContext,
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
      recordDeleteElementFact(node, sourceFile, context, host);
      recordLengthMutationFact(node, sourceFile, context, host);
    });
  }
}

function recordDeleteElementFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): void {
  const compiler = context.compiler;
  if (compiler === undefined || !compiler.ast.is.IsDeleteExpression(node)) {
    return;
  }
  const operand = asNodeSubject(getNodeField(node, "Expression"));
  if (operand === undefined || !compiler.ast.is.IsElementAccessExpression(operand)) {
    context.diagnostics.append(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_JS_ARRAY_DELETE_REQUIRES_ELEMENT_ACCESS", 9100140, "C# JS surface delete emission currently requires a checked array element access target."));
    return;
  }
  const receiver = asNodeSubject(getNodeField(operand, "Expression"));
  const argument = asNodeSubject(getNodeField(operand, "ArgumentExpression"));
  if (receiver === undefined || argument === undefined) {
    context.diagnostics.append(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_JS_ARRAY_DELETE_REQUIRES_ELEMENT_ACCESS", 9100140, "C# JS surface delete emission requires finalized receiver and index expressions."));
    return;
  }
  const receiverCarrier = getJsArrayCarrierForReceiver(receiver, sourceFile, context, host);
  if (!isCsharpJsArrayCarrierTargetType(receiverCarrier)) {
    context.diagnostics.append(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_JS_ARRAY_DELETE_REQUIRES_JSARRAY", 9100141, "C# JS surface delete on arrays requires a finalized closed JSArray carrier; dense List<T> and CLR T[] cannot model holes.", [
      { message: `Resolved receiver carrier: ${receiverCarrier === undefined ? "missing" : targetTypeRefKey(receiverCarrier)}.` },
    ]));
    return;
  }
  if (!hasIntegralIndex(argument, context, host)) {
    context.diagnostics.append(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_NON_INTEGRAL_ARRAY_INDEX", 9100111, "C# JS surface array delete requires an integral provider-backed index type."));
    return;
  }
  const resultType = csharpSourcePrimitiveTargetType("bool");
  const operation = csharpTargetMemberOperation(csharpJsArrayDeleteAtOperationId, "method", "deleteAt", {
    declaringType: receiverCarrier,
    resultType,
    argumentProjection: [{ kind: "source-argument", index: 0 }],
  });
  recordCsharpTargetMutationOperation(context, node, operation, [{ message: "C# JS surface array delete mutation operation recorded from checked TypeScript delete element expression and finalized JSArray carrier." }]);
}

function recordLengthMutationFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): void {
  const compiler = context.compiler;
  if (compiler === undefined || !compiler.ast.is.IsBinaryExpression(node) || getBinaryOperatorText(compiler.ast, node) !== "=") {
    return;
  }
  const left = asNodeSubject(getNodeField(node, "Left"));
  const right = asNodeSubject(getNodeField(node, "Right"));
  if (left === undefined || right === undefined || !compiler.ast.is.IsPropertyAccessExpression(left)) {
    return;
  }
  if (!hasSelectedJsArrayLengthPropertyFact(left, context)) {
    return;
  }
  const receiver = asNodeSubject(getNodeField(left, "Expression"));
  if (receiver === undefined) {
    context.diagnostics.append(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_JS_ARRAY_LENGTH_SET_REQUIRES_RECEIVER", 9100142, "C# JS surface Array.length mutation requires a finalized receiver expression."));
    return;
  }
  const receiverCarrier = getJsArrayCarrierForReceiver(receiver, sourceFile, context, host);
  if (!isCsharpJsArrayCarrierTargetType(receiverCarrier)) {
    context.diagnostics.append(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_JS_ARRAY_LENGTH_SET_REQUIRES_JSARRAY", 9100143, "C# JS surface Array.length mutation requires a finalized closed JSArray carrier; dense List<T> and CLR T[] cannot model length growth, truncation, and holes.", [
      { message: `Resolved receiver carrier: ${receiverCarrier === undefined ? "missing" : targetTypeRefKey(receiverCarrier)}.` },
    ]));
    return;
  }
  if (!hasIntegralIndex(right, context, host)) {
    context.diagnostics.append(host.csharpProviderDiagnostic(host.extensionId, "CSHARP_JS_ARRAY_LENGTH_SET_REQUIRES_INTEGER", 9100144, "C# JS surface Array.length mutation requires an integral provider-backed length expression."));
    return;
  }
  const operation = csharpTargetMemberOperation(csharpJsArraySetLengthOperationId, "method", "setLength", {
    declaringType: receiverCarrier,
    resultType: csharpVoidTargetType(),
    argumentProjection: [{ kind: "source-argument", index: 0 }],
  });
  recordCsharpTargetMutationOperation(context, node, operation, [{ message: "C# JS surface Array.length mutation operation recorded from checked TypeScript assignment and finalized JSArray carrier." }]);
  void sourceFile;
}

function hasSelectedJsArrayLengthPropertyFact(
  propertyAccess: Node,
  context: ExtensionObservationContext,
): boolean {
  const selected = context.factResolver.resolve(propertyAccess, targetOperationFactKey);
  const csharpOperation = context.factResolver.resolve(propertyAccess, csharpTargetOperationFactKey);
  return selected !== undefined &&
    csharpJsArrayLengthPropertyOperationIds.has(selected.operationId) &&
    csharpOperation?.kind === "member" &&
    csharpOperation.operationKind === "property";
}

function getJsArrayCarrierForReceiver(
  receiver: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const type = context.compiler?.checker.getTypeAtLocation(receiver, { sourceFile });
  return context.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
    host.getTargetTypeRefForSubject(receiver, context, { allowRuntimeCarrier: true, sourceFile }) ??
    host.getTargetTypeRefForSubject(type, context, { allowRuntimeCarrier: true, sourceFile });
}

function hasIntegralIndex(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): boolean {
  const sourceFile = context.compiler?.ast.getSourceFile(node);
  const semanticType = sourceFile === undefined
    ? undefined
    : context.compiler?.checker.getTypeAtLocation(node, { sourceFile });
  const indexType = host.getTargetTypeRefForSubject(node, context, { allowSemanticTypeQuery: true }) ??
    host.getTargetTypeRefForSubject(semanticType, context, { allowSemanticTypeQuery: true });
  return host.isIntegralTargetTypeRef(indexType) ||
    host.isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), node, context);
}
