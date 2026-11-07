import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCallableDeclarationEmission } from "../../../target-model/records/callables/callable-emission.js";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/program/declarations.js";
import type { CsharpGeneratorRecords } from "../../../target-model/records/callables/generators.js";
import { createCsharpCallableDeclarationRecords } from "../../program/records/callables/callable-emission.js";
import type { CsharpCallableContractIndex } from "../../../target-model/records/callables/callable-values.js";
import type { CsharpModuleCallableIdentities } from "../../../target-model/records/callables/module-callables.js";

export function analyzeCsharpCallableDeclarationEmission(input: {
  readonly ast: AstReader;
  readonly moduleCallables: CsharpModuleCallableIdentities;
  readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean;
  readonly declarations: CsharpDeclarationClassifications;
  readonly generators: CsharpGeneratorRecords;
  readonly callables: CsharpCallableContractIndex;
}) {
  const values = new Map<Node, CsharpCallableDeclarationEmission>();
  const issues: TargetDiagnostic[] = [];
  for (const node of input.nodes) {
    if (!input.admitted(node) || input.ast.body(node) === undefined ||
      !input.ast.is.IsFunctionDeclaration(node) && !input.ast.is.IsFunctionExpression(node) && !input.ast.is.IsArrowFunction(node) &&
      !input.ast.is.IsMethodDeclaration(node) && !input.ast.is.IsGetAccessorDeclaration(node)) continue;
    // A set accessor has no native return carrier: it is planned as the property's void setter body, which reads no
    // callable declaration record, and the checker infers no return type for it.
    const returned = input.declarations.returnContract.get(node);
    if (returned === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted callable requires its finalized return contract.", node);
    if (returned.kind === "rejected") {
      // A represented-return CsharpRefusal keeps its own code and site (D1 §1.4); any other rejection is this file's.
      issues.push(returned.refusal === undefined
        ? { code: "CSHARP_CALLABLE_DECLARATION_EMISSION", category: "error", source: "tsonic-csharp", sourceNode: node, message: returned.reason }
        : { code: returned.refusal.code, category: "error", source: "tsonic-csharp", sourceNode: returned.refusal.site, message: returned.refusal.message });
      continue;
    }
    const generator = input.generators.generator.get(node) !== undefined;
    const contract = input.callables.get({ kind: "declaration", declaration: node });
    if (contract === undefined) failTargetAnalysisInvariant("tsonic-csharp",
      `An admitted callable requires its sealed source value vector and native ABI. ${input.ast.kindName(node)}@${input.ast.pos(node)}`,
      node);
    const sourceIdentity = input.moduleCallables.get(node) ?? Object.freeze({ callable: node, sourceOwner: node });
    const emission = Object.freeze({ contract, sourceIdentity,
      async: !generator && input.ast.hasModifierKind(node, "async"), returnCarrier: returned.type, generator });
    values.set(node, emission);
    if (sourceIdentity.sourceOwner !== node) values.set(sourceIdentity.sourceOwner, emission);
  }
  return Object.freeze({ records: createCsharpCallableDeclarationRecords(values), issues: Object.freeze(issues) });
}
