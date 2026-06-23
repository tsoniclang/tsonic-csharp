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
  readonly declaringName: SourceLibraryDeclaringName;
  readonly memberName: string;
}

export type SourceLibraryDeclaringName = "Array" | "ReadonlyArray" | "String" | "RegExp" | "Math" | "Promise";

export type SourceLibraryTypeName = SourceLibraryDeclaringName | "Record";

export function getSourceLibraryMember(
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
    : { declaringName, memberName };
}

export function isSourceLibraryType(type: Type, context: ExtensionObservationContext, name: SourceLibraryTypeName): boolean {
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

function sourceLibraryDeclaringName(name: string): SourceLibraryDeclaringName | undefined {
  const normalized = name.endsWith("Constructor") ? name.slice(0, -"Constructor".length) : name;
  return isSourceLibraryDeclaringName(normalized) ? normalized : undefined;
}

function sourceLibraryConstructorMemberName(name: string): "constructor" | undefined {
  return name === "RegExpConstructor" ? "constructor" : undefined;
}

function isSourceLibraryDeclaringName(name: string): name is SourceLibraryDeclaringName {
  return name === "Array" ||
    name === "ReadonlyArray" ||
    name === "String" ||
    name === "RegExp" ||
    name === "Math" ||
    name === "Promise";
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
