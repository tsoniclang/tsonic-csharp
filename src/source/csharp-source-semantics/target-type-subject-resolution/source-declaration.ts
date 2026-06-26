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
  getSymbolDeclarations,
  getSymbolForDeclarationLookup,
} from "../symbol-utils.js";

export function getSourceDeclarationTargetTypeRef(
  subject: ExtensionFactSubject,
  context: ExtensionObservationContext,
): TargetTypeRef | undefined {
  const node = asNodeSubject(subject);
  const ast = context.compiler?.ast;
  const checker = context.compiler?.checker;
  if (node === undefined || ast === undefined || checker === undefined) {
    return undefined;
  }
  const symbol = getSymbolForDeclarationLookup(ast, checker, node, ast.getSourceFile(node));
  for (const declaration of getSymbolDeclarations(symbol)) {
    const kind = ast.kindName(declaration);
    if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
      continue;
    }
    if (getSourceLibraryDeclarationName(declaration, context) !== undefined) {
      continue;
    }
    const name = getNodeNameText(declaration);
    if (name.length === 0) {
      continue;
    }
    return sourceDeclarationTargetType(name, kind);
  }
  return undefined;
}
