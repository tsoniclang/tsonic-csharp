import type {
  AstReader,
  SourceFileQueries,
  Type,
} from "@tsonic/tsts";
import type {
  TargetSelection,
} from "@tsonic/target-api";
import {
  isTsonicSourceProfileDeclarationPath,
} from "@tsonic/target-api";

export type CsharpSourceProfileTypeKind =
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "readonly-array"
  | "promise"
  | "record"
  | "date"
  | "regexp"
  | "map"
  | "readonly-map"
  | "set"
  | "readonly-set"
  | "iterable";

export interface CsharpSourceProfileTypeIdentity {
  readonly ownerId: "csharp-provider" | "js";
  readonly sourceName: string;
  readonly kind: CsharpSourceProfileTypeKind;
}

export function selectedCsharpSourceProfileOwner(
  target: TargetSelection,
): CsharpSourceProfileTypeIdentity["ownerId"] {
  return target.surfaces?.includes("js") === true
    ? "js"
    : "csharp-provider";
}

const sourceProfileTypePolicies = Object.freeze([
  sourceProfileTypePolicy("csharp-provider", "Boolean", "boolean"),
  sourceProfileTypePolicy("csharp-provider", "Number", "number"),
  sourceProfileTypePolicy("csharp-provider", "String", "string"),
  sourceProfileTypePolicy("csharp-provider", "Array", "array"),
  sourceProfileTypePolicy("csharp-provider", "ReadonlyArray", "readonly-array"),
  sourceProfileTypePolicy("csharp-provider", "Promise", "promise"),
  sourceProfileTypePolicy("csharp-provider", "PromiseLike", "promise"),
  sourceProfileTypePolicy("csharp-provider", "Record", "record"),
  sourceProfileTypePolicy("csharp-provider", "RegExp", "regexp"),
  sourceProfileTypePolicy("csharp-provider", "Iterable", "iterable"),
  sourceProfileTypePolicy(
    "csharp-provider",
    "IterableIterator",
    "iterable",
  ),
  sourceProfileTypePolicy("js", "Boolean", "boolean"),
  sourceProfileTypePolicy("js", "Number", "number"),
  sourceProfileTypePolicy("js", "String", "string"),
  sourceProfileTypePolicy("js", "Array", "array"),
  sourceProfileTypePolicy("js", "ReadonlyArray", "readonly-array"),
  sourceProfileTypePolicy("js", "Promise", "promise"),
  sourceProfileTypePolicy("js", "PromiseLike", "promise"),
  sourceProfileTypePolicy("js", "Record", "record"),
  sourceProfileTypePolicy("js", "Date", "date"),
  sourceProfileTypePolicy("js", "RegExp", "regexp"),
  sourceProfileTypePolicy("js", "Map", "map"),
  sourceProfileTypePolicy("js", "ReadonlyMap", "readonly-map"),
  sourceProfileTypePolicy("js", "Set", "set"),
  sourceProfileTypePolicy("js", "ReadonlySet", "readonly-set"),
  sourceProfileTypePolicy("js", "Iterable", "iterable"),
  sourceProfileTypePolicy("js", "IterableIterator", "iterable"),
]);

export function classifyCsharpSourceProfileType(
  type: Type,
  queries: SourceFileQueries,
): CsharpSourceProfileTypeIdentity | undefined {
  const symbols = [
    queries.checker.getTypeAliasSymbol(type),
    queries.checker.getTypeSymbol(type),
    ...(queries.typeShape.isTypeReference(type)
      ? [queries.checker.getTypeSymbol(queries.typeShape.getTypeReferenceTarget(type))]
      : []),
  ];
  for (const symbol of symbols) {
    if (symbol === undefined) {
      continue;
    }
    for (const declaration of queries.checker.getSymbolDeclarations(symbol)) {
      const identity = classifySourceProfileDeclaration(declaration, queries.ast);
      if (identity !== undefined) {
        return identity;
      }
    }
  }
  return undefined;
}

function classifySourceProfileDeclaration(
  declaration: Parameters<AstReader["name"]>[0],
  ast: AstReader,
): CsharpSourceProfileTypeIdentity | undefined {
  const sourceFile = ast.getSourceFile(declaration);
  if (sourceFile === undefined) {
    return undefined;
  }
  const fileName = ast.getFileName(sourceFile);
  const ownerId = sourceProfileOwner(fileName);
  const nameNode = ast.name(declaration);
  if (ownerId === undefined || nameNode === undefined) {
    return undefined;
  }
  const sourceName = ast.text(nameNode);
  return sourceProfileTypePolicies.find(
    (policy) => policy.ownerId === ownerId && policy.sourceName === sourceName,
  );
}

function sourceProfileOwner(
  fileName: string,
): CsharpSourceProfileTypeIdentity["ownerId"] | undefined {
  if (isTsonicSourceProfileDeclarationPath(fileName, "csharp-provider")) {
    return "csharp-provider";
  }
  return isTsonicSourceProfileDeclarationPath(fileName, "js")
    ? "js"
    : undefined;
}

function sourceProfileTypePolicy(
  ownerId: CsharpSourceProfileTypeIdentity["ownerId"],
  sourceName: string,
  kind: CsharpSourceProfileTypeKind,
): CsharpSourceProfileTypeIdentity {
  return Object.freeze({ ownerId, sourceName, kind });
}
