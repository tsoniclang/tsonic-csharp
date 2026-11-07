import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { SourceLiteralIndex } from "@tsonic/target-api/source";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import { csharpStringTargetType, csharpBigIntegerTargetType, targetTypeRefEquals } from "../../target-model/types/index.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { createCsharpLiteralEmissionProducer } from "../program/records/operations/literal-emission.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

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
    if (use.literal !== undefined) {
      if (!published.has(node) && input.ast.is.IsNumericLiteral(node) && use.literal.kind === "float" &&
        use.literal.precision === "float64" && csharpTargetTypedIntegralToken(input.ast, node, emittedDestination(input.demand, node))) {
        producer.publish(node, { kind: "exact", recipe: use.literal, integralToken: true });
        published.add(node);
      }
      continue;
    }
    const read = input.values.valueRead.get(node);
    const carrier = read?.value;
    if ((input.ast.is.IsNumericLiteral(node) || input.ast.is.IsBigIntLiteral(node)) && carrier === undefined)
      failTargetAnalysisInvariant("tsonic-csharp", "Literal emission requires its completed physical value.", node);
    if (!published.has(node) && input.ast.is.IsNumericLiteral(node)) {
      const selected = input.exact.exactLiteral.get(node, carrier);
      const number = input.literals.literalValue.get(node)?.number;
      const castFloat64 = use.kind === "converted" && use.mode === "explicit" && use.input.kind === "value" &&
        use.input.type.kind === "source-primitive" && use.input.type.name === "float64";
      if ((carrier?.kind === "source-primitive" && carrier.name === "float64" || castFloat64) && number !== undefined) {
        // K-2448: the decision reads the ONE recorded emission context of this expression, never demand-entry order.
        // A staged construction publishes its physical entry first; the consuming (possibly broad) use is the emission.
        const integralToken = !castFloat64 && csharpTargetTypedIntegralToken(input.ast, node, emittedDestination(input.demand, node));
        producer.publish(node, { kind: "float64", value: number, ...(integralToken ? { integralToken: true as const } : {}) });
        published.add(node);
      } else if (selected?.kind === "resolved") {
        const integralToken = csharpTargetTypedIntegralToken(input.ast, node, emittedDestination(input.demand, node));
        producer.publish(node, { kind: "exact", recipe: selected.recipe, ...(integralToken ? { integralToken: true as const } : {}) });
        published.add(node);
      } else refuse(node, selected?.kind === "rejected" ? selected.reason : "Numeric literal emission requires parseable finite source literal text from TSTS.");
    }
    if (!published.has(node) && input.ast.is.IsBigIntLiteral(node)) {
      const selected = input.exact.exactLiteral.get(node, carrier);
      if (selected?.kind === "resolved") {
        producer.publish(node, { kind: "exact", recipe: selected.recipe }); published.add(node); continue;
      }
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

function emittedDestination(demand: CsharpNativeDemandAnalysis, node: Node): TargetTypeRef | undefined {
  const emitted = demand.nativeUse.expression(node)?.use;
  if (emitted === undefined || emitted.kind === "erased") return undefined;
  return emitted.kind === "converted" ? emitted.target : emitted.carrier;
}

// Decision 4 (maintainer, C-2314: restore 28j'): an authored decimal integer token, |value| <= 2^53, whose use converts to
// exactly double (not a broad object/unknown/generic or nullable carrier) is printed as written where C# target-types the
// literal: a declaration or field initializer, an assignment's right side, or a returned value. C# then converts the
// integer constant to the destination double exactly. Everywhere else the token keeps D, so its own C# type never takes
// part in overload resolution, inference or boxing.
function csharpTargetTypedIntegralToken(ast: AstReader, node: Node, destination: TargetTypeRef | undefined): boolean {
  if (destination?.kind !== "source-primitive" || destination.name !== "float64") return false;
  const text = ast.text(node);
  if (!/^[0-9]+$/u.test(text) || BigInt(text) > 9007199254740992n) return false;
  const parent = ast.parent(node);
  if (parent === undefined) return false;
  if (ast.is.IsVariableDeclaration(parent)) return ast.as.AsVariableDeclaration(parent)?.Initializer === node;
  if (ast.is.IsPropertyDeclaration(parent)) return ast.as.AsPropertyDeclaration(parent)?.Initializer === node;
  if (ast.is.IsPropertyAssignment(parent)) return ast.as.AsPropertyAssignment(parent)?.Initializer === node;
  if (ast.is.IsReturnStatement(parent)) return true;
  return ast.is.IsBinaryExpression(parent) && ast.operatorKindName(parent) === "KindEqualsToken" &&
    ast.as.AsBinaryExpression(parent)?.Right === node;
}
