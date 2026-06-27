import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { ExtensionFactSubject, Node, SourceFile, TargetTypeRef } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  IsTypeSyntaxNode,
} from "./source-ast.js";
import {
  getCsharpObjectShapeFactForNode,
} from "./csharp-fact-queries.js";
import {
  getTargetTypeRefForType,
} from "./runtime-carriers.js";

export function appendTargetFactReasons(
  reasons: string[],
  input: TargetCompileInput,
  subject: ExtensionFactSubject | undefined,
  label: string,
): void {
  if (subject === undefined) {
    return;
  }
  if (input.facts.getTargetBindingFact(subject) !== undefined) {
    reasons.push(`${label} target binding`);
  }
  if (input.facts.getFact(subject, providerVirtualDeclarationFactKey) !== undefined) {
    reasons.push(`${label} provider virtual declaration`);
  }
  if (input.facts.getRuntimeCarrierFact(subject) !== undefined) {
    reasons.push(`${label} runtime carrier`);
  }
  if (input.facts.getSourcePrimitiveFact(subject) !== undefined) {
    reasons.push(`${label} source primitive`);
  }
  if (input.facts.getTargetConversionFact(subject) !== undefined) {
    reasons.push(`${label} target conversion`);
  }
  if (input.facts.getContextualTargetTypeFact(subject)?.targetType !== undefined) {
    reasons.push(`${label} contextual target type`);
  }
  if (input.facts.getArgumentPassingFact(subject) !== undefined) {
    reasons.push(`${label} argument passing`);
  }
  if (input.facts.getStructFact(subject) !== undefined) {
    reasons.push(`${label} struct`);
  }
  if (input.facts.getFieldFact(subject) !== undefined) {
    reasons.push(`${label} field`);
  }
  if (input.facts.getAttributeFact(subject) !== undefined) {
    reasons.push(`${label} attribute`);
  }
  if (input.facts.getDefaultValueFact(subject) !== undefined) {
    reasons.push(`${label} default value`);
  }
  if (input.facts.getPointerFact(subject) !== undefined) {
    reasons.push(`${label} pointer`);
  }
  if (input.facts.getFunctionPointerFact(subject) !== undefined) {
    reasons.push(`${label} function pointer`);
  }
}

export function appendProviderOperationFactReasons(
  reasons: string[],
  input: TargetCompileInput,
  subject: ExtensionFactSubject | undefined,
  label: string,
): void {
  if (subject === undefined) {
    return;
  }
  if (input.facts.getTargetBindingFact(subject) !== undefined) {
    reasons.push(`${label} target binding`);
  }
  if (input.facts.getFact(subject, providerVirtualDeclarationFactKey) !== undefined) {
    reasons.push(`${label} provider virtual declaration`);
  }
  if (input.facts.getRuntimeCarrierFact(subject) !== undefined) {
    reasons.push(`${label} runtime carrier`);
  }
  if (input.facts.getTargetConversionFact(subject) !== undefined) {
    reasons.push(`${label} target conversion`);
  }
  if (input.facts.getContextualTargetTypeFact(subject)?.targetType !== undefined) {
    reasons.push(`${label} contextual target type`);
  }
  if (input.facts.getArgumentPassingFact(subject) !== undefined) {
    reasons.push(`${label} argument passing`);
  }
  if (input.facts.getStructFact(subject) !== undefined) {
    reasons.push(`${label} struct`);
  }
  if (input.facts.getFieldFact(subject) !== undefined) {
    reasons.push(`${label} field`);
  }
  if (input.facts.getAttributeFact(subject) !== undefined) {
    reasons.push(`${label} attribute`);
  }
  if (input.facts.getDefaultValueFact(subject) !== undefined) {
    reasons.push(`${label} default value`);
  }
  if (input.facts.getPointerFact(subject) !== undefined) {
    reasons.push(`${label} pointer`);
  }
  if (input.facts.getFunctionPointerFact(subject) !== undefined) {
    reasons.push(`${label} function pointer`);
  }
}

export function appendSemanticNodeFactReasons(
  reasons: string[],
  input: TargetCompileInput,
  node: Node,
  sourceFile: SourceFile,
  label: string,
): void {
  const targetBinding = input.targetFacts.getTargetBindingForReference(node, { sourceFile });
  if (targetBinding !== undefined) {
    reasons.push(`${label} target binding`);
  } else {
    const carrier = getTargetTypeRefForSemanticType(input, node, sourceFile);
    if (carrier !== undefined) {
      reasons.push(carrier.kind === "source-primitive" ? `${label} source primitive` : `${label} runtime carrier`);
    }
  }
  if (getCsharpObjectShapeFactForNode(node, sourceFile, input) !== undefined) {
    reasons.push(`${label} object shape`);
  }
}

function getTargetTypeRefForSemanticType(
  input: TargetCompileInput,
  node: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  const type = IsTypeSyntaxNode(input.ast, node)
    ? input.analysis.getTypeFromTypeNode(node, { sourceFile })
    : input.analysis.getTypeAtLocation(node, { sourceFile });
  return getTargetTypeRefForType(input, type, sourceFile);
}
