import type {
  ExtensionObservationContext,
  Type,
} from "@tsonic/tsts";
import {
  isTsonicSourceProfileDeclarationPath,
} from "@tsonic/target-api";
import type {
  SourceLibraryDeclaringKey,
  SourceLibraryTypeName,
} from "./source-library.js";
import {
  getTsonicSourceLibraryTypeNames,
} from "./source-library.js";
import {
  getSymbolDeclarations,
} from "./symbol-utils.js";
import {
  csharpJsSourceProfileOwnerId,
  csharpSourceProfileOwnerId,
} from "./source-profile-declarations.js";

export type SourceStandardLibraryTypeCategory =
  | "array"
  | "boolean"
  | "collection"
  | "date"
  | "json"
  | "iterator"
  | "math"
  | "number"
  | "object"
  | "promise"
  | "record"
  | "regexp"
  | "string";

export interface SourceStandardLibraryTypeClassification {
  readonly name: SourceLibraryTypeName;
  readonly category: SourceStandardLibraryTypeCategory;
  readonly collectionKind?: "map" | "set";
  readonly mutability?: "mutable" | "readonly";
}

const sourceStandardLibraryTypeClassifications = new WeakMap<
  object,
  WeakMap<object, SourceStandardLibraryTypeClassification | null>
>();

export function classifySourceStandardLibraryType(
  type: Type,
  context: ExtensionObservationContext,
): SourceStandardLibraryTypeClassification | undefined {
  const compiler = objectKey(context.compiler);
  const sourceType = objectKey(type);
  const cached = compiler === undefined || sourceType === undefined
    ? undefined
    : sourceStandardLibraryTypeClassifications.get(compiler)?.get(sourceType);
  if (cached !== undefined) {
    return cached ?? undefined;
  }
  const sourceLibraryTypeNames = getTsonicSourceLibraryTypeNames(type, context);
  const classification = sourceStandardLibraryTypePolicies.find((policy) => sourceLibraryTypeNames.has(policy.name));
  if (compiler !== undefined && sourceType !== undefined) {
    let classificationsByType = sourceStandardLibraryTypeClassifications.get(compiler);
    if (classificationsByType === undefined) {
      classificationsByType = new WeakMap();
      sourceStandardLibraryTypeClassifications.set(compiler, classificationsByType);
    }
    classificationsByType.set(sourceType, classification ?? null);
  }
  return classification;
}

export function isSourceStandardLibraryArrayLikeType(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return classifySourceStandardLibraryType(type, context)?.category === "array";
}

export function isSourceStandardLibraryPromiseType(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return classifySourceStandardLibraryType(type, context)?.category === "promise" ||
    isSelectedSourceProfilePromiseType(type, context);
}

export function isSourceStandardLibraryRecordType(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return classifySourceStandardLibraryType(type, context)?.category === "record";
}

export function isSourceStandardLibraryDateType(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return classifySourceStandardLibraryType(type, context)?.category === "date";
}

export function isSourceStandardLibraryRegExpType(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return classifySourceStandardLibraryType(type, context)?.category === "regexp";
}

export function getSourceStandardLibraryDeclaringNameForType(
  type: Type,
  context: ExtensionObservationContext,
): SourceLibraryDeclaringKey | undefined {
  const types = context.compiler?.typeShape;
  if (types?.isStringLike(type) === true) {
    return "String";
  }
  if (types?.isNumberLike(type) === true) {
    return "Number";
  }
  if (types?.isBooleanLike(type) === true) {
    return "Boolean";
  }
  const name = classifySourceStandardLibraryType(type, context)?.name;
  return name === undefined || name === "PromiseLike" || name === "Record" ? undefined : name;
}

export function sourceStandardLibraryTypeIsObjectShapeExcluded(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  return classifySourceStandardLibraryType(type, context) !== undefined;
}

const sourceStandardLibraryTypePolicies: readonly SourceStandardLibraryTypeClassification[] = [
  { name: "Array", category: "array", mutability: "mutable" },
  { name: "ReadonlyArray", category: "array", mutability: "readonly" },
  { name: "String", category: "string" },
  { name: "Number", category: "number" },
  { name: "Boolean", category: "boolean" },
  { name: "RegExp", category: "regexp" },
  { name: "Date", category: "date" },
  { name: "Math", category: "math" },
  { name: "Promise", category: "promise" },
  { name: "PromiseLike", category: "promise" },
  { name: "Generator", category: "iterator" },
  { name: "AsyncGenerator", category: "iterator" },
  { name: "Iterator", category: "iterator" },
  { name: "AsyncIterator", category: "iterator" },
  { name: "Iterable", category: "iterator" },
  { name: "AsyncIterable", category: "iterator" },
  { name: "IterableIterator", category: "iterator" },
  { name: "AsyncIterableIterator", category: "iterator" },
  { name: "Object", category: "object" },
  { name: "JSON", category: "json" },
  { name: "Console", category: "object" },
  { name: "Map", category: "collection", collectionKind: "map", mutability: "mutable" },
  { name: "ReadonlyMap", category: "collection", collectionKind: "map", mutability: "readonly" },
  { name: "Set", category: "collection", collectionKind: "set", mutability: "mutable" },
  { name: "ReadonlySet", category: "collection", collectionKind: "set", mutability: "readonly" },
  { name: "Record", category: "record" },
];

function isSelectedSourceProfilePromiseType(
  type: Type,
  context: ExtensionObservationContext,
): boolean {
  const compiler = context.compiler;
  const types = compiler?.typeShape;
  const checker = compiler?.checker;
  if (compiler === undefined || types === undefined || checker === undefined) {
    return false;
  }
  const target = types.isTypeReference(type) ? types.getTypeReferenceTarget(type) : type;
  return [
    ...getSymbolDeclarations(checker.getTypeSymbol(target), checker),
    ...getSymbolDeclarations(checker.getTypeSymbol(type), checker),
  ].some((declaration) => {
    const sourceFile = compiler.ast.getSourceFile(declaration);
    const fileName = compiler.ast.getFileName(sourceFile);
    const name = compiler.ast.text(compiler.ast.name(declaration));
    return (name === "Promise" || name === "PromiseLike") &&
      (isTsonicSourceProfileDeclarationPath(fileName, csharpSourceProfileOwnerId) ||
        isTsonicSourceProfileDeclarationPath(fileName, csharpJsSourceProfileOwnerId));
  });
}

function objectKey(value: unknown): object | undefined {
  return (typeof value === "object" && value !== null) || typeof value === "function"
    ? value
    : undefined;
}
