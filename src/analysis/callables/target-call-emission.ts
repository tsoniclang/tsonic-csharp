import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../target-model/records/operations.js";
import type { CsharpTargetArgumentRecords } from "../../target-model/records/target-arguments.js";
import type { CsharpSourceCallEmissionRecords } from "../../target-model/records/source-call-emission.js";
import type { CsharpOptionalCallChainRecords } from "../../target-model/records/optional-call-chains.js";
import type { CsharpObjectShapeDemand } from "../../target-model/records/object-shape-demand.js";
import type { CsharpNativeDemandAnalysis } from "../../target-model/records/native-demand.js";
import type { CsharpTargetCallEmission } from "../../target-model/records/target-call-emission.js";
import { selectCsharpTargetCallEmission } from "../../policy/operations/members/target-call-emission.js";
import { createCsharpTargetCallEmissionRecords } from "../program/records/target-call-emission.js";
import type { CsharpNativeUseRecords } from "../../target-model/records/native-demand.js";

export function analyzeCsharpTargetCallEmission(input: { readonly nodes: readonly Node[]; readonly admitted: (node: Node) => boolean;
  readonly operations: CsharpTargetOperationClassifications; readonly arguments: CsharpTargetArgumentRecords;
  readonly sources: CsharpSourceCallEmissionRecords; readonly optional: CsharpOptionalCallChainRecords;
  readonly shapes: CsharpObjectShapeDemand; readonly demand: CsharpNativeDemandAnalysis;
  readonly expressions: Pick<CsharpNativeUseRecords, "nativeExpression"> }) {
  const values = new Map<Node, CsharpTargetCallEmission>();
  const issues: TargetDiagnostic[] = [];
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const selected = input.operations.selectedCall.get(node)?.target;
    if (selected?.kind !== "resolved") continue;
    const arguments_ = input.arguments.targetArgumentsEmission.get(node);
    const optional = input.sources.callOptional.get(node);
    if (arguments_ === undefined || optional === undefined) { refuse(node, "Selected native call requires its exact physical argument and optional-receiver contract."); continue; }
    const passing = arguments_.groups.map(group => {
      if (group.collect) return false;
      const index = group.arguments[0]?.index;
      const operand = index === undefined ? undefined : arguments_.operands[index];
      if (operand?.kind !== "argument") return false;
      const emission = input.arguments.callArgumentEmission.get(operand.expression, operand.parameter, operand.form, operand.mapping);
      return emission?.kind === "plain" && operand.parameter.passingMode !== undefined && operand.parameter.passingMode !== "by-value";
    });
    const request = selected.call.targetMember.csharpArtifactRequirements?.find(requirement => requirement.kind === "object-shape-projection");
    const subject = request?.source.kind === "receiver" ? selected.source.sourceReceiver?.expression :
      request?.source.kind === "argument" ? selected.source.sourceArguments[request.source.index]?.expression : undefined;
    const projection = subject === undefined ? undefined : input.shapes.projection(subject);
    if (request !== undefined && projection === undefined) failTargetAnalysisInvariant("tsonic-csharp", "A participating selected call requires its admitted object-shape projection.", node);
    const use = input.demand.nativeUse.expression(node)?.use;
    const result = selectCsharpTargetCallEmission(Object.freeze({ source: selected.source, selection: selected.call, argumentPassing: Object.freeze(passing),
      optional: optional.optional && input.optional.optionalCallChain.get(node)?.kind !== "guarded", projection,
      liftedResult: use === undefined || use.kind === "erased" ? undefined : use.carrier }));
    if (result.kind === "rejected") refuse(node, result.reason);
    else {
      const truncation = input.expressions.nativeExpression.get(node)?.integerTruncation;
      values.set(node, truncation === undefined ? result.value : Object.freeze({ ...result.value,
        result: truncation.target, invocation: Object.freeze({ kind: "integer-truncation", ...truncation }) }));
    }
  }
  return Object.freeze({ records: createCsharpTargetCallEmissionRecords(values), issues: Object.freeze(issues) });
}
