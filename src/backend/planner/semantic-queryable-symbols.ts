import type { Node, SourceFile, Symbol } from "@tsonic/tsts";
import type { TargetCompileInput } from "@tsonic/target-api";
import {
  KindElementAccessExpression,
  KindIdentifier,
  KindPropertyAccessExpression,
  SourceKind,
} from "./source-ast.js";

export function getQueryableSymbol(node: Node, sourceFile: SourceFile, input: TargetCompileInput): Symbol | undefined {
  switch (SourceKind(input.ast, node)) {
    case KindIdentifier:
    case KindPropertyAccessExpression:
    case KindElementAccessExpression:
      return input.semantics.getSymbolAtLocation(node, { sourceFile }) ?? input.semantics.getResolvedSymbol(node, { sourceFile });
    default:
      return undefined;
  }
}
