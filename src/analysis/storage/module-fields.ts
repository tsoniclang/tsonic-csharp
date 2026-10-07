import type { Node } from "@tsonic/tsts";
import { IsTypeSyntaxNode, sourceDeclarationIsModuleScoped } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpSourceEvidenceIndex } from "../source-evidence/model.js";
import { selectCsharpSourceArgument } from "../../policy/operations/members/selection/argument-selection.js";

export function classifyCsharpModuleFieldDemand(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
): (declaration: Node) => boolean {
  const fields = new Set<Node>();
  const visit = (node: Node): void => {
    if (evidence.isCompileTimeMetadata(node) || IsTypeSyntaxNode(policy.ast, node) ||
      policy.types.nativeUnreachable(node)) return;
    const selected = selectCsharpSourceArgument(policy.sourceFacts, node);
    if (selected.kind === "resolved" && selected.argument.passingMode !== "by-value") {
      const expression = selected.argument.storageExpression;
      const declaration = policy.semanticsFor(expression).operations.storage(expression)?.declaration;
      if (declaration !== undefined && (policy.ast.is.IsVariableDeclaration(declaration) ||
        policy.ast.is.IsBindingElement(declaration)) && sourceDeclarationIsModuleScoped(declaration, policy.ast)) {
        if (fields.size >= 131_072 && !fields.has(declaration))
          throw new Error("Native module-field demand exceeded its finite storage budget.");
        fields.add(declaration);
      }
    }
    policy.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const sourceFile of policy.sourceFiles) visit(sourceFile);
  return declaration => fields.has(declaration);
}
