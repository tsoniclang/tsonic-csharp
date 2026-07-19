import {
  isTsonicSourceProfileDeclarationPath,
} from "@tsonic/target-api";
import type {
  AstReader,
  ExtensionFactStore,
  Node,
  SourceFile,
  SourceFileBoundLifecycleRequest,
} from "@tsonic/tsts";
import {
  csharpSourceProfileDeclarationFactKey,
} from "../csharp-facts.js";
import type {
  CsharpSourceProfileDeclarationFact,
} from "../csharp-facts.js";
import {
  visitAstReaderNodes,
} from "./ast-utils.js";
import {
  csharpJsSourceProfileOwnerId,
  csharpSourceProfileOwnerId,
} from "./source-profile-declarations.js";

export function recordCsharpSourceProfileDeclarationFacts(
  request: SourceFileBoundLifecycleRequest,
  ast: AstReader,
  facts: ExtensionFactStore,
): void {
  const sourceFile = request.sourceFile as SourceFile | undefined;
  if (sourceFile === undefined) {
    return;
  }
  const ownerId = sourceProfileOwnerId(ast.getFileName(sourceFile));
  if (ownerId === undefined) {
    return;
  }
  visitAstReaderNodes(ast, sourceFile, (node) => {
    const fact = sourceProfileDeclarationFact(ast, node, ownerId);
    if (fact === undefined) {
      return;
    }
    facts.set(node, csharpSourceProfileDeclarationFactKey, fact, [{
      message: "C# source-profile declaration identity recorded from the host-selected declaration input.",
    }]);
  });
}

function sourceProfileOwnerId(fileName: string): string | undefined {
  if (isTsonicSourceProfileDeclarationPath(fileName, csharpSourceProfileOwnerId)) {
    return csharpSourceProfileOwnerId;
  }
  return isTsonicSourceProfileDeclarationPath(fileName, csharpJsSourceProfileOwnerId)
    ? csharpJsSourceProfileOwnerId
    : undefined;
}

function sourceProfileDeclarationFact(
  ast: AstReader,
  node: Node,
  ownerId: string,
): CsharpSourceProfileDeclarationFact | undefined {
  const kind = ast.kindName(node);
  const parent = ast.parent(node);
  const parentKind = parent === undefined ? undefined : ast.kindName(parent);
  if (isSourceProfileTypeDeclarationKind(kind) && parentKind === "KindSourceFile") {
    const name = sourceProfileDeclarationName(ast, node);
    if (name === undefined) {
      return undefined;
    }
    return { ownerId, kind: "type", name };
  }
  if (parent !== undefined && isSourceProfileTypeDeclarationKind(parentKind)) {
    const declaringName = sourceProfileDeclarationName(ast, parent);
    if (declaringName === undefined) {
      return undefined;
    }
    if (kind === "KindIndexSignature") {
      return { ownerId, kind: "indexer", name: "", declaringName };
    }
    if (isSourceProfileMemberDeclarationKind(kind)) {
      const name = isUnnamedSourceProfileMemberDeclarationKind(kind)
        ? ""
        : sourceProfileDeclarationName(ast, node);
      if (name === undefined) {
        return undefined;
      }
      return { ownerId, kind: "member", name, declaringName };
    }
  }
  if (parentKind === "KindSourceFile" && isSourceProfileGlobalMemberDeclarationKind(kind)) {
    const name = sourceProfileDeclarationName(ast, node);
    if (name === undefined) {
      return undefined;
    }
    return { ownerId, kind: "member", name, declaringName: "Global" };
  }
  return undefined;
}

function sourceProfileDeclarationName(ast: AstReader, declaration: Node): string | undefined {
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

function isSourceProfileTypeDeclarationKind(kind: string | undefined): boolean {
  return kind === "KindInterfaceDeclaration" ||
    kind === "KindClassDeclaration" ||
    kind === "KindTypeAliasDeclaration" ||
    kind === "KindEnumDeclaration";
}

function isSourceProfileMemberDeclarationKind(kind: string): boolean {
  return kind === "KindMethodSignature" ||
    kind === "KindPropertySignature" ||
    kind === "KindCallSignature" ||
    kind === "KindConstructSignature" ||
    kind === "KindMethodDeclaration" ||
    kind === "KindPropertyDeclaration" ||
    kind === "KindGetAccessor" ||
    kind === "KindSetAccessor";
}

function isUnnamedSourceProfileMemberDeclarationKind(kind: string): boolean {
  return kind === "KindCallSignature" || kind === "KindConstructSignature";
}

function isSourceProfileGlobalMemberDeclarationKind(kind: string): boolean {
  return kind === "KindFunctionDeclaration" ||
    kind === "KindClassDeclaration" ||
    kind === "KindEnumDeclaration";
}
