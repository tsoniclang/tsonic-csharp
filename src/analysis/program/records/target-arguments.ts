import type { Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";
import type { CsharpProviderArgumentMapping } from "../../../target-model/records/members.js";
import type { CsharpCallArgumentForm, CsharpCallArgumentEmission, CsharpTargetArgumentsEmission, CsharpTargetArgumentRecords } from "../../../target-model/records/target-arguments.js";

export function createCsharpTargetArgumentProducer() {
  let open = true;
  const arguments_ = new WeakMap<Node, Map<CsharpTargetParameter, Map<CsharpCallArgumentForm, Map<CsharpProviderArgumentMapping | undefined, CsharpCallArgumentEmission>>>>();
  const calls = new WeakMap<Node, CsharpTargetArgumentsEmission>();
  const records: CsharpTargetArgumentRecords = Object.freeze({
    callArgumentEmission: Object.freeze({ get: (expression: Node, parameter: CsharpTargetParameter, form: CsharpCallArgumentForm, mapping: CsharpProviderArgumentMapping | undefined) =>
      arguments_.get(expression)?.get(parameter)?.get(form)?.get(mapping) }),
    targetArgumentsEmission: Object.freeze({ get: (node: Node) => calls.get(node) }) });
  return Object.freeze({ records,
    argument(expression: Node, parameter: CsharpTargetParameter, form: CsharpCallArgumentForm, mapping: CsharpProviderArgumentMapping | undefined, value: CsharpCallArgumentEmission): void {
      if (!open || records.callArgumentEmission.get(expression, parameter, form, mapping) !== undefined)
        failTargetAnalysisInvariant("tsonic-csharp", "A native call argument has one pre-seal parameter-specific admission.", expression);
      const parameters = arguments_.get(expression) ?? new Map<CsharpTargetParameter, Map<CsharpCallArgumentForm, Map<CsharpProviderArgumentMapping | undefined, CsharpCallArgumentEmission>>>();
      const forms = parameters.get(parameter) ?? new Map<CsharpCallArgumentForm, Map<CsharpProviderArgumentMapping | undefined, CsharpCallArgumentEmission>>();
      const mappings = forms.get(form) ?? new Map<CsharpProviderArgumentMapping | undefined, CsharpCallArgumentEmission>();
      mappings.set(mapping, Object.freeze(value)); forms.set(form, mappings); parameters.set(parameter, forms); arguments_.set(expression, parameters);
    },
    call(node: Node, value: CsharpTargetArgumentsEmission): void {
      if (!open || calls.has(node)) failTargetAnalysisInvariant("tsonic-csharp", "A native call has one pre-seal positional argument plan.", node);
      calls.set(node, Object.freeze(value));
    },
    seal(): CsharpTargetArgumentRecords {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "Native call arguments seal exactly once.");
      open = false;
      return records;
    } });
}
