import type {
  AstReader,
  Node,
  ReadonlySourceFactResolver,
} from "@tsonic/tsts";
import { providerVirtualDeclarationFactKey } from "@tsonic/tsts";
import { jsSourceSemanticsIdentity } from "@tsonic/js-source-profile";
import { isTsonicSourceProfileDeclarationPath } from "@tsonic/target-api/provider";
import {
  csharpTargetId,
} from "../../../target-model/identities/source.js";
import type { SourceFileSemantics } from "@tsonic/target-api/source";

export type CsharpSourceProfileOwner = typeof csharpTargetId | "js";

export interface CsharpSourceProfileDeclarationIdentity {
  readonly owner: CsharpSourceProfileOwner;
  readonly kind: "type" | "member" | "indexer" | "call" | "construct";
  readonly declaringName?: string;
  readonly name?: string;
  readonly declaration: Node;
}

export function csharpSourceProfileDeclarationIdentity(
  ast: AstReader,
  semantics: SourceFileSemantics,
  sourceFacts: ReadonlySourceFactResolver | undefined,
  declaration: Node | undefined,
): CsharpSourceProfileDeclarationIdentity | undefined {
  if (declaration === undefined) {
    return undefined;
  }
  const providerIdentity = jsProviderDeclarationIdentity(
    ast,
    sourceFacts,
    declaration,
  );
  if (providerIdentity !== undefined) {
    return providerIdentity;
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
    const name = declarationName(ast, semantics, declaration);
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
    const name = declarationName(ast, semantics, declaration);
    return name === undefined
      ? undefined
      : { owner, kind: "type", name, declaration };
  }
  if (
    kind === "KindMappedType" &&
    parent !== undefined &&
    parentKind === "KindTypeAliasDeclaration"
  ) {
    const declaringName = declarationName(ast, semantics, parent);
    return declaringName === undefined
      ? undefined
      : { owner, kind: "indexer", declaringName, declaration };
  }
  if (parent === undefined || !sourceProfileTypeDeclarationKind(parentKind)) {
    return undefined;
  }
  const declaringName = declarationName(ast, semantics, parent);
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
  const name = declarationName(ast, semantics, declaration);
  return name === undefined
    ? undefined
    : { owner, kind: "member", declaringName, name, declaration };
}

function jsProviderDeclarationIdentity(
  ast: AstReader,
  sourceFacts: ReadonlySourceFactResolver | undefined,
  declaration: Node,
): CsharpSourceProfileDeclarationIdentity | undefined {
  const fact = sourceFacts?.getFact(
    declaration,
    providerVirtualDeclarationFactKey,
  );
  if (
    fact?.providerId !== jsSourceSemanticsIdentity.providerId ||
    fact.exportName === undefined
  ) {
    return undefined;
  }
  const kind = ast.kindName(declaration);
  if (sourceProfileTypeDeclarationKind(kind)) {
    return {
      owner: "js",
      kind: "type",
      name: fact.exportName,
      declaration,
    };
  }
  if (kind === "KindIndexSignature") {
    return {
      owner: "js",
      kind: "indexer",
      declaringName: fact.exportName,
      declaration,
    };
  }
  const name = providerMemberName(fact.memberKey, fact.memberName);
  if (name === undefined) {
    return fact.signatureId === undefined
      ? undefined
      : {
          owner: "js",
          kind: "call",
          declaringName: fact.exportName,
          name: fact.exportName,
          declaration,
        };
  }
  return {
    owner: "js",
    kind: "member",
    declaringName: fact.exportName,
    name,
    declaration,
  };
}

function providerMemberName(
  memberKey: import("@tsonic/tsts").ProviderMemberKey | undefined,
  memberName: string | undefined,
): string | undefined {
  if (memberKey?.kind === "property-key") {
    return memberKey.name;
  }
  if (memberKey?.kind === "well-known-symbol") {
    return `@@${memberKey.name}`;
  }
  return memberName;
}

function csharpSourceProfileOwner(
  fileName: string,
): CsharpSourceProfileOwner | undefined {
  if (isTsonicSourceProfileDeclarationPath(fileName, csharpTargetId)) {
    return csharpTargetId;
  }
  return isTsonicSourceProfileDeclarationPath(fileName, "js")
    ? "js"
    : undefined;
}

function declarationName(
  ast: AstReader,
  semantics: SourceFileSemantics,
  declaration: Node,
): string | undefined {
  const name = ast.name(declaration);
  if (name === undefined) {
    return undefined;
  }
  if (ast.is.IsComputedPropertyName(name)) {
    const selected = semantics.operations.wellKnownSymbol(name);
    return selected === undefined
      ? undefined
      : wellKnownMemberKey(selected.kind);
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

function wellKnownMemberKey(
  kind: NonNullable<
    ReturnType<SourceFileSemantics["operations"]["wellKnownSymbol"]>
  >["kind"],
): string {
  switch (kind) {
    case "async-dispose": return "@@asyncDispose";
    case "async-iterator": return "@@asyncIterator";
    case "dispose": return "@@dispose";
    case "has-instance": return "@@hasInstance";
    case "is-concat-spreadable": return "@@isConcatSpreadable";
    case "iterator": return "@@iterator";
    case "match": return "@@match";
    case "match-all": return "@@matchAll";
    case "replace": return "@@replace";
    case "search": return "@@search";
    case "species": return "@@species";
    case "split": return "@@split";
    case "to-primitive": return "@@toPrimitive";
    case "to-string-tag": return "@@toStringTag";
    case "unscopables": return "@@unscopables";
  }
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
