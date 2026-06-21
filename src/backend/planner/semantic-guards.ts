import {
  HasSourceKind,
  KindArrayBindingPattern,
  KindBindingElement,
  KindObjectBindingPattern,
  KindParameter,
  KindTypeLiteral,
  KindPropertyAccessExpression,
  Node_Expression,
} from "./source-ast.js";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { ExtensionFactSubject, Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { getTargetTypeRefForNode } from "./runtime-carriers.js";
import type {
  OperationSemanticOwnership,
  SemanticOwnership,
} from "./semantic-guard-types.js";
import {
  appendProviderOperationFactReasons,
  appendSemanticNodeFactReasons,
  appendTargetFactReasons,
} from "./semantic-fact-reasons.js";
import {
  getQueryableSymbol,
} from "./semantic-queryable-symbols.js";
import {
  isSourceDeclaredCallableReference,
  isSourceOwnedDelegateCarrier,
  isSourceOwnedProjectShapeSubject,
  isTypeParameterTargetRef,
} from "./semantic-source-ownership.js";

export type {
  OperationSemanticOwnership,
  SemanticOwnership,
} from "./semantic-guard-types.js";

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

export {
  isSourceOwnedProjectConstructibleObjectSubject,
  isSourceOwnedProjectShapeSubject,
} from "./semantic-source-ownership.js";
