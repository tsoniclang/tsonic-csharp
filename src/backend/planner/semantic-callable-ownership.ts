import {
  HasSourceKind,
  KindPropertyAccessExpression,
  Node_Expression,
} from "./source-ast.js";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import type { ExtensionFactSubject, Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import type {
  SemanticOwnership,
} from "./semantic-guard-types.js";
import {
  appendSemanticNodeFactReasons,
  appendTargetFactReasons,
} from "./semantic-fact-reasons.js";
import {
  getQueryableSymbol,
} from "./semantic-queryable-symbols.js";
import {
  isSourceDeclaredCallableReference,
  isSourceOwnedCallableRuntimeCarrierSubject,
  isSourceOwnedProjectReference,
  isSourceOwnedProjectShapeSubject,
} from "./semantic-source-ownership.js";

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
  const sourceOwned = !requiresSelectedTargetFact &&
    (isSourceDeclaredCallableReference(sourceReference, input) ||
      isSourceOwnedCallableRuntimeCarrierSubject(callee, sourceFile, input) ||
      (isSourceOwnedProjectReference(sourceReference, input) &&
        isSourceOwnedProjectShapeSubject(callee, sourceFile, input)));
  if (!sourceOwned) {
    appendSourceReferenceFactReasons(reasons, input, sourceReference);
    appendSemanticNodeFactReasons(reasons, input, callee, sourceFile, "callee semantic node");
    appendTargetFactReasons(reasons, input, input.semantics.getResolvedSymbol(callee, { sourceFile }), "callee resolved symbol");
  }
  return {
    requiresTargetFact: !sourceOwned && reasons.length > 0,
    sourceOwned,
    reasons,
  };
}

function appendSourceReferenceFactReasons(
  reasons: string[],
  input: TargetCompileInput,
  reference: ReturnType<TargetCompileInput["semantics"]["getProjectSourceReferenceForNode"]>,
): void {
  if (reference === undefined) {
    return;
  }
  appendTargetFactReasons(reasons, input, reference.sourceFile, "callee source file");
  appendTargetFactReasons(reasons, input, reference.declaration, "callee source declaration");
  appendTargetFactReasons(reasons, input, reference.symbol, "callee source symbol");
  if (reference.sourceFile.IsDeclarationFile) {
    reasons.push("callee source declaration file");
  }
  if (!input.sourceFiles.some((sourceFile) => sourceFile === reference.sourceFile)) {
    reasons.push("callee external source file");
  }
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
