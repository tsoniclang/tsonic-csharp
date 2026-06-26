import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Node,
  Type,
} from "@tsonic/tsts";
import {
  getBundledLibraryPath,
} from "@tsonic/tsts";
import {
  asNodeSubject,
} from "../fact-subjects.js";

export interface SourceLibraryMember {
  readonly id: SourceLibraryMemberKey;
  readonly declaringName: SourceLibraryDeclaringKey;
  readonly name: string;
}

export type SourceLibraryDeclaringKey = "Array" | "ReadonlyArray" | "String" | "Number" | "Boolean" | "RegExp" | "Date" | "Math" | "Promise" | "Object" | "JSON" | "Console" | "Map" | "ReadonlyMap" | "Set" | "ReadonlySet";

export type SourceLibraryTypeName = SourceLibraryDeclaringKey | "Record";

export type SourceLibraryMemberKey = `${SourceLibraryDeclaringKey}.${string}`;
export type SourceLibraryMemberKeyPrefix = `${SourceLibraryDeclaringKey}.`;

export interface SourceLibraryMemberIdentityPolicy {
  readonly ids?: ReadonlySet<SourceLibraryMemberKey>;
  readonly prefixes?: readonly SourceLibraryMemberKeyPrefix[];
}

export function createSourceLibraryMember(
  declaringName: SourceLibraryDeclaringKey,
  memberName: string,
): SourceLibraryMember {
  return {
    id: `${declaringName}.${memberName}`,
    declaringName,
    name: memberName,
  };
}

export function sourceLibraryMemberIdSet(ids: readonly SourceLibraryMemberKey[]): ReadonlySet<SourceLibraryMemberKey> {
  return new Set(ids);
}

export function sourceLibraryMemberIdentity(sourceMember: SourceLibraryMember): SourceLibraryMemberKey {
  return sourceMember.id;
}

export function sourceLibraryMemberName(sourceMember: SourceLibraryMember): string {
  return sourceMember.name;
}

export function sourceLibraryMemberMatches(
  sourceMember: SourceLibraryMember,
  policy: SourceLibraryMemberIdentityPolicy,
): boolean {
  return (policy.ids === undefined || policy.ids.has(sourceMember.id)) &&
    (policy.prefixes === undefined || policy.prefixes.some((prefix) => sourceLibraryMemberHasPrefix(sourceMember, prefix)));
}

export function sourceLibraryMemberMatchesAny(
  sourceMember: SourceLibraryMember,
  ids: ReadonlySet<SourceLibraryMemberKey>,
): boolean {
  return sourceLibraryMemberMatches(sourceMember, { ids });
}

export function sourceLibraryMemberMatchesAnyPrefix(
  sourceMember: SourceLibraryMember,
  prefixes: readonly SourceLibraryMemberKeyPrefix[],
): boolean {
  return sourceLibraryMemberMatches(sourceMember, { prefixes });
}

export function resolveSourceLibraryMemberIdentity(
  declarationSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  const ast = context.compiler?.ast;
  const declaration = asNodeSubject(declarationSubject);
  if (ast === undefined || declaration === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(declaration);
  const fileName = ast.getFileName(sourceFile);
  if (!isTstsBundledStandardLibraryFile(fileName)) {
    return undefined;
  }
  const containerName = ast.text(ast.name(ast.parent(declaration)));
  const declaringName = sourceLibraryDeclaringName(containerName);
  const memberName = ast.text(ast.name(declaration)) || sourceLibraryConstructorMemberName(containerName);
  return memberName === undefined || memberName === "" || declaringName === undefined
    ? undefined
    : createSourceLibraryMember(declaringName, memberName);
}

export function isBundledStandardLibraryType(type: Type, context: ExtensionObservationContext, name: SourceLibraryTypeName): boolean {
  const ast = context.compiler?.ast;
  const types = context.compiler?.types;
  if (ast === undefined || types === undefined) {
    return false;
  }
  const target = types.isTypeReference(type) ? types.getTypeReferenceTarget(type) : type;
  const declarations = (target?.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    (type.symbol as { readonly Declarations?: readonly Node[] } | undefined)?.Declarations ??
    [];
  return declarations.some((declaration) =>
    ast.text(ast.name(declaration)) === name &&
    isTstsBundledStandardLibraryFile(ast.getFileName(ast.getSourceFile(declaration))));
}

export function getSourceLibraryDeclarationName(
  declarationSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): SourceLibraryTypeName | undefined {
  const ast = context.compiler?.ast;
  const declaration = asNodeSubject(declarationSubject);
  if (ast === undefined || declaration === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(declaration);
  const fileName = ast.getFileName(sourceFile);
  const name = ast.text(ast.name(declaration));
  return isTstsBundledStandardLibraryFile(fileName) && isSourceLibraryTypeName(name)
    ? name
    : undefined;
}

function sourceLibraryDeclaringName(name: string): SourceLibraryDeclaringKey | undefined {
  const normalized = name.endsWith("Constructor") ? name.slice(0, -"Constructor".length) : name;
  return isSourceLibraryDeclaringName(normalized) ? normalized : undefined;
}

function sourceLibraryConstructorMemberName(name: string): "constructor" | undefined {
  return sourceLibraryConstructorDeclaringNames.has(name)
    ? "constructor"
    : undefined;
}

function isSourceLibraryDeclaringName(name: string): name is SourceLibraryDeclaringKey {
  return sourceLibraryDeclaringNames.has(name as SourceLibraryDeclaringKey);
}

function isSourceLibraryTypeName(name: string): name is SourceLibraryTypeName {
  return isSourceLibraryDeclaringName(name) || name === "Record";
}

export function isTstsBundledStandardLibraryFile(fileName: string): boolean {
  const libraryPath = normalizePathPrefix(getBundledLibraryPath());
  const normalizedFileName = normalizePathPrefix(fileName);
  return normalizedFileName.startsWith(`${libraryPath}/`);
}

function normalizePathPrefix(value: string): string {
  return value.split("\\").join("/").replace(/\/+$/, "");
}

function sourceLibraryMemberHasPrefix(sourceMember: SourceLibraryMember, prefix: SourceLibraryMemberKeyPrefix): boolean {
  return sourceLibraryMemberIdentity(sourceMember).startsWith(prefix);
}

const sourceLibraryDeclaringNames: ReadonlySet<SourceLibraryDeclaringKey> = new Set([
  "Array",
  "ReadonlyArray",
  "String",
  "Number",
  "Boolean",
  "RegExp",
  "Date",
  "Math",
  "Promise",
  "Object",
  "JSON",
  "Console",
  "Map",
  "ReadonlyMap",
  "Set",
  "ReadonlySet",
]);

const sourceLibraryConstructorDeclaringNames: ReadonlySet<string> = new Set([
  "RegExpConstructor",
  "ArrayConstructor",
  "DateConstructor",
  "MapConstructor",
  "SetConstructor",
]);
