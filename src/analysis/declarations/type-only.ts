import type { Node, SourceFile } from "@tsonic/tsts";
import type { SourceTypeDescriptor, TargetSourceProgramFacts } from "@tsonic/target-api/source";
import { publishedCsharpCallableInterface } from "../source-evidence/types/published-callable-interface.js";

export function analyzeCsharpTypeOnlyDeclarations(source: TargetSourceProgramFacts, sourceFiles: readonly SourceFile[]): ReadonlySet<Node> {
  const declarations = new Set<Node>();
  const { syntax: ast, facts } = source;
  /** The interface extends exactly one base, and that base is a JS array or readonly array (js-source-profile facts). */
  const arrayRepresentation = (statement: Node): boolean => {
    const heritage = facts.objects.heritage(statement);
    if (!Array.isArray(heritage)) return false;
    const bases = heritage.filter(edge => edge.kind === "extends");
    if (bases.length !== 1) return false;
    const base: SourceTypeDescriptor = { kind: "declared", declaration: bases[0]!.target, typeArguments: bases[0]!.typeArguments };
    const collection = facts.profile.collection(base)?.kind;
    return collection === "array" || collection === "readonly-array";
  };
  const conditionalPredicate = (reference: Node): boolean => {
    for (let child = reference, owner = ast.parent(child); owner !== undefined; child = owner, owner = ast.parent(owner)) {
      if (ast.is.IsConditionalTypeNode(owner)) return ast.as.AsConditionalTypeNode(owner)?.ExtendsType === child;
      if (ast.is.IsSourceFile(owner)) return false;
    }
    return false;
  };
  for (const file of sourceFiles) for (const statement of ast.statements(file)) {
    if (statement === undefined) throw new Error("Checked source contains an incomplete top-level declaration.");
    if (ast.is.IsVariableStatement(statement) && ast.hasModifierKind(statement, "ambient")) {
      declarations.add(statement);
      const list = ast.as.AsVariableStatement(statement)?.DeclarationList;
      if (list === undefined) throw new Error("An ambient declaration requires its exact declaration list.");
      for (const declaration of ast.children(list)) {
        if (declaration === undefined || !ast.is.IsVariableDeclaration(declaration)) continue;
        declarations.add(declaration);
      }
      continue;
    }
    if (!ast.is.IsInterfaceDeclaration(statement)) continue;
    if (publishedCsharpCallableInterface(statement, { ast, facts }) !== undefined) {
      declarations.add(statement);
      continue;
    }
    if (arrayRepresentation(statement)) {
      declarations.add(statement);
      continue;
    }
    if (ast.extendsHeritageElements(statement).length !== 0) continue;
    const members = ast.members(statement);
    if (members.length === 0 || members.some(member => member === undefined || ast.kindName(member) !== "KindPropertySignature" ||
      !ast.is.IsComputedPropertyName(ast.name(member)))) continue;
    const uses = facts.navigation.uses.uses(statement);
    if (uses.some(use => conditionalPredicate(use.reference)) &&
      uses.every(use => use.kind === "source-linkage" || conditionalPredicate(use.reference))) declarations.add(statement);
  }
  return declarations;
}
