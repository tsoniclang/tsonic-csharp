import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import { IsTypeSyntaxNode } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import { selectCsharpSourceArgument } from "../../source/extension/arguments.js";

export function classifyCsharpModuleFieldDemand(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
): (declaration: Node) => boolean {
  const fields = new Set<Node>();
  const visit = (node: Node): void => {
    if (evidence.compileTimeMetadata.get(node) || IsTypeSyntaxNode(policy.ast, node) ||
      policy.facts.navigation.scopes.unreachable(node)) return;
    const selected = selectCsharpSourceArgument(policy.sourceFacts, node);
    if (selected.kind === "resolved" && selected.argument.passingMode !== "by-value") {
      const expression = selected.argument.storageExpression;
      const declaration = policy.facts.selections.storage(expression)?.declaration;
      if (declaration !== undefined && (policy.ast.is.IsVariableDeclaration(declaration) ||
        policy.ast.is.IsBindingElement(declaration)) && policy.facts.navigation.scopes.isModuleScoped(declaration)) {
        if (fields.size >= 131_072 && !fields.has(declaration))
          failTargetAnalysisInvariant("tsonic-csharp", "Native module-field demand exceeded its finite storage budget.", node);
        fields.add(declaration);
      }
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of policy.sourceFiles) visit(sourceFile);
  return declaration => fields.has(declaration);
}
