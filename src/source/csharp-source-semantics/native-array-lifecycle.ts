import {
  targetOperationFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  dotnetNativeArrayIndexerMemberId,
  dotnetNativeArrayLengthMemberId,
  dotnetNativeArrayTypeId,
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
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  csharpTargetMemberOperation,
  recordCsharpTargetOperation,
  targetOperation,
} from "./operations.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carrier-context.js";
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
  if (compiler === undefined || !compiler.ast.is.IsPropertyAccessExpression(node) || context.host.facts.get(node, targetOperationFactKey) !== undefined) {
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
  const member = host.getCsharpTargetBindingByTargetId(dotnetNativeArrayTypeId)?.members?.find((candidate) => candidate.id === dotnetNativeArrayLengthMemberId);
  const propertyName = compiler.ast.text(compiler.ast.name(node));
  if (member === undefined || member.sourceName !== propertyName) {
    context.diagnostics.append(csharpProviderDiagnostic(
      "tsonic.csharp.operations",
      "CSHARP_NATIVE_ARRAY_PROPERTY_NOT_SUPPORTED",
      9100136,
      "C# native array property access requires the provider-owned native array length member; other JavaScript array properties require an explicit selected surface.",
    ));
    return;
  }
  const resultType = csharpSourcePrimitiveTargetType("int32");
  recordCsharpTargetOperation(context, node, csharpTargetMemberOperation(dotnetNativeArrayLengthMemberId, "property", "Length", {
    declaringType: receiverType,
    resultType,
  }), [{ message: "C# native array length operation recorded from checked TypeScript Array.length declaration and finalized native array carrier." }]);
  context.host.facts.set(node, targetOperationFactKey, targetOperation(dotnetNativeArrayLengthMemberId, "property", "System.Array.Length", {
    resultType,
  }), [{ message: "C# native array length selected from checked TypeScript Array.length declaration and finalized native array carrier." }]);
}

function recordNativeArrayElementAccessFact(
  node: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): void {
  const compiler = context.compiler;
  if (compiler === undefined || !compiler.ast.is.IsElementAccessExpression(node) || context.host.facts.get(node, targetOperationFactKey) !== undefined) {
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
  const member = host.getCsharpTargetBindingByTargetId(dotnetNativeArrayTypeId)?.members?.find((candidate) => candidate.id === dotnetNativeArrayIndexerMemberId);
  if (member === undefined) {
    context.diagnostics.append(csharpProviderDiagnostic(
      "tsonic.csharp.operations",
      "CSHARP_TARGET_INDEXER_NOT_FOUND",
      9100103,
      "C# native array element access requires the provider-owned native array indexer member.",
    ));
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
  recordCsharpTargetOperation(context, node, csharpTargetMemberOperation(dotnetNativeArrayIndexerMemberId, "indexer", "Item", {
    declaringType: receiverType,
    resultType: receiverType.element,
  }), [{ message: "C# native array indexer operation recorded from checked TypeScript element access and finalized native array carrier." }]);
  context.host.facts.set(node, targetOperationFactKey, targetOperation(dotnetNativeArrayIndexerMemberId, "indexer", "System.Array.Item", {
    resultType: receiverType.element,
  }), [{ message: "C# native array indexer selected from checked TypeScript element access and finalized native array carrier." }]);
}

function getNativeArrayReceiverType(
  receiver: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpOperationsProviderHost,
): TargetTypeRef | undefined {
  const type = context.compiler?.checker.getTypeAtLocation(receiver, { sourceFile });
  return unwrapNullableTargetType(
    host.getTargetTypeRefForSubject(receiver, context, { allowRuntimeCarrier: true, sourceFile }) ??
      host.getTargetTypeRefForSubject(type, context, { allowRuntimeCarrier: true, sourceFile }),
  );
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
