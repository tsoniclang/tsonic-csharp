import type { AstReader, Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import type { CsharpValueReadClassifications } from "../../target-model/records/conversions.js";
import type { CsharpExactLiteralSelectionIndex } from "../../target-model/conversions/exact-literals.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";
import { isCsharpJsValueTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { createCsharpJsValueBoxingProducer } from "../program/records/js-value-boxing.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";

export function analyzeCsharpJsValueBoxing(input: { readonly ast: AstReader; readonly demand: CsharpNativeDemandAnalysis;
  readonly values: CsharpValueReadClassifications; readonly exact: CsharpExactLiteralSelectionIndex;
  readonly boxSites: readonly { readonly node: Node; readonly carrier: TargetTypeRef }[] }) {
  const producer = createCsharpJsValueBoxingProducer();
  const issues: TargetDiagnostic[] = [];
  const requests = new Map<Node, Map<string, TargetTypeRef>>();
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
  }
  // Conversions inside adapters, structural forwarding and class dispatch box values anchored at their declaration.
  for (const site of input.boxSites) request(site.node, site.carrier);
  for (const [node, carriers] of requests) for (const carrier of carriers.values()) {
    if (isCsharpJsValueTargetType(carrier)) { producer.publish(node, carrier, { kind: "identity" }); continue; }
    const exact = input.exact.exactLiteral.get(node, carrier);
    if (exact?.kind === "rejected") continue;
    if (exact?.kind === "resolved") { producer.publish(node, carrier, { kind: "literal", recipe: exact.recipe }); continue; }
    if (carrier.kind === "source-primitive" && (input.ast.is.IsNumericLiteral(node) || input.ast.is.IsPrefixUnaryExpression(node))) {
      if (!selectCsharpTypeEmission({ carrier })) {
        issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node,
          message: "A source primitive entering the closed JS-value carrier requires its exact renderable C# representation." }); continue;
      }
      producer.publish(node, carrier, { kind: "cast", carrier });
    } else producer.publish(node, carrier, { kind: "wrap" });
  }
  return Object.freeze({ records: producer.seal(), issues: Object.freeze(issues) });
}
