import type {
  ExtensionObservationContext,
  Type,
} from "@tsonic/tsts";
import {
  getNodeNameText,
} from "../ast-utils.js";
import {
  getSourceLibraryDeclarationName,
} from "../source-library.js";
import {
  getSymbolDeclarations,
} from "../symbol-utils.js";
import {
  csharpTargetNamedType,
} from "../target-types.js";
import type {
  CsharpSemanticTypeDeclarationShape,
} from "../target-type-resolution.js";
import type {
  CsharpObjectShapeSemanticsHost,
} from "../object-shape-types.js";

export function getSemanticTypeDeclarationShape(
  type: Type,
  context: ExtensionObservationContext,
  host: CsharpObjectShapeSemanticsHost,
): CsharpSemanticTypeDeclarationShape | undefined {
  const compiler = context.compiler;
  const ast = compiler?.ast;
  if (compiler === undefined || ast === undefined) {
    return undefined;
  }
  const declarations = getSymbolDeclarations(compiler.checker.getTypeSymbol(type), compiler.checker);
  for (const declaration of declarations) {
    const kind = ast.kindName(declaration);
    if (kind !== "KindClassDeclaration" && kind !== "KindInterfaceDeclaration" && kind !== "KindEnumDeclaration") {
      continue;
    }
    if (getSourceLibraryDeclarationName(declaration, context) !== undefined) {
      continue;
    }
    const name = getNodeNameText(ast, declaration);
    if (name.length === 0) {
      continue;
    }
    const targetTypeArguments = host.getTargetTypeArgumentsForType(type, context, {});
    if (targetTypeArguments === undefined) {
      return undefined;
    }
    const targetType = {
      ...csharpTargetNamedType(name, targetTypeArguments, { kind: "named", name }),
      csharpSourceDeclarationKind: kind === "KindClassDeclaration"
        ? "class" as const
        : kind === "KindInterfaceDeclaration"
          ? "interface" as const
          : "enum" as const,
    };
    if (kind === "KindClassDeclaration") {
      return { kind: "class", name, targetType };
    }
    if (kind === "KindInterfaceDeclaration") {
      return { kind: "interface", name, targetType };
    }
    return { kind: "enum", name, targetType };
  }
  return undefined;
}
