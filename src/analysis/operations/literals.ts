import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import { csharpStringTargetType, csharpBigIntegerTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";
import { createCsharpLiteralEmissionProducer } from "../program/records/literal-emission.js";

export function analyzeCsharpLiteralAdmission(input: { readonly ast: AstReader; readonly demand: CsharpNativeDemandAnalysis;
  readonly literals: SourceLiteralIndex; readonly exact: CsharpExactLiteralSelectionIndex; readonly values: CsharpValueReadClassifications }) {
  const issues: TargetDiagnostic[] = [];
  const rejected = new Set<Node>();
  const published = new Set<Node>();
  const producer = createCsharpLiteralEmissionProducer();
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
    const read = input.values.valueRead.get(node);
    const carrier = read?.value;
    if (!published.has(node) && input.ast.is.IsNumericLiteral(node)) {
      const source = read?.source;
      const selected = input.exact.exactLiteral.get(node, source);
      const number = input.literals.literalValue.get(node)?.number;
      if (source?.kind === "source-primitive" && source.name === "float64" && number !== undefined) {
        producer.publish(node, { kind: "float64", value: number }); published.add(node);
      } else if (selected?.kind === "resolved") {
        producer.publish(node, { kind: "exact", recipe: selected.recipe }); published.add(node);
      } else refuse(node, selected?.kind === "rejected" ? selected.reason : "Numeric literal emission requires parseable finite source literal text from TSTS.");
    }
    if (!published.has(node) && input.ast.is.IsBigIntLiteral(node)) {
      const value = input.literals.literalValue.get(node)?.integer;
      if (value === undefined)
        refuse(node, "BigInt literal emission requires parseable source literal text from TSTS.");
      else if (carrier === undefined || !targetTypeRefEquals(carrier, csharpBigIntegerTargetType()))
        refuse(node, "BigInt literal emission requires a finalized System.Numerics.BigInteger runtime carrier fact.");
      else { producer.publish(node, { kind: "bigint", carrier, decimal: value.toString(10) }); published.add(node); }
    }
    if ((input.ast.is.IsTemplateExpression(node) || input.ast.is.IsNoSubstitutionTemplateLiteral(node)) &&
      (carrier === undefined || !targetTypeRefEquals(carrier, csharpStringTargetType()))) refuse(node,
        `${input.ast.is.IsTemplateExpression(node) ? "Template string emission" : "No-substitution template literal emission"} requires a finalized System.String runtime carrier fact before C# emission.`);
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
