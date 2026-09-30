import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { sourceExpressionUsesLexicalThis } from "@tsonic/target-api/source";
import type { CsharpClassFactoryIndex } from "./class-factories.js";

export interface CsharpClassInitializationIndex {
  requiresConstructor(declaration: Node): boolean;
  relocatesField(declaration: Node): boolean;
}

export function analyzeCsharpClassInitialization(
  source: TargetSourceProgram,
  factories: CsharpClassFactoryIndex,
): CsharpClassInitializationIndex {
  const constructors = new WeakSet<Node>();
  const fields = new WeakSet<Node>();
  const ast = source.ast;
  const visit = (node: Node): void => {
    if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node)) {
      const properties = ast.members(node).filter((member): member is Node => member !== undefined && ast.is.IsPropertyDeclaration(member));
      const factory = factories.get(node) !== undefined;
      const instance = properties.filter(member => !ast.hasModifierKind(member, "static"));
      if (factory || instance.some(member => {
        const initializer = ast.as.AsPropertyDeclaration(member)?.Initializer;
        return initializer !== undefined && sourceExpressionUsesLexicalThis(ast, initializer);
      })) {
        constructors.add(node);
        for (const member of instance) fields.add(member);
      }
      if (factory) for (const member of properties) fields.add(member);
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  source.navigation.sourceFiles.forEach(visit);
  return Object.freeze({ requiresConstructor: (declaration: Node) => constructors.has(declaration),
    relocatesField: (declaration: Node) => fields.has(declaration) });
}
