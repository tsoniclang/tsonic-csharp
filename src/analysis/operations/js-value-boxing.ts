import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native/native-demand.js";
import type { CsharpConversionClassifications, CsharpValueReadClassifications } from "../../target-model/records/operations/conversions.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { createCsharpJsValueBoxingProducer } from "../program/records/types/js-value-boxing.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";

export function analyzeCsharpJsValueBoxing(input: { readonly ast: AstReader; readonly conversions: Pick<CsharpConversionClassifications, "expressionConversion">;
  readonly demand: CsharpNativeDemandAnalysis; readonly values: CsharpValueReadClassifications;
  readonly exact: CsharpExactLiteralSelectionIndex;
  readonly boxSites: readonly { readonly node: Node; readonly carrier: TargetTypeRef }[] }) {
  const producer = createCsharpJsValueBoxingProducer();
  const issues: TargetDiagnostic[] = [];
  const requests = new Map<Node, Map<string, TargetTypeRef>>();
  // A3: the sealed conversion of each converted use carries the Host admission of that use (read once, by
  // analysis/conversions, before any cached classification). At an exact number erasure use the value is boxed as its
  // float64 result; its int64 carrier is never boxed there, so that use has no int64 plan (a planner path that tried to
  // box it would meet the missing-plan invariant instead of a silent long box).
  const erasures = new Map<Node, Extract<CsharpConversionSelection, { readonly kind: "exact-number-erasure" }>>();
  for (const { use } of input.demand.entries) {
    if (use.kind !== "converted" || use.completion.kind !== "value") continue;
    const source = use.input.kind === "value" ? use.input.type : use.carrier;
    const selection = input.conversions.expressionConversion.get(use.expression, source, use.target, use.mode)?.selection;
    if (selection?.kind === "exact-number-erasure") erasures.set(use.expression, selection);
  }
  const request = (node: Node, carrier: TargetTypeRef | undefined): void => {
    if (carrier === undefined) return;
    const rows = requests.get(node) ?? new Map<string, TargetTypeRef>();
    rows.set(targetTypeRefKey(carrier), carrier);
    requests.set(node, rows);
  };
  for (const { use } of input.demand.entries) {
    if (use.kind === "erased") continue;
    request(use.expression, use.carrier);
    if (use.kind === "converted") request(use.expression, use.target);
    const read = input.values.valueRead.get(use.expression);
    request(use.expression, read?.source);
    request(use.expression, read?.value);
    request(use.expression, erasures.get(use.expression)?.result);
  }
  // Conversions inside adapters, structural forwarding and class dispatch box values anchored at their declaration.
  for (const site of input.boxSites) request(site.node, site.carrier);
  for (const [node, carriers] of requests) for (const carrier of carriers.values()) {
    const erasure = erasures.get(node);
    if (erasure !== undefined && targetTypeRefEquals(carrier, erasure.input)) continue;
    if (isCsharpJsValueTargetType(carrier)) { producer.publish(node, carrier, { kind: "identity" }); continue; }
    // At an erasure use, the float64 carrier reads the literal recipe requested for the erasure destination.
    const exact = input.exact.exactLiteral.get(node, carrier);
    if (exact?.kind === "rejected") continue;
    if (exact?.kind === "resolved") { producer.publish(node, carrier, { kind: "literal", recipe: exact.recipe }); continue; }
    if (carrier.kind === "source-primitive" && (input.ast.is.IsNumericLiteral(node) || input.ast.is.IsPrefixUnaryExpression(node))) {
      if (!selectCsharpTypeEmission({ carrier })) {
        issues.push({ code: "CSHARP_JS_VALUE_PRIMITIVE_NOT_RENDERABLE", category: "error", source: "tsonic-csharp", sourceNode: node,
          message: "A source primitive entering the closed JS-value carrier requires its exact renderable C# representation." }); continue;
      }
      producer.publish(node, carrier, { kind: "cast", carrier });
    } else producer.publish(node, carrier, { kind: "wrap" });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
