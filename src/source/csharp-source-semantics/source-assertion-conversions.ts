import {
  targetConversionFactKey,
} from "@tsonic/tsts";
import type {
  ExtensionFactSubject,
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
  isLiteralRepresentableAsTargetType,
} from "./target-member-selection.js";
import type {
  TargetTypeRefResolutionOptions,
} from "./target-member-selection.js";
import {
  getCsharpConversionOperation,
} from "./target-rules.js";
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
  lifecycleContext: { readonly host: ExtensionObservationContext["host"]; readonly compiler?: ExtensionObservationContext["compiler"] },
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
      if (assertion === undefined || lifecycleContext.host.facts.get(node, targetConversionFactKey) !== undefined) {
        return;
      }
      const target = host.getTargetTypeRefForSubject(assertion.target, context);
      if (target === undefined) {
        return;
      }
      const source = host.getTargetTypeRefForSubject(assertion.expression, context);
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
