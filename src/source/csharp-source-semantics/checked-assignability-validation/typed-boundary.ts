import {
  targetConversionFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import {
  csharpTargetConversionOperationFactKey,
  getRecordedCsharpPropagatedRuntimeCarrierFact,
} from "../../csharp-facts.js";
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
  targetTypeRefEquals,
} from "../target-ref-utils.js";
import {
  tsValueType,
} from "../compat-runtime-operation-model.js";
import {
  getCompatAnyTypedBoundaryConversion,
  getCompatAnyTypedBoundaryEvidence,
} from "../compat-any-typed-boundary-conversions.js";
import {
  getEnclosingReturnTargetCarrier,
} from "./context-nodes.js";
import {
  asNode,
  subjectIdentity,
} from "./subjects.js";

export function diagnoseAnyTypedBoundaryForNode(
  node: Node,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  compatibilityMode: TargetTypescriptCompatibilityMode,
  observedBoundary?: {
    readonly conversionSubject?: Node;
    readonly source?: TargetTypeRef;
    readonly target?: TargetTypeRef;
  },
): boolean {
  if (observedBoundary !== undefined && isAnyBoundary(observedBoundary.source, observedBoundary.target)) {
    return handleAnyBoundary(
      node,
      observedBoundary.conversionSubject,
      context,
      observedBoundary.source,
      observedBoundary.target,
      compatibilityMode,
    );
  }
  const compiler = context.compiler;
  if (compiler === undefined) {
    return false;
  }
  const ast = compiler.ast;
  if (ast.is.IsBinaryExpression(node) && getBinaryOperatorText(ast, node) === "=") {
    const sourceNode = asNode(getNodeField(node, "Right"));
    return handleAnyBoundary(
      node,
      sourceNode,
      context,
      getRuntimeCarrier(context, sourceNode),
      getRuntimeCarrier(context, asNode(getNodeField(node, "Left"))),
      compatibilityMode,
    );
  }
  const kind = ast.kindName(node);
  if (kind === "KindVariableDeclaration" || kind === "KindPropertyDeclaration") {
    const sourceNode = asNode(getNodeField(node, "Initializer"));
    return handleAnyBoundary(
      node,
      sourceNode,
      context,
      getRuntimeCarrier(context, sourceNode),
      getRuntimeCarrier(context, node) ??
        getRuntimeCarrier(context, asNode(getNodeField(node, "Type"))),
      compatibilityMode,
    );
  }
  if (kind === "KindReturnStatement") {
    const sourceNode = asNode(getNodeField(node, "Expression"));
    return handleAnyBoundary(
      node,
      sourceNode,
      context,
      getRuntimeCarrier(context, sourceNode),
      getEnclosingReturnTargetCarrier(node, context),
      compatibilityMode,
    );
  }
  return false;
}

function handleAnyBoundary(
  diagnosticNode: Node,
  conversionSubject: Node | undefined,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
  compatibilityMode: TargetTypescriptCompatibilityMode,
): boolean {
  if (!isAnyBoundary(source, target)) {
    return false;
  }
  if (
    compatibilityMode === "compat" &&
    conversionSubject !== undefined &&
    recordCompatAnyBoundaryConversionFact(conversionSubject, context, source, target)
  ) {
    return true;
  }
  appendAnyBoundaryDiagnostic(diagnosticNode, context, source, target);
  return true;
}

function recordCompatAnyBoundaryConversionFact(
  conversionSubject: Node,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
): boolean {
  if (source === undefined || target === undefined) {
    return false;
  }
  const existing = context.facts.get(conversionSubject, targetConversionFactKey);
  if (existing?.convertedType !== undefined && existingConversionSatisfiesBoundary(existing.convertedType, target)) {
    return true;
  }
  if (existing !== undefined) {
    return false;
  }
  const existingCsharpOperation = context.facts.get(conversionSubject, csharpTargetConversionOperationFactKey) ??
    context.factResolver.resolve(conversionSubject, csharpTargetConversionOperationFactKey);
  if (
    existingCsharpOperation?.resultType !== undefined &&
    existingConversionSatisfiesBoundary(existingCsharpOperation.resultType, target)
  ) {
    return true;
  }
  if (existingCsharpOperation !== undefined) {
    return false;
  }
  const conversion = getCompatAnyTypedBoundaryConversion(source, target);
  if (conversion === undefined || conversion.kind === "identity") {
    return false;
  }
  const evidence = getCompatAnyTypedBoundaryEvidence(conversion.kind);
  context.facts.set(
    conversionSubject,
    csharpTargetConversionOperationFactKey,
    conversion.csharpOperation,
    evidence,
  );
  return true;
}

function existingConversionSatisfiesBoundary(convertedType: TargetTypeRef, target: TargetTypeRef): boolean {
  return targetTypeRefEquals(convertedType, target) ||
    (isCsharpAnyRuntimeCarrier(target) && targetTypeRefEquals(convertedType, tsValueType));
}

function appendAnyBoundaryDiagnostic(
  node: Node,
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef | undefined,
): void {
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
}

function isAnyBoundary(source: TargetTypeRef | undefined, target: TargetTypeRef | undefined): boolean {
  const sourceAny = isCsharpAnyRuntimeCarrier(source);
  const targetAny = isCsharpAnyRuntimeCarrier(target);
  return source !== undefined && target !== undefined && sourceAny !== targetAny;
}

function getRuntimeCarrier(
  context: ExtensionObservationContext<"target.observePostCheckAssignability">,
  subject: ExtensionFactSubject | undefined,
): TargetTypeRef | undefined {
  return subject === undefined
    ? undefined
    : getRecordedCsharpPropagatedRuntimeCarrierFact(context.facts, subject)?.carrier;
}
