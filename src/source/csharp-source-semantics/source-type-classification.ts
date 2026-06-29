import type {
  ExtensionObservationContext,
  Type,
} from "@tsonic/tsts";
import type {
  SourceLibraryDeclaringKey,
  SourceLibraryTypeName,
} from "./source-library.js";
import {
  isBundledStandardLibraryType,
} from "./source-library.js";

export type SourceStandardLibraryTypeCategory =
  | "array"
  | "boolean"
  | "collection"
  | "date"
  | "json"
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

export function classifySourceStandardLibraryType(
  type: Type,
  context: ExtensionObservationContext,
): SourceStandardLibraryTypeClassification | undefined {
  return sourceStandardLibraryTypePolicies.find((policy) => isBundledStandardLibraryType(type, context, policy.name));
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
  return classifySourceStandardLibraryType(type, context)?.category === "promise";
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
  return name === undefined || name === "Record" ? undefined : name;
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
  { name: "Object", category: "object" },
  { name: "JSON", category: "json" },
  { name: "Console", category: "object" },
  { name: "Map", category: "collection", collectionKind: "map", mutability: "mutable" },
  { name: "ReadonlyMap", category: "collection", collectionKind: "map", mutability: "readonly" },
  { name: "Set", category: "collection", collectionKind: "set", mutability: "mutable" },
  { name: "ReadonlySet", category: "collection", collectionKind: "set", mutability: "readonly" },
  { name: "Record", category: "record" },
];
