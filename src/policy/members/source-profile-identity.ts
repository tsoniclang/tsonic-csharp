import type {
  AstReader,
  Node,
} from "@tsonic/tsts";
import {
  isTsonicSourceProfileDeclarationPath,
} from "@tsonic/target-api";

export type CsharpSourceProfileOwner = "csharp-provider" | "js";

export interface CsharpSourceProfileDeclarationIdentity {
  readonly owner: CsharpSourceProfileOwner;
  readonly kind: "type" | "member" | "indexer" | "call" | "construct";
  readonly declaringName?: string;
  readonly name?: string;
  readonly declaration: Node;
}

export function csharpSourceProfileDeclarationIdentity(
  ast: AstReader,
  declaration: Node | undefined,
): CsharpSourceProfileDeclarationIdentity | undefined {
  if (declaration === undefined) {
    return undefined;
  }
  const sourceFile = ast.getSourceFile(declaration);
  const owner = sourceFile === undefined
    ? undefined
    : csharpSourceProfileOwner(ast.getFileName(sourceFile));
  if (owner === undefined) {
    return undefined;
  }
  const kind = ast.kindName(declaration);
  const parent = ast.parent(declaration);
  const parentKind = parent === undefined ? undefined : ast.kindName(parent);
  if (
    kind === "KindFunctionDeclaration" &&
    parentKind === "KindSourceFile"
  ) {
    const name = declarationName(ast, declaration);
    return name === undefined
      ? undefined
      : {
          owner,
          kind: "call",
          declaringName: "Global",
          name,
          declaration,
        };
  }
  if (sourceProfileTypeDeclarationKind(kind) && parentKind === "KindSourceFile") {
    const name = declarationName(ast, declaration);
    return name === undefined
      ? undefined
      : { owner, kind: "type", name, declaration };
  }
  if (parent === undefined || !sourceProfileTypeDeclarationKind(parentKind)) {
    return undefined;
  }
  const declaringName = declarationName(ast, parent);
  if (declaringName === undefined) {
    return undefined;
  }
  if (kind === "KindIndexSignature") {
    return { owner, kind: "indexer", declaringName, declaration };
  }
  if (kind === "KindCallSignature") {
    return { owner, kind: "call", declaringName, declaration };
  }
  if (kind === "KindConstructSignature") {
    return { owner, kind: "construct", declaringName, declaration };
  }
  if (!sourceProfileNamedMemberDeclarationKind(kind)) {
    return undefined;
  }
  const name = declarationName(ast, declaration);
  return name === undefined
    ? undefined
    : { owner, kind: "member", declaringName, name, declaration };
}

function csharpSourceProfileOwner(
  fileName: string,
): CsharpSourceProfileOwner | undefined {
  if (isTsonicSourceProfileDeclarationPath(fileName, "csharp-provider")) {
    return "csharp-provider";
  }
  return isTsonicSourceProfileDeclarationPath(fileName, "js")
    ? "js"
    : undefined;
}

function declarationName(
  ast: AstReader,
  declaration: Node,
): string | undefined {
  const name = ast.name(declaration);
  if (name === undefined) {
    return undefined;
  }
  const kind = ast.kindName(name);
  if (
    kind !== "KindIdentifier" &&
    kind !== "KindStringLiteral" &&
    kind !== "KindNumericLiteral" &&
    kind !== "KindPrivateIdentifier"
  ) {
    return undefined;
  }
  const text = ast.text(name);
  return text === "" ? undefined : text;
}

function sourceProfileTypeDeclarationKind(kind: string | undefined): boolean {
  return kind === "KindInterfaceDeclaration" ||
    kind === "KindClassDeclaration" ||
    kind === "KindTypeAliasDeclaration" ||
    kind === "KindEnumDeclaration";
}

function sourceProfileNamedMemberDeclarationKind(kind: string): boolean {
  return kind === "KindMethodSignature" ||
    kind === "KindPropertySignature" ||
    kind === "KindMethodDeclaration" ||
    kind === "KindPropertyDeclaration" ||
    kind === "KindGetAccessor" ||
    kind === "KindSetAccessor";
}
