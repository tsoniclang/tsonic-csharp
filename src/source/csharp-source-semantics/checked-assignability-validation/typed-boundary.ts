import {
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpProviderDiagnostic,
} from "../diagnostics.js";
import {
  getNodeField,
} from "../ast-utils.js";
import {
  getBinaryOperatorText,
} from "../operator-syntax.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "../target-types.js";
import {
  getEnclosingReturnTargetCarrier,
} from "./context-nodes.js";
import {
  asNode,
  subjectIdentity,
} from "./subjects.js";

export function diagnoseAnyTypedBoundaryForNode(
  node: Node,
  context: ExtensionObservationContext<"target.validatePostCheckAssignability">,
): boolean {
  const compiler = context.compiler;
  if (compiler === undefined) {
    return false;
  }
  const ast = compiler.ast;
  if (ast.is.IsBinaryExpression(node) && getBinaryOperatorText(ast, node) === "=") {
    return appendAnyBoundaryDiagnostic(
      node,
      context,
      context.facts.get(asNode(getNodeField(node, "Right")), runtimeCarrierFactKey)?.carrier,
      context.facts.get(asNode(getNodeField(node, "Left")), runtimeCarrierFactKey)?.carrier,
    );
  }
  const kind = ast.kindName(node);
  if (kind === "KindVariableDeclaration" || kind === "KindPropertyDeclaration") {
    return appendAnyBoundaryDiagnostic(
      node,
      context,
      context.facts.get(asNode(getNodeField(node, "Initializer")), runtimeCarrierFactKey)?.carrier,
      context.facts.get(node, runtimeCarrierFactKey)?.carrier ??
        context.facts.get(asNode(getNodeField(node, "Type")), runtimeCarrierFactKey)?.carrier,
    );
  }
  if (kind === "KindReturnStatement") {
    return appendAnyBoundaryDiagnostic(
      node,
      context,
      context.facts.get(asNode(getNodeField(node, "Expression")), runtimeCarrierFactKey)?.carrier,
      getEnclosingReturnTargetCarrier(node, context),
    );
  }
  return false;
}

function appendAnyBoundaryDiagnostic(
  node: Node,
  context: ExtensionObservationContext<"target.validatePostCheckAssignability">,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
): boolean {
  if (!isAnyBoundary(source, target)) {
    return false;
  }
  context.diagnostics.append({
    ...csharpProviderDiagnostic(
      context.extensionId,
      "CSHARP_TARGET_ASSIGNABILITY_INVALID",
      9100120,
      "C# target assignment cannot cross a TypeScript any boundary without finalized target capability facts for the runtime carrier.",
    ),
    nodeOrSpan: node,
    evidence: [
      { message: "C# target validation reason", details: "A typed boundary uses the opaque any runtime carrier without a finalized target conversion or dynamic carrier operation." },
      { message: "Source C# target type", details: source },
      { message: "Target C# target type", details: target },
    ],
    identity: `csharp-target-assignability:${subjectIdentity(node)}`,
  });
  return true;
}

function isAnyBoundary(source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): boolean {
  const sourceAny = isCsharpAnyRuntimeCarrier(source);
  const targetAny = isCsharpAnyRuntimeCarrier(target);
  return source !== undefined && target !== undefined && sourceAny !== targetAny;
}
