import type { CsharpClassInitializationIndex } from "../../target-model/records/class-initialization.js";
import type { Node } from "@tsonic/tsts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import { sourceExpressionUsesLexicalThis } from "@tsonic/target-api/source";
import type { CsharpClassFactoryIndex } from "../../target-model/records/class-factories.js";

export function analyzeCsharpClassInitialization(
  source: TargetSourceProgram,
  factories: CsharpClassFactoryIndex,
): CsharpClassInitializationIndex {
  const constructors = new WeakSet<Node>();
  const fields = new WeakSet<Node>();
  const regions = new WeakMap<Node, { readonly instance: readonly Node[]; readonly static: readonly Node[] }>();
  const ast = source.ast;
  const visit = (node: Node): void => {
    if (ast.is.IsClassDeclaration(node) || ast.is.IsClassExpression(node)) {
      const properties = ast.members(node).filter((member): member is Node => member !== undefined && ast.is.IsPropertyDeclaration(member));
      const factory = factories.classFactory.get(node) !== undefined;
      const instance = properties.filter(member => !ast.hasModifierKind(member, "static"));
      regions.set(node, Object.freeze({ instance: Object.freeze(instance), static: Object.freeze(ast.members(node).filter(
        (member): member is Node => member !== undefined && (ast.is.IsClassStaticBlockDeclaration(member) ||
          ast.is.IsPropertyDeclaration(member) && ast.hasModifierKind(member, "static")),
      )) }));
      const initializesParameters = ast.members(node).some(member => member !== undefined &&
        ast.is.IsConstructorDeclaration(member) && ast.parameters(member).some(parameter =>
          parameter !== undefined && ast.as.AsParameterDeclaration(parameter)?.Initializer !== undefined));
      if (factory || initializesParameters || ast.extendsHeritageElements(node).length !== 0 || instance.some(member => {
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
  return Object.freeze({ requiresClassConstructor: Object.freeze({ get: (declaration: Node) => constructors.has(declaration) }),
    relocatedClassField: Object.freeze({ get: (declaration: Node) => fields.has(declaration) }),
    classInitializationRegion: Object.freeze({ get: (declaration: Node, isStatic: boolean) => isStatic
      ? regions.get(declaration)?.static ?? [] : regions.get(declaration)?.instance ?? [] }) });
}
