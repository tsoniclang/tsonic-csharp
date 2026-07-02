import {
  runtimeCarrierFactKey,
  targetConversionFactKey,
} from "@tsonic/tsts";
import type {
  TargetTypescriptCompatibilityMode,
} from "@tsonic/target-api";
import type {
  ExtensionFactSubject,
  ExtensionLifecycleContext,
  ExtensionObservationContext,
  Node,
  TargetOperationFact,
  TargetBindingFact,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  csharpTargetConversionOperationFactKey,
} from "../csharp-facts.js";
import type {
  CsharpTargetOperationFact,
} from "../csharp-facts.js";
import {
  asNodeSubject,
  getNodeField,
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  csharpTargetCastOperation,
  targetOperation,
} from "./operations.js";
import {
  createRuntimeCarrierLifecycleObservationContext,
} from "./runtime-carriers.js";
import {
  csharpProviderDiagnostic,
} from "./diagnostics.js";
import {
  getCompatAnyTypedBoundaryConversion,
  getCompatAnyTypedBoundaryEvidence,
} from "./compat-any-typed-boundary-conversions.js";
import {
  requiresCsharpProviderConversionEvidence,
} from "./provider-conversion-operators.js";
import {
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  getCsharpConversionOperation,
} from "./target-rules.js";
import {
  isCsharpAnyRuntimeCarrier,
} from "./target-types.js";
import {
  targetTypeRefEquals,
  targetTypeRefKey,
} from "./target-ref-utils.js";

export interface CsharpAssertionConversionLifecycleHost {
  readonly getCsharpTargetBindingByTargetId: (targetId: string) => TargetBindingFact | undefined;
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
}

export function recordCsharpAssertionConversionFactsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
  host: CsharpAssertionConversionLifecycleHost,
  compatibilityMode: TargetTypescriptCompatibilityMode,
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
      const assertion = getAssertionParts(node, compiler.ast);
      if (assertion === undefined) {
        return;
      }
      const target = host.getTargetTypeRefForSubject(assertion.target, context);
      if (target === undefined) {
        return;
      }
      const source = host.getTargetTypeRefForSubject(assertion.expression, context);
      if (lifecycleContext.host.facts.get(node, targetConversionFactKey) !== undefined) {
        return;
      }
      const sourceHasOpaqueAnyCarrier = hasOpaqueAnyCarrier(assertion.expression, lifecycleContext);
      if (
        isCsharpAnyRuntimeCarrier(source) ||
        isCsharpAnyRuntimeCarrier(target) ||
        sourceHasOpaqueAnyCarrier ||
        hasOpaqueAnyCarrier(assertion.target, lifecycleContext)
      ) {
        const compatConversion = compatibilityMode === "compat"
          ? getCompatAnyTypedBoundaryConversion(source, target, sourceHasOpaqueAnyCarrier)
          : undefined;
        if (compatConversion?.kind === "identity") {
          return;
        }
        if (compatConversion !== undefined) {
          recordAssertionConversionFacts(
            node,
            source,
            compatConversion.convertedType,
            compatConversion.operation,
            compatConversion.csharpOperation,
            lifecycleContext,
            getCompatAnyTypedBoundaryEvidence(compatConversion.kind),
          );
          return;
        }
        lifecycleContext.host.diagnostics.append({
          ...csharpProviderDiagnostic(
            lifecycleContext.extensionId,
            "CSHARP_ANY_ASSERTION_CONVERSION_UNSUPPORTED",
            9100122,
            "C# assertion conversion cannot cross a TypeScript any boundary without finalized target conversion facts.",
          ),
          nodeOrSpan: node,
          evidence: [
            {
              message: "C# dynamic assertion boundary rejected",
              details: "TypeScript accepted the assertion through any, but the C# target has no finalized unbox/cast capability fact for this expression.",
            },
            {
              message: "Required architecture",
              details: "A JS/dynamic compatibility surface must provide an explicit target conversion fact; source assertion syntax must not invent C# casts from any.",
            },
          ],
          identity: `csharp-any-assertion:${subjectIdentity(node)}`,
        });
        return;
      }
      const conversion = getAssertionConversionOperation(assertion.expression, source, target, context, host);
      if (conversion?.kind === "diagnostic") {
        lifecycleContext.host.diagnostics.append({
          ...csharpProviderDiagnostic(
            lifecycleContext.extensionId,
            conversion.code,
            conversion.numericCode,
            conversion.message,
          ),
          nodeOrSpan: node,
          evidence: conversion.evidence,
          identity: `${conversion.code}:${subjectIdentity(node)}`,
        });
        return;
      }
      recordAssertionConversionFacts(
        node,
        source,
        target,
        conversion?.kind === "conversion" ? conversion.operation : undefined,
        conversion?.kind === "conversion" ? conversion.csharpOperation : undefined,
        lifecycleContext,
        [{ message: "C# assertion conversion finalized from source assertion target type facts." }],
      );
    });
  }
}

