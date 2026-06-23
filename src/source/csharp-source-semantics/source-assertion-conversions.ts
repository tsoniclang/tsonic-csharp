import {
  runtimeCarrierFactKey,
  targetConversionFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
  ExtensionLifecycleContext,
  ExtensionObservationContext,
  Node,
  TargetOperationFact,
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
  readonly getTargetTypeRefForSubject: (
    subject: ExtensionFactSubject | undefined,
    context: ExtensionObservationContext,
    options?: TargetTypeRefResolutionOptions,
  ) => TargetTypeRef | undefined;
}

export function recordCsharpAssertionConversionFactsBeforeFinalization(
  lifecycleContext: Pick<ExtensionLifecycleContext, "extensionId" | "host" | "compiler">,
  host: CsharpAssertionConversionLifecycleHost,
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
      if (
        isCsharpAnyRuntimeCarrier(source) ||
        isCsharpAnyRuntimeCarrier(target) ||
        hasOpaqueAnyCarrier(assertion.expression, lifecycleContext) ||
        hasOpaqueAnyCarrier(assertion.target, lifecycleContext)
      ) {
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
      if (lifecycleContext.host.facts.get(node, targetConversionFactKey) !== undefined) {
        return;
      }
      const conversion = getAssertionConversionOperation(assertion.expression, source, target, context);
      lifecycleContext.host.facts.set(
        node,
        targetConversionFactKey,
        {
          convertedType: target,
          ...(conversion !== undefined ? { operation: conversion.operation } : {}),
        },
        [{ message: "C# assertion conversion finalized from source assertion target type facts." }],
      );
      if (conversion !== undefined) {
        lifecycleContext.host.facts.set(
          node,
          csharpTargetConversionOperationFactKey,
          conversion.csharpOperation,
          [{ message: "C# assertion conversion operation finalized from source assertion target type facts." }],
        );
      }
    });
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
): { readonly operation: TargetOperationFact; readonly csharpOperation: CsharpTargetOperationFact } | undefined {
  if (source !== undefined && targetTypeRefEquals(source, target)) {
    return undefined;
  }
  if (isLiteralRepresentableAsTargetType(target, expression, context)) {
    return undefined;
  }
  const conversion = getCsharpConversionOperation(source, target);
  if (conversion !== undefined) {
    return conversion;
  }
  if (source === undefined) {
    return undefined;
  }
  const operationId = `tsonic.csharp.cast:${targetTypeRefKey(target)}`;
  return {
    operation: targetOperation(operationId, "operator", "cast", { resultType: target }),
    csharpOperation: csharpTargetCastOperation(operationId, target),
  };
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
