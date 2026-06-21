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
import { getTargetTypeRefForNode } from "./runtime-carriers.js";
import type {
  OperationSemanticOwnership,
} from "./semantic-guard-types.js";
import {
  appendProviderOperationFactReasons,
  appendSemanticNodeFactReasons,
} from "./semantic-fact-reasons.js";
import {
  getQueryableSymbol,
} from "./semantic-queryable-symbols.js";
import {
  isTypeParameterTargetRef,
} from "./semantic-source-ownership.js";

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
  appendSemanticNodeFactReasons(reasons, input, node, sourceFile, "operand semantic node");
  const sourceOwned = false;
  return {
    requiresTargetFact: reasons.length > 0,
    sourceOwned,
    reasons,
  };
}
