import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/index.js";

export type CsharpClassPropertyStorage = "field" | "property";

export function classifyCsharpClassPropertyStorage(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
): (declaration: Node) => CsharpClassPropertyStorage | undefined {
  const selections = new WeakMap<Node, CsharpClassPropertyStorage>();
  for (const sourceFile of policy.sourceFiles) visit(sourceFile);
  return declaration => selections.get(declaration);

  function visit(node: Node): void {
    if (evidence.isCompileTimeMetadata(node)) return;
    if (policy.ast.is.IsClassDeclaration(node) || policy.ast.is.IsClassExpression(node)) {
      const properties = new Set<string>();
      const seen = new Set<Node>();
      const heritage = policy.navigation.declaredHeritage(node);
      if (heritage.kind === "resolved") for (const edge of heritage.edges) {
        if (edge.kind === "implements") collectInterface(edge.target.declaration, properties, seen);
      }
      const shape = policy.objectShapes.resolveNode(node, policy.ast.getSourceFile(node));
      if ((shape?.implements?.length ?? 0) > 0) for (const member of shape!.members) {
        if (member.memberKind === "property") properties.add(member.sourceName);
      }
      for (const member of policy.ast.members(node)) {
        if (member === undefined || !policy.ast.is.IsPropertyDeclaration(member)) continue;
        const declaration = policy.ast.as.AsPropertyDeclaration(member)!;
        const field = evidence.sourceField([member, declaration.name, declaration.Type, declaration.Initializer]);
        const dispatch = policy.navigation.memberDispatch(member);
        selections.set(member, field !== undefined ? "field"
          : policy.ast.hasModifierKind(member, "abstract") ||
            properties.has(policy.ast.text(declaration.name)) || dispatch?.overridesBase === true ||
            dispatch?.hasDerivedOverride === true ? "property" : "field");
      }
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  }

  function collectInterface(declaration: Node, properties: Set<string>, seen: Set<Node>): void {
    if (seen.has(declaration) || !policy.ast.is.IsInterfaceDeclaration(declaration)) return;
    seen.add(declaration);
    for (const member of policy.ast.members(declaration)) {
      if (member !== undefined && policy.ast.is.IsPropertySignatureDeclaration(member)) {
        const name = policy.ast.name(member);
        if (name !== undefined) properties.add(policy.ast.text(name));
      }
    }
    const heritage = policy.navigation.declaredHeritage(declaration);
    if (heritage.kind === "resolved") for (const edge of heritage.edges) {
      if (edge.kind === "extends") collectInterface(edge.target.declaration, properties, seen);
    }
  }
}
