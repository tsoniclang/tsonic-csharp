import type { Node, SourceFile } from "@tsonic/tsts";
import { sourceClassFieldIsTypeOnly, type TargetSourceProgram } from "@tsonic/target-api/source";
import type { CsharpStorageIssue } from "../storage/model.js";

export function analyzeCsharpTypeOnlyDeclarations(source: TargetSourceProgram, sourceFiles: readonly SourceFile[]): {
  readonly declarations: ReadonlySet<Node>;
  readonly issues: readonly CsharpStorageIssue[];
} {
  const declarations = new Set<Node>();
  const issues: CsharpStorageIssue[] = [];
  const { ast, navigation } = source;
  const erasedUse = (reference: Node): boolean => {
    for (let owner: Node | undefined = reference; owner !== undefined; owner = ast.parent(owner)) {
      if (ast.kindName(owner) === "KindPropertySignature" || sourceClassFieldIsTypeOnly(ast, owner)) return true;
      if (ast.is.IsSourceFile(owner)) return false;
    }
    return false;
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
        for (const use of navigation.declarationUses(declaration)) {
          if (use.kind === "type-only" || use.kind === "source-linkage" || erasedUse(use.reference)) continue;
          issues.push({ node: use.reference, code: "CSHARP_AMBIENT_VALUE_IMPLEMENTATION_MISSING",
            message: "A runtime read of an authored ambient variable requires an exact native implementation." });
        }
      }
      continue;
    }
    if (!ast.is.IsInterfaceDeclaration(statement) || ast.extendsHeritageElements(statement).length !== 0) continue;
    const members = ast.members(statement);
    if (members.length === 0 || members.some(member => member === undefined || ast.kindName(member) !== "KindPropertySignature" ||
      !ast.is.IsComputedPropertyName(ast.name(member)))) continue;
    const uses = navigation.declarationUses(statement);
    if (uses.some(use => conditionalPredicate(use.reference)) &&
      uses.every(use => use.kind === "source-linkage" || conditionalPredicate(use.reference))) declarations.add(statement);
  }
  return Object.freeze({ declarations, issues: Object.freeze(issues) });
}
