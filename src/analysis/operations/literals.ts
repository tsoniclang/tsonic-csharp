import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import { csharpStringTargetType, csharpBigIntegerTargetType, getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";
import { createCsharpLiteralEmissionProducer } from "../program/records/literal-emission.js";
import type { CsharpLiteralEmission } from "../../target-model/records/literal-emission.js";

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
    // An explicit conversion (`1e40 as float32`) keeps the literal at its source type and casts it, as C# does; only an
    // implicit use must be exactly representable in its target.
    if (exact?.kind === "rejected" && !(use.kind === "converted" && use.mode === "explicit")) { refuse(node, exact.reason); continue; }
    if (use.literal !== undefined) continue;
    const read = input.values.valueRead.get(node);
    const carrier = read?.value;
    if (!published.has(node) && input.ast.is.IsNumericLiteral(node)) {
      const source = read?.source;
      const selected = input.exact.exactLiteral.get(node, source);
      const number = input.literals.literalValue.get(node)?.number;
      // A literal consumed as float64 through an exact literal conversion keeps its source token, so it is emitted as a
      // C# double literal; an integer token would otherwise stay a C# int literal (`0` instead of `0D`).
      const consumed = use.kind === "converted" ? getCsharpNullableElementTargetType(use.target) ?? use.target : undefined;
      const consumedFloat64 = consumed?.kind === "source-primitive" && consumed.name === "float64" &&
        input.exact.exactLiteral.get(node, use.kind === "converted" ? use.target : undefined)?.kind === "source-representation";
      const castFloat64 = use.kind === "converted" && use.mode === "explicit" && use.input.kind === "value" &&
        use.input.type.kind === "source-primitive" && use.input.type.name === "float64";
      if ((source?.kind === "source-primitive" && source.name === "float64" || consumedFloat64 || castFloat64) && number !== undefined) {
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
      else {
        let storage: Extract<CsharpLiteralEmission, { readonly kind: "bigint" }>["storage"];
        let negative = false;
        if (value >= -(1n << 63n) && value < (1n << 63n)) storage = Object.freeze({ kind: "int64", value });
        else {
          negative = value < 0n;
          let magnitude = negative ? -value : value;
          if (magnitude < (1n << 64n)) storage = Object.freeze({ kind: "uint64", value: magnitude });
          else {
            const bytes: number[] = [];
            while (magnitude !== 0n) { bytes.push(Number(magnitude & 255n)); magnitude >>= 8n; }
            storage = Object.freeze({ kind: "bytes", bytes: Object.freeze(bytes) });
          }
        }
        producer.publish(node, { kind: "bigint", carrier, negative, storage }); published.add(node);
      }
    }
    if ((input.ast.is.IsTemplateExpression(node) || input.ast.is.IsNoSubstitutionTemplateLiteral(node)) &&
      (carrier === undefined || !targetTypeRefEquals(carrier, csharpStringTargetType()))) refuse(node,
        `${input.ast.is.IsTemplateExpression(node) ? "Template string emission" : "No-substitution template literal emission"} requires a finalized System.String runtime carrier fact before C# emission.`);
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
