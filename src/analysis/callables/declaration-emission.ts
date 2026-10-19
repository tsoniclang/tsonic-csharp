import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpCallableDeclarationEmission } from "../../target-model/records/callable-emission.js";
import type { CsharpDeclarationClassifications } from "../../target-model/records/declarations.js";
import type { CsharpGeneratorRecords } from "../../target-model/records/generators.js";
import { createCsharpCallableDeclarationRecords } from "../program/records/callable-emission.js";

export function analyzeCsharpCallableDeclarationEmission(input: {
  readonly ast: AstReader;
  readonly nodes: readonly Node[];
  readonly admitted: (node: Node) => boolean;
  readonly declarations: CsharpDeclarationClassifications;
  readonly generators: CsharpGeneratorRecords;
}) {
  const values = new Map<Node, CsharpCallableDeclarationEmission>();
  const issues: TargetDiagnostic[] = [];
  for (const node of input.nodes) {
    if (!input.admitted(node) || input.ast.body(node) === undefined ||
      !input.ast.is.IsFunctionDeclaration(node) && !input.ast.is.IsFunctionExpression(node) && !input.ast.is.IsArrowFunction(node) &&
      !input.ast.is.IsMethodDeclaration(node) && !input.ast.is.IsGetAccessorDeclaration(node) && !input.ast.is.IsSetAccessorDeclaration(node)) continue;
    const returned = input.declarations.returnContract.get(node);
    if (returned === undefined) failTargetAnalysisInvariant("tsonic-csharp", "An admitted callable requires its finalized return contract.", node);
    if (returned.kind === "rejected") {
      issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message: returned.reason });
      continue;
    }
    const generator = input.generators.generator.get(node) !== undefined;
    values.set(node, Object.freeze({ async: !generator && input.ast.hasModifierKind(node, "async"), returnCarrier: returned.type, generator }));
  }
  return Object.freeze({ records: createCsharpCallableDeclarationRecords(values), issues: Object.freeze(issues) });
}
