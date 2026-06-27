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
      return input.analysis.getSymbolAtLocation(node, { sourceFile }) ?? input.analysis.getResolvedSymbol(node, { sourceFile });
    default:
      return undefined;
  }
}
