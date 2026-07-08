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
  recordCsharpTargetMutationOperation,
} from "./source-library.js";
import {
  asNodeSubject,
  getNodeField,
  isCsharpUserSourceFile,
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
  getCsharpArrayBoundaryCoreCarrierForReference,
} from "./array-boundary-facts.js";

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
    if (!isCsharpUserSourceFile(sourceFile, compiler.ast)) {
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
    return;
  }
  const receiver = asNodeSubject(getNodeField(operand, "Expression"));
  const argument = asNodeSubject(getNodeField(operand, "ArgumentExpression"));
  if (receiver === undefined || argument === undefined) {
    return;
  }
  const receiverCarrier = getJsArrayCarrierForReceiver(receiver, sourceFile, context, host);
  if (!isCsharpJsArrayCarrierTargetType(receiverCarrier)) {
    return;
  }
  if (!hasIntegralIndex(argument, context, host)) {
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
    return;
  }
  const receiverCarrier = getJsArrayCarrierForReceiver(receiver, sourceFile, context, host);
  if (!isCsharpJsArrayCarrierTargetType(receiverCarrier)) {
    return;
  }
  if (!hasIntegralIndex(right, context, host)) {
    return;
  }
  const operation = csharpTargetMemberOperation(csharpJsArraySetLengthOperationId, "method", "setLength", {
    declaringType: receiverCarrier,
    resultType: csharpSourcePrimitiveTargetType("int32"),
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
    selected.operationKind === "property" &&
    (
      csharpOperation === undefined ||
      (csharpOperation.kind === "member" && csharpOperation.operationKind === "property")
    );
}

function getJsArrayCarrierForReceiver(
  receiver: Node,
  sourceFile: SourceFile,
  context: ExtensionObservationContext,
  host: CsharpJsSurfaceHost,
): TargetTypeRef | undefined {
  const type = context.compiler?.checker.getTypeAtLocation(receiver, { sourceFile });
  const candidates = [
    getCsharpArrayBoundaryCoreCarrierForReference(receiver, context, sourceFile),
    context.factResolver.resolve(receiver, runtimeCarrierFactKey)?.carrier,
    host.getTargetTypeRefForSubject(receiver, context, { allowRuntimeCarrier: true, sourceFile }),
    host.getTargetTypeRefForSubject(type, context, { allowRuntimeCarrier: true, sourceFile }),
  ];
  return candidates.find(isCsharpJsArrayCarrierTargetType) ??
    candidates.find((candidate) => candidate !== undefined);
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
  const indexType = host.getTargetTypeRefForSubject(node, context, { allowSemanticTypeQuery: true, sourceFile }) ??
    host.getTargetTypeRefForSubject(semanticType, context, { allowSemanticTypeQuery: true, sourceFile });
  return host.isIntegralTargetTypeRef(indexType) ||
    host.isLiteralRepresentableAsTargetType(csharpSourcePrimitiveTargetType("int32"), node, context);
}
