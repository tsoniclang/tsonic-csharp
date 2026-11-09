import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { Node } from "@tsonic/tsts";
import { sourceDeclarationIsModuleScoped } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../target-model/types/representation.js";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/program/source-evidence.js";
import { represented, sourceOutcome } from "../../policy/types/source-type-flow/representation-results.js";

export function classifyCsharpModuleFieldDemand(policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex): CsharpRepresentationOutcome<(declaration: Node) => boolean> {
  const fields = new Set<Node>();
  for (const node of policy.sourceStorage.nodes) {
    const argument = evidence.sourceArgument.get(node);
    if (argument === undefined || argument.argument.passingMode === "by-value") continue;
    const selected = sourceOutcome(policy.facts.protocols.storage(argument.argument.storageExpression));
    if (selected.kind !== "represented") return selected;
    if (selected.value.kind === "none" || selected.value.value.kind !== "binding") continue;
    const declaration = selected.value.value.declaration;
    if ((!policy.ast.is.IsVariableDeclaration(declaration) && !policy.ast.is.IsBindingElement(declaration)) ||
      !sourceDeclarationIsModuleScoped(declaration, policy.ast)) continue;
    if (fields.size >= 131_072 && !fields.has(declaration)) failTargetAnalysisInvariant("tsonic-csharp",
      "Native module-field demand exceeded its finite storage budget.", node);
    fields.add(declaration);
  }
  return represented(declaration => fields.has(declaration));
}
