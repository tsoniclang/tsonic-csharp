import {
  HasSourceKind,
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
  IsTypeSyntaxNode,
  Node_Expression,
  SourceKind,
} from "./source-ast.js";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { TargetTypeRef } from "@tsonic/tsts";
import type { ExtensionFactSubject, Node, SourceFile, Symbol } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { getCsharpObjectShapeFactForNode } from "./csharp-fact-queries.js";
import { getTargetTypeRefForNode, getTargetTypeRefForType } from "./runtime-carriers.js";

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
  if (HasSourceKind(input.ast, node, KindTypeLiteral)) {
    return { requiresTargetFact: true, sourceOwned: false, reasons: ["structural type literal"] };
  }
  if (
    HasSourceKind(input.ast, node, KindObjectBindingPattern) ||
    HasSourceKind(input.ast, node, KindArrayBindingPattern) ||
    HasSourceKind(input.ast, node, KindBindingElement) ||
    HasSourceKind(input.ast, node, KindParameter)
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
  appendPropertyAccessReceiverFactReasons(reasons, input, callee, sourceFile);
  const requiresSelectedTargetFact = hasSelectedTargetFactEvidence(input, callee) ||
    hasSelectedTargetFactEvidence(input, symbol) ||
    propertyAccessReceiverRequiresSelectedTargetFact(input, callee, sourceFile);
  const sourceReference = input.semantics.getProjectSourceReferenceForNode(callee, { sourceFile });
  const carrier = getTargetTypeRefForNode(input, callee, sourceFile);
  const sourceOwned = !requiresSelectedTargetFact &&
    (isSourceDeclaredCallableReference(sourceReference, input) ||
      isSourceOwnedDelegateCarrier(carrier) ||
      isSourceOwnedProjectShapeSubject(callee, sourceFile, input));
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

function appendPropertyAccessReceiverFactReasons(
  reasons: string[],
  input: TargetCompileInput,
  callee: Node,
  sourceFile: SourceFile,
): void {
  if (!HasSourceKind(input.ast, callee, KindPropertyAccessExpression)) {
    return;
  }
  const receiver = Node_Expression(callee);
  if (receiver === undefined) {
    return;
  }
  appendTargetFactReasons(reasons, input, receiver, "callee receiver node");
  appendTargetFactReasons(reasons, input, getQueryableSymbol(receiver, sourceFile, input), "callee receiver symbol");
  appendSemanticNodeFactReasons(reasons, input, receiver, sourceFile, "callee receiver semantic node");
}

function propertyAccessReceiverRequiresSelectedTargetFact(
  input: TargetCompileInput,
  callee: Node,
  sourceFile: SourceFile,
): boolean {
  if (!HasSourceKind(input.ast, callee, KindPropertyAccessExpression)) {
    return false;
  }
  const receiver = Node_Expression(callee);
  return receiver !== undefined &&
    (hasSelectedTargetFactEvidence(input, receiver) ||
      hasSelectedTargetFactEvidence(input, getQueryableSymbol(receiver, sourceFile, input)) ||
      input.semantics.getTargetBindingForReference(receiver, { sourceFile }) !== undefined);
}

function hasSelectedTargetFactEvidence(
  input: TargetCompileInput,
  subject: ExtensionFactSubject | undefined,
): boolean {
  return subject !== undefined &&
    (input.facts.getTargetBindingFact(subject) !== undefined ||
      input.facts.getFact(subject, providerVirtualDeclarationFactKey) !== undefined ||
      input.facts.getTargetConversionFact(subject) !== undefined);
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
  if (HasSourceKind(input.ast, node, KindTypeLiteral)) {
    return {
      requiresTargetFact: true,
      sourceOwned: false,
      reasons: ["structural type literal"],
    };
  }
  if (
    HasSourceKind(input.ast, node, KindObjectBindingPattern) ||
    HasSourceKind(input.ast, node, KindArrayBindingPattern) ||
    HasSourceKind(input.ast, node, KindBindingElement) ||
    HasSourceKind(input.ast, node, KindParameter)
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
  const carrier = getTargetTypeRefForNode(input, node, sourceFile);
  const typeParameter = isTypeParameterTargetRef(carrier);
  if (typeParameter) {
    reasons.push("operand type parameter");
  }
  const sourceOwned = !typeParameter && (
    carrier?.kind === "source-primitive" ||
    isSourceOwnedBuiltinOperationSubject(node, sourceFile, input) ||
    isSourceOwnedProjectShapeSubject(node, sourceFile, input)
  );
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

function appendSemanticNodeFactReasons(
  reasons: string[],
  input: TargetCompileInput,
  node: Node,
  sourceFile: SourceFile,
  label: string,
): void {
  const targetBinding = input.semantics.getTargetBindingForReference(node, { sourceFile });
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
    ? input.semantics.getTypeFromTypeNode(node, { sourceFile })
    : input.semantics.getTypeAtLocation(node, { sourceFile });
  return getTargetTypeRefForType(input, type, sourceFile);
}

function isTypeParameterTargetRef(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "type-parameter";
}

function isSourceOwnedDelegateCarrier(type: TargetTypeRef | undefined): boolean {
  return type?.kind === "target-named" &&
    (type.id.startsWith("System.Func`") || type.id.startsWith("System.Action`"));
}

export function isSourceOwnedProjectShapeSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  if (isTypeParameterTargetRef(getTargetTypeRefForNode(input, node, sourceFile))) {
    return true;
  }
  return input.semantics.isProjectSourceShapeForNode(node, { sourceFile });
}

function isSourceOwnedBuiltinOperationSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  const type = input.semantics.getTypeAtLocation(node, { sourceFile });
  return type !== undefined &&
    !input.types.isAny(type) &&
    !input.types.isUnknown(type) &&
    (
      input.types.isNumberLike(type) ||
      input.types.isStringLike(type) ||
      input.types.isBooleanLike(type) ||
      input.types.isBigIntLike(type)
    );
}

export function isSourceOwnedProjectConstructibleObjectSubject(node: Node | undefined, sourceFile: SourceFile, input: TargetCompileInput): boolean {
  if (node === undefined) {
    return false;
  }
  if (isTypeParameterTargetRef(getTargetTypeRefForNode(input, node, sourceFile))) {
    return false;
  }
  return input.semantics.isProjectSourceConstructibleObjectForNode(node, { sourceFile });
}

function isSourceDeclaredCallableReference(
  reference: ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]>,
  input: TargetCompileInput,
): boolean {
  return reference !== undefined &&
    !hasProviderOnlySymbolName(reference.symbol) &&
    isSourceCallableDeclaration(reference.declaration, input);
}

function isSourceCallableDeclaration(declaration: Node | undefined, input: TargetCompileInput): boolean {
  switch (SourceKind(input.ast, declaration)) {
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
  switch (SourceKind(input.ast, node)) {
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
