import type {
  Node,
  SourceFile,
  Symbol,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeField,
} from "./ast-utils.js";
import {
  parseFiniteNumberLiteral,
} from "../source-literal-values.js";

export interface TstsTupleElementIndexHost {
  readonly kindName?: (node: Node) => string;
  readonly text?: (node: Node) => string;
  readonly getConstantValue: (node: Node, options?: { readonly sourceFile?: SourceFile }) => unknown;
  readonly getSymbolAtLocation?: (node: Node, options: { readonly sourceFile?: SourceFile }) => Symbol | undefined;
  readonly getResolvedSymbol?: (node: Node, options: { readonly sourceFile?: SourceFile }) => Symbol | undefined;
  readonly getSymbolDeclarations?: (symbol: Symbol | undefined) => readonly (Node | undefined)[];
}

export function getTstsTupleElementIndex(
  argumentNode: Node | undefined,
  sourceFile: SourceFile | undefined,
  host: TstsTupleElementIndexHost | undefined,
): number | undefined {
  return getTstsTupleElementIndexWorker(argumentNode, sourceFile, host, new Set<Node>());
}

export function csharpTupleElementMemberName(index: number): string {
  return `Item${index + 1}`;
}

function getTstsTupleElementIndexWorker(
  argumentNode: Node | undefined,
  sourceFile: SourceFile | undefined,
  host: TstsTupleElementIndexHost | undefined,
  seen: Set<Node>,
): number | undefined {
  if (argumentNode === undefined || host === undefined) {
    return undefined;
  }
  if (seen.has(argumentNode)) {
    return undefined;
  }
  seen.add(argumentNode);
  const constantValue = getTstsConstantValue(argumentNode, sourceFile, host);
  const constantIndex = typeof constantValue === "number"
    ? getNonNegativeSafeIntegerIndex(constantValue)
    : undefined;
  return constantIndex ??
    getTstsTupleElementIndexFromNumericLiteral(argumentNode, host) ??
    getTstsTupleElementIndexFromUnwrappedExpression(argumentNode, sourceFile, host, seen) ??
    getTstsTupleElementIndexFromSymbolDeclaration(argumentNode, sourceFile, host, seen);
}

function getTstsConstantValue(
  argumentNode: Node,
  sourceFile: SourceFile | undefined,
  host: TstsTupleElementIndexHost,
): unknown {
  return host.getConstantValue(argumentNode, sourceFile === undefined ? undefined : { sourceFile });
}

function getTstsTupleElementIndexFromNumericLiteral(
  argumentNode: Node,
  host: TstsTupleElementIndexHost,
): number | undefined {
  if (host.kindName?.(argumentNode) !== "KindNumericLiteral" || host.text === undefined) {
    return undefined;
  }
  return getNonNegativeSafeIntegerIndex(parseFiniteNumberLiteral(host.text(argumentNode)));
}

function getTstsTupleElementIndexFromUnwrappedExpression(
  argumentNode: Node,
  sourceFile: SourceFile | undefined,
  host: TstsTupleElementIndexHost,
  seen: Set<Node>,
): number | undefined {
  const kindName = host.kindName?.(argumentNode);
  switch (kindName) {
    case "KindAsExpression":
    case "KindSatisfiesExpression":
    case "KindParenthesizedExpression":
    case "KindNonNullExpression":
    case "KindTypeAssertionExpression":
      return getTstsTupleElementIndexWorker(
        asNodeSubject(getNodeField(argumentNode, "Expression")),
        sourceFile,
        host,
        seen,
      );
    default:
      return undefined;
  }
}

function getTstsTupleElementIndexFromSymbolDeclaration(
  argumentNode: Node,
  sourceFile: SourceFile | undefined,
  host: TstsTupleElementIndexHost,
  seen: Set<Node>,
): number | undefined {
  if (host.getResolvedSymbol === undefined || host.getSymbolDeclarations === undefined) {
    return undefined;
  }
  const symbol = host.getSymbolAtLocation?.(argumentNode, { sourceFile }) ??
    host.getResolvedSymbol(argumentNode, { sourceFile });
  for (const declaration of host.getSymbolDeclarations(symbol)) {
    if (declaration === undefined) {
      continue;
    }
    const initializer = asNodeSubject(getNodeField(declaration, "Initializer"));
    const index = getTstsTupleElementIndexWorker(initializer, sourceFile, host, seen);
    if (index !== undefined) {
      return index;
    }
  }
  return undefined;
}

function getNonNegativeSafeIntegerIndex(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isSafeInteger(value) || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}
