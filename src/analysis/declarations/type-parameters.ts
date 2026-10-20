import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpSourceEvidenceIndex } from "../../target-model/records/source-evidence.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import { createCsharpTypeParameterEmissionProducer } from "../program/records/type-parameters.js";

export function analyzeCsharpTypeParameterEmission(input: { readonly ast: AstReader; readonly nodes: readonly Node[];
  readonly evidence: CsharpSourceEvidenceIndex; readonly admitted: (node: Node) => boolean }) {
  const producer = createCsharpTypeParameterEmissionProducer();
  const issues: TargetDiagnostic[] = [];
  for (const node of new Set(input.nodes)) {
    if (!input.ast.is.IsTypeParameterDeclaration(node)) continue;
    const owner = input.ast.parent(node);
    if (owner === undefined || !input.admitted(owner)) continue;
    const declaration = input.ast.as.AsTypeParameterDeclaration(node);
    const parameter = csharpSourceTypeParameter(node, input.ast);
    if (declaration === undefined || parameter === undefined)
      failTargetAnalysisInvariant("tsonic-csharp", "An admitted generic parameter requires its exact checked identity.", node);
    const resolution = input.evidence.typeParameterConstraints.get(node);
    if (resolution === undefined)
      failTargetAnalysisInvariant("tsonic-csharp", "An admitted generic parameter requires its finalized native constraint classification.", node);
    if (declaration.Expression !== undefined) {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
        message: "Expression-based generic type parameters are outside the current C# planning surface." });
      continue;
    }
    if (resolution.kind === "unsupported") {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: declaration.Constraint ?? node, message: resolution.reason });
      continue;
    }
    producer.publish(node, { identity: parameter.identity, name: declaration.name, constraints: resolution.constraints });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
