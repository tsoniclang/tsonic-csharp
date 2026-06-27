import {
  HasSourceKind,
  KindArrayBindingPattern,
  KindBindingElement,
  KindObjectBindingPattern,
  KindParameter,
  KindTypeLiteral,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
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
  isSourceOwnedProjectShapeSubject,
} from "./semantic-source-ownership.js";

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
    appendTargetFactReasons(reasons, input, input.analysis.getResolvedSymbol(node, { sourceFile }), "resolved symbol");
  }
  return {
    requiresTargetFact: !sourceOwned && reasons.length > 0,
    sourceOwned,
    reasons,
  };
}
