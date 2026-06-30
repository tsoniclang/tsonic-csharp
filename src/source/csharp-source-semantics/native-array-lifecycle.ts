import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  runtimeCarrierFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import {
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
} from "../../providers/dotnet/native-array.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "./ast-utils.js";
import type {
  CsharpOperationsProviderHost,
} from "./operations-provider.js";
import {
  csharpTargetMemberOperation,
  recordTargetOperationFact,
  recordCsharpTargetOperation,
  targetOperation,
} from "./operations.js";
import {
  csharpTargetOperationFactKey,
} from "../csharp-facts.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carrier-context.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  csharpSourcePrimitiveTargetType,
} from "./target-types.js";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import {
  isIntegralTargetTypeRef,
  unwrapNullableTargetType,
} from "./target-rules.js";
import {
  asNativeArrayTargetType,
} from "./checked-member-access-mapping/lifecycle-helpers.js";

type LifecycleContext = {
  readonly host: ExtensionObservationContext["host"];
  readonly compiler?: ExtensionObservationContext["compiler"];
};

export function recordCsharpNativeArrayFactsBeforeFinalization(
  lifecycleContext: LifecycleContext,
  host: CsharpOperationsProviderHost,
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
      recordNativeArrayLengthFact(node, sourceFile, context, host);
      recordNativeArrayElementAccessFact(node, sourceFile, context, host);
    });
  }
}

function recordNativeArrayLengthFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): void {
  const compiler = context.compiler;
  if (
    compiler === undefined ||
    !compiler.ast.is.IsPropertyAccessExpression(node) ||
    hasCsharpTargetOperationFact(context, node)
  ) {
    return;
  }
  const receiver = asNodeSubject(getNodeField(node, "Expression"));
  if (receiver === undefined) {
    return;
  }
  const receiverType = getNativeArrayReceiverType(receiver, sourceFile, context, host);
  if (receiverType?.kind !== "array") {
    return;
  }
  const propertyName = compiler.ast.text(compiler.ast.name(node));
  if (propertyName !== "length") {
    return;
  }
  if (selectedOperationConflictsWithNativeArray(context, node, "property", dotnetNativeArrayLengthMemberId)) {
    return;
  }
  const resultType = csharpSourcePrimitiveTargetType("int32");
  const operationId = getSelectedOperationIdOrDefault(context, node, "property", dotnetNativeArrayLengthMemberId);
  recordNativeArrayTargetOperationIfMissing(context, node, operationId, "property", "System.Array.Length", resultType, [{ message: "C# native array length selected from checked TypeScript Array.length declaration and finalized native array carrier." }]);
  recordCsharpTargetOperation(context, node, csharpTargetMemberOperation(operationId, "property", "Length", {
    declaringType: receiverType,
    resultType,
  }), [{ message: "C# native array length operation recorded from checked TypeScript Array.length declaration and finalized native array carrier." }]);
}

function recordNativeArrayElementAccessFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): void {
  const compiler = context.compiler;
  if (
    compiler === undefined ||
    !compiler.ast.is.IsElementAccessExpression(node) ||
    hasCsharpTargetOperationFact(context, node)
  ) {
    return;
  }
  const receiver = asNodeSubject(getNodeField(node, "Expression"));
  const argument = asNodeSubject(getNodeField(node, "ArgumentExpression"));
  if (receiver === undefined || argument === undefined) {
    return;
  }
  const receiverType = getNativeArrayReceiverType(receiver, sourceFile, context, host);
  if (receiverType?.kind !== "array") {
    return;
  }
  if (!hasIntegralIndex(argument, context, host)) {
    context.diagnostics.append(csharpProviderDiagnostic(
      "tsonic.csharp.operations",
      "CSHARP_NON_INTEGRAL_ARRAY_INDEX",
      9100109,
      "C# native array element access requires an integral TSTS/provider-backed index type.",
    ));
    return;
  }
  if (selectedOperationConflictsWithNativeArray(context, node, "indexer", dotnetNativeArrayIndexerMemberId)) {
    return;
  }
  const operationId = getSelectedOperationIdOrDefault(context, node, "indexer", dotnetNativeArrayIndexerMemberId);
  recordNativeArrayTargetOperationIfMissing(context, node, operationId, "indexer", "System.Array.Item", receiverType.element, [{ message: "C# native array indexer selected from checked TypeScript element access and finalized native array carrier." }]);
  recordCsharpTargetOperation(context, node, csharpTargetMemberOperation(operationId, "indexer", "Item", {
    declaringType: receiverType,
    resultType: receiverType.element,
  }), [{ message: "C# native array indexer operation recorded from checked TypeScript element access and finalized native array carrier." }]);
}

function recordNativeArrayTargetOperationIfMissing(
  context: ExtensionObservationContext,
  node: Node,
  operationId: string,
  operationKind: "property" | "indexer",
  targetOperationName: string,
  resultType: TargetTypeRef,
  evidence: readonly { readonly message: string }[],
): void {
  const existing = context.host.facts.get(node, targetOperationFactKey) ??
    context.factResolver.resolve(node, targetOperationFactKey);
  if (existing !== undefined) {
    return;
  }
  recordTargetOperationFact(context, node, targetOperation(operationId, operationKind, targetOperationName, {
    resultType,
  }), evidence);
}

function selectedOperationConflictsWithNativeArray(
  context: ExtensionObservationContext,
  node: Node,
  operationKind: "property" | "indexer",
  nativeOperationId: string,
): boolean {
  const selected = context.host.facts.get(node, targetOperationFactKey) ??
    context.factResolver.resolve(node, targetOperationFactKey);
  return selected !== undefined &&
    (selected.operationKind !== operationKind || selected.operationId !== nativeOperationId);
}

function hasCsharpTargetOperationFact(
  context: ExtensionObservationContext,
  node: Node,
): boolean {
  return context.host.facts.get(node, csharpTargetOperationFactKey) !== undefined ||
    context.factResolver.resolve(node, csharpTargetOperationFactKey) !== undefined;
}

function getNativeArrayReceiverType(
  receiver: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  void host;
  void sourceFile;
  return asNativeArrayTargetType(unwrapNullableTargetType(
    context.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier ??
      context.host.facts.get(receiver, runtimeCarrierFactKey)?.carrier,
  ));
}

function hasIntegralIndex(
  node: Node,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): boolean {
  const sourceFile = context.compiler?.ast.getSourceFile(node);
  const semanticType = sourceFile === undefined
    ? undefined
    : context.compiler?.checker.getTypeAtLocation(node, { sourceFile });
  const indexType = host.getTargetTypeRefForSubject(node, context, { allowSemanticTypeQuery: true }) ??
    host.getTargetTypeRefForSubject(semanticType, context, { allowSemanticTypeQuery: true });
  return isIntegralTargetTypeRef(indexType) ||
    isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), node, context);
}

function getSelectedOperationIdOrDefault(
  context: ExtensionObservationContext,
  node: Node,
  operationKind: "property" | "indexer",
  defaultOperationId: string,
): string {
  const selected = context.host.facts.get(node, targetOperationFactKey) ??
    context.factResolver.resolve(node, targetOperationFactKey);
  return selected?.operationKind === operationKind
    ? selected.operationId
    : defaultOperationId;
}
