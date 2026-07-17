import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  Type,
} from "@tsonic/tsts";
import {
  isTsonicSourceProfileDeclarationPath,
} from "@tsonic/target-api";
import {
  asNodeSubject,
} from "../fact-subjects.js";
import {
  getSymbolDeclarations,
} from "./symbol-utils.js";
import {
  csharpSourceProfileOwnerId,
} from "./source-profile-declarations.js";

export interface SourceLibraryMember {
  readonly id: SourceLibraryMemberKey;
  readonly declaringName: SourceLibraryDeclaringKey;
  readonly name: string;
}

export type SourceLibraryDeclaringKey = "Array" | "ReadonlyArray" | "String" | "Number" | "Boolean" | "RegExp" | "Date" | "Math" | "Promise" | "Generator" | "AsyncGenerator" | "Iterator" | "AsyncIterator" | "Iterable" | "AsyncIterable" | "IterableIterator" | "AsyncIterableIterator" | "Object" | "JSON" | "Console" | "Map" | "ReadonlyMap" | "Set" | "ReadonlySet" | "Function" | "Proxy" | "Global";

export type SourceLibraryTypeName = Exclude<SourceLibraryDeclaringKey, "Global"> | "Record";

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
  if (!isTsonicJsSurfaceSourceProfileFile(fileName)) {
    return undefined;
  }
  const parent = ast.parent(declaration);
  const containerName = ast.text(ast.name(parent));
  const declaringName = ast.is.IsSourceFile(parent)
    ? "Global"
    : sourceLibraryDeclaringName(containerName);
  const memberName = ast.text(ast.name(declaration)) || sourceLibraryConstructorMemberName(containerName);
  return memberName === undefined || memberName === "" || declaringName === undefined
    ? undefined
    : createSourceLibraryMember(declaringName, memberName);
}

export function resolveSelectedSourceLibraryMemberIdentity(
  declarationSubject: ExtensionFactSubject | undefined,
  symbolSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  const direct = resolveSourceLibraryMemberIdentityFromDeclaration(declarationSubject, context);
  if (direct !== undefined) {
    return direct;
  }
  const checker = context.compiler?.checker;
  for (const declaration of getSymbolDeclarations(symbolSubject, checker)) {
    const sourceMember = resolveSourceLibraryMemberIdentityFromDeclaration(declaration, context);
    if (sourceMember !== undefined) {
      return sourceMember;
    }
  }
  return undefined;
}

function resolveSourceLibraryMemberIdentityFromDeclaration(
  declarationSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): SourceLibraryMember | undefined {
  const declaration = asNodeSubject(declarationSubject);
  if (declaration === undefined) {
    return undefined;
  }
  const direct = resolveSourceLibraryMemberIdentity(declaration, context);
  if (direct !== undefined) {
    return direct;
  }
  return resolveSourceLibraryMemberIdentity(context.compiler?.ast.parent(declaration), context);
}

export function isTsonicSourceLibraryType(type: Type, context: ExtensionObservationContext, name: SourceLibraryTypeName): boolean {
  return getTsonicSourceLibraryTypeNames(type, context).has(name);
}

export function getTsonicSourceLibraryTypeNames(
  type: Type,
  context: ExtensionObservationContext,
): ReadonlySet<SourceLibraryTypeName> {
  const compiler = context.compiler;
  const ast = compiler?.ast;
  const types = compiler?.typeShape;
  const checker = compiler?.checker;
  if (ast === undefined || types === undefined || checker === undefined) {
    return new Set();
  }
  const target = types.isTypeReference(type) ? types.getTypeReferenceTarget(type) : type;
  const symbols = new Set([
    checker.getTypeSymbol(target),
    checker.getTypeSymbol(type),
  ]);
  const declarations = new Set(
    [...symbols].flatMap((symbol) => getSymbolDeclarations(symbol, checker)),
  );
  const names = new Set<SourceLibraryTypeName>();
  for (const declaration of declarations) {
    const declarationName = getSourceLibraryDeclarationName(declaration, context);
    if (declarationName !== undefined) {
      names.add(declarationName);
    }
  }
  return names;
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
  if (!isTsonicSourceLibraryProfileFile(fileName)) {
    return undefined;
  }
  if (isSourceLibraryTypeName(name)) {
    return name;
  }
  const declaringName = sourceLibraryDeclaringName(name);
  return declaringName === "Global" ? undefined : declaringName;
}

export function getSelectedSourceLibraryDeclarationName(
  declarationSubject: ExtensionFactSubject | undefined,
  symbolSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): SourceLibraryTypeName | undefined {
  const sourceMember = resolveSelectedSourceLibraryMemberIdentity(declarationSubject, symbolSubject, context);
  if (sourceMember !== undefined && sourceMember.declaringName !== "Global") {
    return sourceMember.declaringName;
  }
  const direct = getSourceLibraryDeclarationNameForDeclaration(declarationSubject, context);
  if (direct !== undefined) {
    return direct;
  }
  const checker = context.compiler?.checker;
  for (const declaration of getSymbolDeclarations(symbolSubject, checker)) {
    const declarationName = getSourceLibraryDeclarationNameForDeclaration(declaration, context);
    if (declarationName !== undefined) {
      return declarationName;
    }
  }
  return undefined;
}

function getSourceLibraryDeclarationNameForDeclaration(
  declarationSubject: ExtensionFactSubject | undefined,
  context: ExtensionObservationContext,
): SourceLibraryTypeName | undefined {
  const declaration = asNodeSubject(declarationSubject);
  if (declaration === undefined) {
    return undefined;
  }
  const direct = getSourceLibraryDeclarationName(declaration, context);
  if (direct !== undefined) {
    return direct;
  }
  return getSourceLibraryDeclarationName(context.compiler?.ast.parent(declaration), context);
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

export function isTsonicJsSurfaceSourceProfileFile(fileName: string): boolean {
  return isTsonicSourceProfileDeclarationPath(fileName, "js");
}

function isTsonicSourceLibraryProfileFile(fileName: string): boolean {
  return isTsonicJsSurfaceSourceProfileFile(fileName) ||
    isTsonicSourceProfileDeclarationPath(fileName, csharpSourceProfileOwnerId);
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
  "Generator",
  "AsyncGenerator",
  "Iterator",
  "AsyncIterator",
  "Iterable",
  "AsyncIterable",
  "IterableIterator",
  "AsyncIterableIterator",
  "Object",
  "JSON",
  "Console",
  "Map",
  "ReadonlyMap",
  "Set",
  "ReadonlySet",
  "Function",
  "Proxy",
  "Global",
]);

const sourceLibraryConstructorDeclaringNames: ReadonlySet<string> = new Set([
  "RegExpConstructor",
  "BooleanConstructor",
  "NumberConstructor",
  "StringConstructor",
  "ArrayConstructor",
  "DateConstructor",
  "MapConstructor",
  "SetConstructor",
  "FunctionConstructor",
  "ProxyConstructor",
  "PromiseConstructor",
]);
