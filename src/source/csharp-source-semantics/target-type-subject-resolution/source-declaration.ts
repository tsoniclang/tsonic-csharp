import type {
  ExtensionFactSubject,
  ExtensionObservationContext,
  TargetTypeRef,
} from "@tsonic/tsts";
import {
  asNodeSubject,
  getNodeNameText,
} from "../ast-utils.js";
import {
  getSourceLibraryDeclarationName,
} from "../source-library.js";
import {
  sourceDeclarationTargetType,
} from "../source-declaration-facts.js";
import {
  csharpSourceDeclarationTargetFactKey,
} from "../../csharp-facts.js";
import {
  getSymbolDeclarations,
  getSymbolForDeclarationLookup,
} from "../symbol-utils.js";

export function getSourceDeclarationTargetTypeRef(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const direct = context.factResolver.resolve(subject, csharpSourceDeclarationTargetFactKey)?.targetType;
  if (direct !== undefined) {
    return direct;
  }
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (node === undefined || ast === undefined || checker === undefined) {
    return undefined;
  }
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, ast.getSourceFile(node));
  for (const declaration of getSymbolDeclarations(symbol, checker)) {
    const kind = ast.kindName(declaration);
    if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
      continue;
    }
    if (getSourceLibraryDeclarationName(declaration, context) !== undefined) {
      continue;
    }
    const recorded = context.factResolver.resolve(declaration, csharpSourceDeclarationTargetFactKey)?.targetType;
    if (recorded !== undefined) {
      return recorded;
    }
    const name = getNodeNameText(ast, declaration);
    if (name.length === 0) {
      continue;
    }
    return sourceDeclarationTargetType(name, kind);
  }
  return undefined;
}
