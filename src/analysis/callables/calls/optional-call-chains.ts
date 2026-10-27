import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations.js";
import type { CsharpNativeDemandAnalysis } from "../../../target-model/records/native-demand.js";
import type { CsharpOptionalCallChain, CsharpOptionalCallStep } from "../../../target-model/records/optional-call-chains.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { createCsharpOptionalCallChainRecords } from "../../program/records/optional-call-chains.js";

export function analyzeCsharpOptionalCallChains(ast: AstReader, nodes: readonly Node[], operations: CsharpTargetOperationClassifications,
  demand: CsharpNativeDemandAnalysis, admitted: (node: Node) => boolean) {
  const values = new Map<Node, CsharpOptionalCallChain>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  for (const node of nodes) {
    if (!admitted(node) || !ast.is.IsCallExpression(node)) continue;
    const steps: CsharpOptionalCallStep[] = [];
    const seen = new Set<Node>();
    let current = node;
    let invalid = false;
    for (;;) {
      if (seen.has(current)) failTargetAnalysisInvariant("tsonic-csharp", "A checked optional-call chain cannot contain its own source receiver.", current);
      seen.add(current);
      const classification = operations.selectedCall.get(current);
      const selected = classification?.optionalReceiver ?? classification?.optionalCallee;
      if (classification === undefined || selected === undefined) break;
      const receiver = classification.optionalReceiver;
      if (receiver !== undefined && ((receiver.conversion === undefined) !== (receiver.parameterType === undefined))) {
        refuse(current, "Optional receiver requires its exact sealed by-value parameter conversion.");
        invalid = true;
        break;
      }
      steps.push({ node: current, expression: selected.expression, callee: classification.source?.sourceCallee.expression,
        storage: selected.storage, type: selected.type, guard: selected.guard,
        argument: receiver?.parameterType === undefined || receiver.conversion === undefined ? undefined :
          Object.freeze({ type: receiver.parameterType, conversion: receiver.conversion }) });
      current = selected.expression;
      if (!ast.is.IsCallExpression(current)) break;
    }
    if (invalid) continue;
    const first = operations.selectedCall.get(node);
    if (steps.length === 1 && first?.form.optionalReceiverRouting === "call" || !steps.some(step => step.guard)) {
      values.set(node, { kind: "direct" }); continue;
    }
    if (steps[steps.length - 1]?.guard !== true) {
      refuse(node, "Optional-call lowering requires the originating receiver guard in its exact selected call chain."); continue;
    }
    const result = first?.selectedResultType;
    if (result === undefined) { refuse(node, "Optional receiver requires its exact native storage and present-value relation."); continue; }
    steps.reverse();
    let actual = demand.nativeUse.expression(current)?.use;
    for (const step of steps) {
      // Every link of an optional chain is typed at its lifted storage; the chain narrows it to the present value.
      if (actual === undefined || actual.kind === "erased" || !targetTypeRefEquals(actual.carrier, step.storage)) {
        refuse(step.node, "Optional receiver requires its exact native storage and present-value relation."); invalid = true; break;
      }
      actual = demand.nativeUse.expression(step.node)?.use;
    }
    if (!invalid) values.set(node, { kind: "guarded", receiver: current, result, steps: Object.freeze(steps.map(step => Object.freeze(step))) });
  }
  return Object.freeze({ records: createCsharpOptionalCallChainRecords(values), issues: Object.freeze(issues) });
}
