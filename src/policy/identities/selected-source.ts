import type { AstReader, Node, ReadonlySourceFactResolver } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { jsSourceApiIdentity } from "@tsonic/js-source-profile";
import { isTsonicSourceProfileDeclarationPath } from "@tsonic/target-api/provider";
import { csharpTargetId } from "../../target-model/identities/target.js";
import type { SourceProgramFacts } from "@tsonic/target-api/source";

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
  facts: SourceProgramFacts,
  sourceFacts: ReadonlySourceFactResolver | undefined,
  declaration: Node | undefined,
): CsharpSourceProfileDeclarationIdentity | undefined {
  if (declaration === undefined) {
    return undefined;
  }
  if (sourceFacts === undefined) failTargetAnalysisInvariant("tsonic-csharp",
    "Source-profile identity requires the program's source facts.", declaration);
  // The JS identity is the JS source profile's (jsSourceApiIdentity, D18); C# keys its tables by it.
  const js = jsSourceApiIdentity({ ast, sourceFacts, wellKnownSymbol: (node: Node) => facts.selections.wellKnownSymbol(node) }, declaration);
  if (js !== undefined) return Object.freeze({ owner: "js", ...js });
  // The C# target's own source profile (declarations under the csharp profile path) is identified here.
  const sourceFile = ast.getSourceFile(declaration);
  const owner = sourceFile !== undefined && isTsonicSourceProfileDeclarationPath(ast.getFileName(sourceFile), csharpTargetId)
    ? csharpTargetId : undefined;
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
    const name = declarationName(ast, facts, declaration);
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
    const name = declarationName(ast, facts, declaration);
    return name === undefined
      ? undefined
      : { owner, kind: "type", name, declaration };
  }
  if (
    kind === "KindMappedType" &&
    parent !== undefined &&
    parentKind === "KindTypeAliasDeclaration"
  ) {
    const declaringName = declarationName(ast, facts, parent);
    return declaringName === undefined
      ? undefined
      : { owner, kind: "indexer", declaringName, declaration };
  }
  if (parent === undefined || !sourceProfileTypeDeclarationKind(parentKind)) {
    return undefined;
  }
  const declaringName = declarationName(ast, facts, parent);
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
  const name = declarationName(ast, facts, declaration);
  return name === undefined
    ? undefined
    : { owner, kind: "member", declaringName, name, declaration };
}

function declarationName(
  ast: AstReader,
  facts: SourceProgramFacts,
  declaration: Node,
): string | undefined {
  const name = ast.name(declaration);
  if (name === undefined) {
    return undefined;
  }
  if (ast.is.IsComputedPropertyName(name)) {
    // Published as `Symbol.iterator` ... (the same names the JS profile identity uses).
    return facts.selections.wellKnownSymbol(name);
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
