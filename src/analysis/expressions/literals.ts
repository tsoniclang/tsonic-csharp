import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import type { CsharpNativeDemandAnalysis } from "../operations/native-demand-model.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import { csharpStringTargetType, csharpBigIntegerTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";

export function analyzeCsharpLiteralAdmission(input: { readonly ast: AstReader; readonly demand: CsharpNativeDemandAnalysis;
  readonly literals: SourceLiteralIndex; readonly exact: CsharpExactLiteralSelectionIndex; readonly values: CsharpValueReadClassifications }): readonly TargetDiagnostic[] {
  const issues: TargetDiagnostic[] = [];
  const rejected = new Set<Node>();
  const refuse = (node: Node, message: string): void => {
    if (rejected.has(node)) return;
    rejected.add(node);
    issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message });
  };
  for (const { use } of input.demand.entries) {
    if (use.kind === "erased") continue;
    const node = use.expression;
    const target = use.kind === "converted" ? use.target : use.carrier;
    const exact = input.exact.exactLiteral.get(node, target);
    if (exact?.kind === "rejected") { refuse(node, exact.reason); continue; }
    if (use.literal !== undefined) continue;
    const carrier = input.values.valueRead.get(node)?.value;
    if (input.ast.is.IsNumericLiteral(node) && input.literals.literalValue.get(node)?.number === undefined)
      refuse(node, "Numeric literal emission requires parseable finite source literal text from TSTS.");
    if (input.ast.is.IsBigIntLiteral(node)) {
      if (input.literals.literalValue.get(node)?.integer === undefined)
        refuse(node, "BigInt literal emission requires parseable source literal text from TSTS.");
      else if (!targetTypeRefEquals(carrier, csharpBigIntegerTargetType()))
        refuse(node, "BigInt literal emission requires a finalized System.Numerics.BigInteger runtime carrier fact.");
    }
    if ((input.ast.is.IsTemplateExpression(node) || input.ast.is.IsNoSubstitutionTemplateLiteral(node)) &&
      !targetTypeRefEquals(carrier, csharpStringTargetType())) refuse(node,
        `${input.ast.is.IsTemplateExpression(node) ? "Template string emission" : "No-substitution template literal emission"} requires a finalized System.String runtime carrier fact before C# emission.`);
  }
  return Object.freeze(issues);
}
