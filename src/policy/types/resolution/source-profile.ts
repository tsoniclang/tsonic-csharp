import type {
  AstReader,
  Type,
} from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { isTsonicSourceProfileDeclarationPath } from "@tsonic/target-api/provider";
import {
  csharpTargetId,
} from "../../../target-model/identities/source.js";

export type CsharpSourceProfileTypeKind =
  | "boolean"
  | "number"
  | "string"
  | "array"
  | "readonly-array"
  | "promise"
  | "iterator-result"
  | "generator"
  | "async-generator"
  | "record"
  | "date"
  | "regexp"
  | "map"
  | "readonly-map"
  | "set"
  | "readonly-set"
  | "iterable";

export interface CsharpSourceProfileTypeIdentity {
  readonly ownerId: typeof csharpTargetId | "js";
  readonly sourceName: string;
  readonly kind: CsharpSourceProfileTypeKind;
}

export function selectedCsharpSourceProfileOwner(
  target: TargetSelection,
): CsharpSourceProfileTypeIdentity["ownerId"] {
  return target.surfaces?.includes("js") === true
    ? "js"
    : csharpTargetId;
}

const sourceProfileTypePolicies = Object.freeze([
  sourceProfileTypePolicy(csharpTargetId, "Boolean", "boolean"),
  sourceProfileTypePolicy(csharpTargetId, "Number", "number"),
  sourceProfileTypePolicy(csharpTargetId, "String", "string"),
  sourceProfileTypePolicy(csharpTargetId, "Array", "array"),
  sourceProfileTypePolicy(csharpTargetId, "ReadonlyArray", "readonly-array"),
  sourceProfileTypePolicy(csharpTargetId, "Promise", "promise"),
  sourceProfileTypePolicy(csharpTargetId, "PromiseLike", "promise"),
  sourceProfileTypePolicy(csharpTargetId, "IteratorResult", "iterator-result"),
  sourceProfileTypePolicy(csharpTargetId, "Generator", "generator"),
  sourceProfileTypePolicy(csharpTargetId, "AsyncGenerator", "async-generator"),
  sourceProfileTypePolicy(csharpTargetId, "Record", "record"),
  sourceProfileTypePolicy(csharpTargetId, "RegExp", "regexp"),
  sourceProfileTypePolicy(csharpTargetId, "Iterable", "iterable"),
  sourceProfileTypePolicy(
    csharpTargetId,
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
  sourceProfileTypePolicy("js", "IteratorResult", "iterator-result"),
  sourceProfileTypePolicy("js", "Generator", "generator"),
  sourceProfileTypePolicy("js", "AsyncGenerator", "async-generator"),
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
  semantics: SourceFileSemantics,
  ast: AstReader,
): CsharpSourceProfileTypeIdentity | undefined {
  const symbols = [
    semantics.declarations.typeAliasSymbol(type),
    semantics.declarations.typeSymbol(type),
    ...(semantics.types.isTypeReference(type)
      ? (() => {
          const target = semantics.types.typeReferenceTarget(type);
          return target === undefined
            ? []
            : [semantics.declarations.typeSymbol(target)];
        })()
      : []),
  ];
  for (const symbol of symbols) {
    if (symbol === undefined) {
      continue;
    }
    for (const declaration of semantics.declarations.symbolDeclarations(symbol)) {
      const identity = classifySourceProfileDeclaration(declaration, ast);
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
  if (
    !ast.is.IsClassDeclaration(declaration) &&
    !ast.is.IsInterfaceDeclaration(declaration) &&
    !ast.is.IsTypeAliasDeclaration(declaration)
  ) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(declaration);
  if (sourceFile === undefined) {
    return undefined;
  }
  const fileName = ast.getFileName(sourceFile);
  const ownerId = sourceProfileOwner(fileName);
  const nameNode = ast.name(declaration);
  if (
    ownerId === undefined ||
    nameNode === undefined ||
    !ast.is.IsIdentifier(nameNode)
  ) {
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
  if (isTsonicSourceProfileDeclarationPath(fileName, csharpTargetId)) {
    return csharpTargetId;
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