function recordAssertionConversionFacts(
  node: Node,
  source: TargetTypeRef | undefined,
  convertedType: TargetTypeRef,
  operation: TargetOperationFact | undefined,
  csharpOperation: CsharpTargetOperationFact | undefined,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host">,
  evidence: readonly { readonly message: string; readonly details?: unknown }[],
): void {
  lifecycleContext.host.facts.set(
    node,
    targetConversionFactKey,
    {
      ...(source !== undefined ? { sourceType: source } : {}),
      convertedType,
      ...(operation !== undefined ? { operation } : {}),
    },
    evidence,
  );
  if (csharpOperation !== undefined) {
    lifecycleContext.host.facts.set(
      node,
      csharpTargetConversionOperationFactKey,
      csharpOperation,
      evidence,
    );
  }
}

function getAssertionParts(
  node: Node,
  ast: NonNullable<ExtensionObservationContext["compiler"]>["ast"],
): { readonly expression: Node; readonly target: Node } | undefined {
  const kind = ast.kindName(node);
  if (kind !== "KindAsExpression" && kind !== "KindTypeAssertionExpression") {
    return undefined;
  }
  const expression = asNodeSubject(getNodeField(node, "Expression"));
  const target = asNodeSubject(getNodeField(node, "Type"));
  return expression === undefined || target === undefined
    ? undefined
    : { expression, target };
}

function getAssertionConversionOperation(
  expression: Node,
  source: TargetTypeRef | undefined,
  target: TargetTypeRef,
  context: ExtensionObservationContext,
  host: CsharpAssertionConversionLifecycleHost,
): CsharpAssertionConversionDecision | undefined {
  if (source !== undefined && targetTypeRefEquals(source, target)) {
    return undefined;
  }
  if (isLiteralRepresentableAsTargetType(target, expression, context)) {
    return undefined;
  }
  const conversion = getCsharpConversionOperation(source, target);
  if (conversion !== undefined) {
    return {
      kind: "conversion",
      operation: conversion.operation,
      csharpOperation: conversion.csharpOperation,
    };
  }
  if (requiresCsharpProviderConversionEvidence(source, target, host)) {
    return {
      kind: "diagnostic",
      code: "CSHARP_PROVIDER_ASSERTION_CONVERSION_UNSUPPORTED",
      numericCode: 9100124,
      message: "C# provider assertion conversion requires a finalized provider conversion operator fact.",
      evidence: [{
        message: "Missing provider conversion operator",
        details: "The target type is provider-owned, so assertion emission requires an exact TSTS-selected provider conversion operator identity. Type assertions do not currently expose selected provider conversion operator identity to the C# provider.",
      }],
    };
  }
  if (source === undefined) {
    return undefined;
  }
  if (!isSourceDeclaredAssertionTarget(source, target)) {
    return undefined;
  }
  const operationId = `tsonic.csharp.cast:${targetTypeRefKey(target)}`;
  return {
    kind: "conversion",
    operation: targetOperation(operationId, "operator", "cast", { resultType: target }),
    csharpOperation: csharpTargetCastOperation(operationId, target),
  };
}

type CsharpAssertionConversionDecision =
  | {
      readonly kind: "conversion";
      readonly operation: TargetOperationFact;
      readonly csharpOperation: CsharpTargetOperationFact;
    }
  | {
      readonly kind: "diagnostic";
      readonly code: string;
      readonly numericCode: number;
      readonly message: string;
      readonly evidence: readonly { readonly message: string; readonly details?: string }[];
    };

function isSourceDeclaredAssertionTarget(source: TargetTypeRef, target: TargetTypeRef): boolean {
  return isSourceDeclaredTargetType(source) || isSourceDeclaredTargetType(target);
}

function isSourceDeclaredTargetType(type: TargetTypeRef): boolean {
  return type.kind === "target-named" &&
    "csharpSourceDeclarationKind" in type &&
    type.csharpSourceDeclarationKind !== undefined;
}

function hasOpaqueAnyCarrier(
  subject: Node,
  lifecycleContext: Pick<ExtensionLifecycleContext, "host">,
): boolean {
  return isCsharpAnyRuntimeCarrier(lifecycleContext.host.facts.get(subject, runtimeCarrierFactKey)?.carrier);
}

function subjectIdentity(subject: unknown): string {
  if (subject !== null && typeof subject === "object" && "id" in subject) {
    return String((subject as { readonly id?: unknown }).id ?? "unknown");
  }
  return "unknown";
}
