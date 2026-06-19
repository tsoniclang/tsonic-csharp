import {
  KindConstructor,
  KindFunctionDeclaration,
  KindFunctionExpression,
  KindElementAccessExpression,
  KindArrayBindingPattern,
  KindBindingElement,
  KindObjectBindingPattern,
  KindParameter,
  KindTypeLiteral,
  KindMethodDeclaration,
  KindPropertyAccessExpression,
  KindIdentifier,
  KindVariableDeclaration,
  providerVirtualDeclarationFactKey,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "@tsonic/tsts";
import type { ExtensionFactSubject, Node, SourceFile, Symbol } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";

export interface SemanticOwnership {
  readonly requiresTargetFact: boolean;
  readonly sourceOwned: boolean;
  readonly reasons: readonly string[];
}

export interface OperationSemanticOwnership extends SemanticOwnership {}

export function getSemanticOwnership(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): SemanticOwnership {
  if (node === undefined) {
    return { requiresTargetFact: true, sourceOwned: false, reasons: ["missing AST subject"] };
  }
  if (node.Kind === KindTypeLiteral) {
    return { requiresTargetFact: true, sourceOwned: false, reasons: ["structural type literal"] };
  }
  if (
    node.Kind === KindObjectBindingPattern ||
    node.Kind === KindArrayBindingPattern ||
    node.Kind === KindBindingElement ||
    node.Kind === KindParameter
  ) {
    return { requiresTargetFact: true, sourceOwned: false, reasons: ["non-queryable binding syntax"] };
  }
  const reasons: string[] = [];
  appendTargetFactReasons(reasons, input, node, "node");
  const symbol = getQueryableSymbol(node, sourceFile, input);
  appendTargetFactReasons(reasons, input, symbol, "symbol");
  const sourceOwned = isSourceOwnedProjectShapeSubject(node, sourceFile, input);
  if (!sourceOwned) {
    appendSemanticNodeFactReasons(reasons, input, node, sourceFile, "semantic node");
    appendTargetFactReasons(reasons, input, input.semantics.getResolvedSymbol(node, { sourceFile }), "resolved symbol");
  }
  return {
    requiresTargetFact: !sourceOwned && reasons.length > 0,
    sourceOwned,
    reasons,
  };
}

export function getCallableSemanticOwnership(
  callee: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): SemanticOwnership {
  if (callee === undefined) {
    return { requiresTargetFact: true, sourceOwned: false, reasons: ["missing callable AST subject"] };
  }
  const reasons: string[] = [];
  appendTargetFactReasons(reasons, input, callee, "callee node");
  const symbol = getQueryableSymbol(callee, sourceFile, input);
  appendTargetFactReasons(reasons, input, symbol, "callee symbol");
  const sourceReference = input.semantics.getProjectSourceReferenceForNode(callee, { sourceFile });
  const sourceOwned = isSourceDeclaredCallableReference(sourceReference) ||
    isSourceOwnedProjectShapeSubject(callee, sourceFile, input);
  if (!sourceOwned) {
    appendSemanticNodeFactReasons(reasons, input, callee, sourceFile, "callee semantic node");
    appendTargetFactReasons(reasons, input, input.semantics.getResolvedSymbol(callee, { sourceFile }), "callee resolved symbol");
  }
  return {
    requiresTargetFact: !sourceOwned && reasons.length > 0,
    sourceOwned,
    reasons,
  };
}

export function getProviderOperationOwnership(
  node: Node | undefined,
  sourceFile: SourceFile,
  input: TargetCompileInput,
): OperationSemanticOwnership {
  if (node === undefined) {
    return {
      requiresTargetFact: true,
      sourceOwned: false,
      reasons: ["missing operation operand"],
    };
  }
  if (node.Kind === KindTypeLiteral) {
    return {
      requiresTargetFact: true,
      sourceOwned: false,
      reasons: ["structural type literal"],
    };
  }
  if (
    node.Kind === KindObjectBindingPattern ||
    node.Kind === KindArrayBindingPattern ||
    node.Kind === KindBindingElement ||
    node.Kind === KindParameter
  ) {
    return {
      requiresTargetFact: true,
      sourceOwned: false,
      reasons: ["non-queryable binding syntax"],
    };
  }
  const reasons: string[] = [];
  appendProviderOperationFactReasons(reasons, input, node, "operand node");
  const symbol = getQueryableSymbol(node, sourceFile, input);
  appendProviderOperationFactReasons(reasons, input, symbol, "operand symbol");
  const carrier = input.semantics.getRuntimeCarrierForNode(node, { sourceFile });
  const typeParameter = isTypeParameterTargetRef(carrier);
  if (typeParameter) {
    reasons.push("operand type parameter");
  }
  const sourceOwned = !typeParameter && (carrier?.kind === "source-primitive" || isSourceOwnedProjectShapeSubject(node, sourceFile, input));
  if (!sourceOwned) {
    appendSemanticNodeFactReasons(reasons, input, node, sourceFile, "operand semantic node");
  }
  return {
    requiresTargetFact: !sourceOwned && reasons.length > 0,
    sourceOwned,
    reasons,
  };
}

export function pushMissingTargetFactDiagnostic(
  diagnostics: TargetDiagnostic[],
  node: Node,
  message: string,
  ownership: SemanticOwnership,
): void {
  const reasons = ownership.reasons.length === 0
    ? "no provider/source facts and no source-owned declaration"
    : ownership.reasons.join(", ");
  diagnostics.push(unsupportedNodeDiagnostic(node, `${message} Missing finalized target fact evidence: ${reasons}.`));
}

function appendTargetFactReasons(
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
  if (input.facts.getValueTypeFact(subject) !== undefined) {
    reasons.push(`${label} value type`);
  }
  if (input.facts.getFieldFact(subject) !== undefined) {
    reasons.push(`${label} field`);
  }
  if (input.facts.getSourceMarkerFact(subject) !== undefined) {
    reasons.push(`${label} source marker`);
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

function appendProviderOperationFactReasons(
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
  if (input.facts.getValueTypeFact(subject) !== undefined) {
    reasons.push(`${label} value type`);
  }
  if (input.facts.getFieldFact(subject) !== undefined) {
    reasons.push(`${label} field`);
  }
  if (input.facts.getSourceMarkerFact(subject) !== undefined) {
    reasons.push(`${label} source marker`);
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

function appendSemanticNodeFactReasons(
  reasons: string[],
  input: TargetCompileInput,
  node: Node,
  sourceFile: SourceFile,
  label: string,
): void {
  if (input.semantics.getRuntimeCarrierForNode(node, { sourceFile }) !== undefined) {
    const carrier = input.semantics.getRuntimeCarrierForNode(node, { sourceFile });
    reasons.push(carrier?.kind === "source-primitive" ? `${label} source primitive` : `${label} runtime carrier`);
  }
  if (input.semantics.getObjectShapeForNode(node, { sourceFile }) !== undefined) {
    reasons.push(`${label} object shape`);
  }
  if (input.semantics.getTargetBindingForReference(node, { sourceFile }) !== undefined) {
    reasons.push(`${label} target binding`);
  }
}

function isTypeParameterTargetRef(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "type-parameter";
}

export function isSourceOwnedProjectShapeSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  if (isTypeParameterTargetRef(input.semantics.getRuntimeCarrierForNode(node, { sourceFile }))) {
    return true;
  }
  return input.semantics.isProjectSourceShapeForNode(node, { sourceFile });
}

export function isSourceOwnedProjectConstructibleObjectSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  if (isTypeParameterTargetRef(input.semantics.getRuntimeCarrierForNode(node, { sourceFile }))) {
    return false;
  }
  return input.semantics.isProjectSourceConstructibleObjectForNode(node, { sourceFile });
}

function isSourceDeclaredCallableReference(
  reference: ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]>,
): boolean {
  return reference !== undefined &&
    !hasProviderOnlySymbolName(reference.symbol) &&
    isSourceCallableDeclaration(reference.declaration);
}

function isSourceCallableDeclaration(declaration: Node | undefined): boolean {
  switch (declaration?.Kind) {
    case KindVariableDeclaration:
    case KindParameter:
    case KindFunctionDeclaration:
    case KindFunctionExpression:
    case KindMethodDeclaration:
    case KindConstructor:
      return true;
    default:
      return false;
  }
}

function getQueryableSymbol(node: Node, sourceFile: SourceFile, input: TargetCompileInput): Symbol | undefined {
  switch (node.Kind) {
    case KindIdentifier:
    case KindPropertyAccessExpression:
    case KindElementAccessExpression:
      return input.semantics.getSymbolAtLocation(node, { sourceFile }) ?? input.semantics.getResolvedSymbol(node, { sourceFile });
    default:
      return undefined;
  }
}

function hasProviderOnlySymbolName(symbol: Symbol | undefined): boolean {
  return symbol?.Name === undefined || symbol.Name.length === 0;
}
