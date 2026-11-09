import type { Node } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";
import type { CsharpProviderArgumentMapping, CsharpSelectedTargetCall } from "../../../target-model/records/objects/members.js";
import type { SourceApplication } from "@tsonic/target-api/source";
import type { CsharpCallArgumentForm, CsharpCallArgumentEmission, CsharpTargetArgumentOperand, CsharpTargetArgumentsEmission, CsharpCallArgumentEmissionGroup } from "../../../target-model/records/calls/target-arguments.js";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpConversionClassifications } from "../../../target-model/records/operations/conversions.js";
import { admitCsharpAuthoredArguments, type CsharpNativeBoundArgument } from "./authored-arguments.js";
import { csharpAbsenceTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpConversionIsApplicable } from "../../../policy/conversions/applicability.js";
import { forwardSourceRefusal } from "../../source-evidence/representations.js";
import type { CsharpNativeDemandAnalysis } from "../../../target-model/records/native/native-demand.js";
import { csharpTargetParameterValueType, getCsharpDelegateSignature, getCsharpJsArrayElementTargetType,
  csharpObjectTargetType, getCsharpNullableElementTargetType, targetTypeRefEquals } from "../../../target-model/types/index.js";
import { csharpArgumentVectorCallbackResultMatches } from "../../../policy/conversions/callable-completions.js";
import { selectCsharpTypeEmission } from "../../../policy/types/resolution/type-emission.js";
import { selectCsharpNativeParameterCompletion } from "../../../policy/operations/members/native-parameter-completion.js";
import { createCsharpTargetArgumentProducer } from "../../program/records/calls/target-arguments.js";
import type { CsharpNativeArgumentRequest } from "../../../target-model/records/calls/argument-passing.js";

export function analyzeCsharpTargetArguments(input: { readonly policy: CsharpPolicyContext; readonly nodes: readonly Node[];
  readonly operations: CsharpTargetOperationClassifications; readonly conversions: CsharpConversionClassifications;
  readonly demand: CsharpNativeDemandAnalysis; readonly admitted: (node: Node) => boolean }) {
  const producer = createCsharpTargetArgumentProducer();
  const issues: TargetDiagnostic[] = [];
  const requests: CsharpNativeArgumentRequest[] = [];
  const refuse = (node: Node, message: string): void => { issues.push({ code: "CSHARP_UNSUPPORTED_AST", category: "error", source: "tsonic-csharp", sourceNode: node, message }); };
  const prepareArgument = (expression: Node, parameter: CsharpTargetParameter, form: CsharpCallArgumentForm, mapping: CsharpProviderArgumentMapping | undefined): void => {
    if (producer.records.callArgumentEmission.get(expression, parameter, form, mapping) !== undefined) return;
    if (form === "spread-sequence" && !parameter.paramsArray) { refuse(expression, "Sequence-spread call arguments require an exact related C# params parameter."); return; }
    let value: CsharpCallArgumentEmission;
    if (parameter.csharpSourceArgumentAdapter?.kind === "native-binding") {
      const source = parameter.csharpSourceArgumentAdapter.sourceCallableType;
      const physical = getCsharpNullableElementTargetType(parameter.type) ?? parameter.type;
      if (form !== "value" || parameter.passingMode !== "by-value" || parameter.paramsArray === true ||
          getCsharpDelegateSignature(source) === undefined || !targetTypeRefEquals(physical, csharpObjectTargetType()) ||
          !selectCsharpTypeEmission({ carrier: source }) || !selectCsharpTypeEmission({ carrier: parameter.type })) {
        refuse(expression, "A nominal native binding requires its selected delegate and an object-valued physical parameter."); return;
      }
      value = { kind: "native-binding", source, target: parameter.type };
    } else if (parameter.csharpSourceArgumentAdapter !== undefined) {
      const adapter = parameter.csharpSourceArgumentAdapter;
      if (adapter.kind !== "ecmascript-argument-vector-callback" || form !== "value" || parameter.passingMode !== "by-value") {
        refuse(expression, "The selected ECMAScript callback adapter requires one ordinary by-value source argument."); return;
      }
      const use = input.demand.nativeUse.expression(expression)?.use;
      const source = use === undefined || use.kind === "erased" || use.completion.kind !== "value" ? undefined : use.completion.type;
      const sourceSignature = getCsharpDelegateSignature(source);
      const targetSignature = getCsharpDelegateSignature(parameter.type);
      const vector = targetSignature?.parameters[0];
      if (source === undefined || sourceSignature === undefined || targetSignature === undefined || targetSignature.parameters.length !== 1 || vector === undefined ||
        !csharpArgumentVectorCallbackResultMatches(sourceSignature.returnType, targetSignature.returnType) || sourceSignature.restParameterIndex !== undefined && sourceSignature.restParameterIndex !== sourceSignature.parameters.length - 1) {
        refuse(expression, "The selected ECMAScript callback adapter has no exact source-callable and target argument-vector contract."); return;
      }
      if (!selectCsharpTypeEmission({ carrier: source }) || !selectCsharpTypeEmission({ carrier: vector })) {
        refuse(expression, "The selected ECMAScript callback adapter contains an unrenderable callable or argument-vector type."); return;
      }
      const parameters: Extract<CsharpCallArgumentEmission, { readonly kind: "argument-vector" }>["parameters"][number][] = [];
      for (const [index, carrier] of sourceSignature.parameters.entries()) {
        const rest = sourceSignature.restParameterIndex === index;
        const type = rest ? getCsharpJsArrayElementTargetType(carrier) : carrier;
        if (type === undefined || !selectCsharpTypeEmission({ carrier: type })) {
          refuse(expression, rest ? "An ECMAScript callback rest parameter requires an exact JS-array element representation." : `ECMAScript callback parameter ${index} has no renderable target representation.`); return;
        }
        parameters.push(Object.freeze({ type, rest }));
      }
      value = { kind: "argument-vector", source, target: parameter.type, vector, parameters: Object.freeze(parameters) };
    } else {
      const target = csharpTargetParameterValueType(parameter, form);
      if (!selectCsharpTypeEmission({ carrier: target })) { refuse(expression, `Selected target parameter '${parameter.name}' has no renderable C# type.`); return; }
      if (mapping?.kind === "by-value" && (mapping.conversion.kind === "provider-argument-adapter" || mapping.conversion.kind === "lifted-provider-argument-adapter" || mapping.conversion.kind === "checked-native-integer")) {
        if (form !== "value" || parameter.passingMode !== "by-value") { refuse(expression, `Exact provider argument conversion '${mapping.conversion.kind}' requires an ordinary by-value source argument.`); return; }
        value = { kind: "convert", read: "expression", source: mapping.sourceType, target: mapping.targetType, conversion: mapping.conversion };
      } else if (mapping?.kind === "by-value" && mapping.conversion.kind === "delegate-adapter" && mapping.conversion.strategy !== "native-binding") {
        if (!selectCsharpTypeEmission({ carrier: mapping.sourceType })) { refuse(expression, "Exact provider delegate adaptation requires a renderable source callable carrier."); return; }
        value = { kind: "convert", read: "argument", source: mapping.sourceType, target: mapping.targetType, conversion: mapping.conversion };
      } else value = { kind: "plain", target };
    }
    if (value.kind === "plain") requests.push({ node: expression, target: value.target, passing: parameter.passingMode, parameter });
    else if (value.kind === "argument-vector" || value.kind === "native-binding" || value.read === "argument") requests.push({ node: expression, target: value.source, passing: "by-value", parameter: undefined });
    producer.argument(expression, parameter, form, mapping, value);
  };

  const argument = (expression: Node, parameter: CsharpTargetParameter, form: CsharpCallArgumentForm,
    mapping: CsharpProviderArgumentMapping | undefined): boolean => {
    const count = issues.length;
    prepareArgument(expression, parameter, form, mapping);
    return count === issues.length;
  };
  const suspends = (operand: CsharpTargetArgumentOperand): boolean => input.policy.facts.navigation.expressionEffects(
    operand.kind === "projection" ? operand.projection.source : operand.kind === "sequence" ? operand.sequence.expression : operand.expression,
  ).suspends;
  const nativeCall = (node: Node, source: SourceApplication, selection: CsharpSelectedTargetCall): void => {
    if (source.argumentDisposition === "skip") return;
    const bindings: CsharpNativeBoundArgument[] = [];
    const sequences = new Map(selection.sequenceArguments?.map(sequence => [sequence.sourceArgumentIndex, sequence]));
    if (sequences.size !== (selection.sequenceArguments?.length ?? 0)) {
      refuse(node, "A selected Native rest sequence requires one exact authored Source binding."); return;
    }
    for (const selected of selection.arguments) {
      const matches = source.arguments.filter(place => place.sourceArgumentIndex === selected.sourceArgumentIndex &&
        place.effectiveArgumentIndex === selected.effectiveArgumentIndex && place.sourceForm === selected.sourceForm &&
        place.spreadElementIndex === selected.spreadElementIndex);
      if (matches.length !== 1) {
        refuse(node, "A selected Native parameter requires exactly its original Source effective argument place."); return;
      }
      const mapping = selection.origin === "provider"
        ? selection.argumentMappings.find(candidate => candidate.effectiveArgumentIndex === selected.effectiveArgumentIndex) : undefined;
      bindings.push(Object.freeze({ place: matches[0]!, parameter: selected.targetParameter,
        parameterIndex: selected.targetParameterIndex, mapping,
        ...(selected.projection === undefined ? {} : { projection: selected.projection }),
        ...(sequences.get(selected.sourceArgumentIndex) === undefined ? {} : { sequence: sequences.get(selected.sourceArgumentIndex)! }) }));
    }
    const prefix: CsharpTargetArgumentOperand[] = [];
    const parameters: CsharpTargetParameter[] = [];
    const positions: { readonly binding: number; readonly parameterIndex: number; readonly sequence: boolean }[] = [];
    if (selection.receiver.kind === "target-parameter") {
      const parameter = selection.targetMember.parameters[selection.receiver.targetParameterIndex];
      if (source.receiver.kind !== "value" || parameter === undefined) {
        refuse(node, "A Native receiver parameter requires its exact original Source value receiver and physical parameter."); return;
      }
      if (!argument(source.receiver.occurrence, parameter, "value", undefined)) return;
      prefix.push(Object.freeze({ kind: "argument", binding: 0, expression: source.receiver.occurrence,
        parameter, form: "value", mapping: undefined }));
      parameters.push(parameter);
      positions.push({ binding: 0, parameterIndex: selection.receiver.targetParameterIndex, sequence: false });
    }
    const offset = parameters.length;
    const authored = admitCsharpAuthoredArguments({ source, policy: input.policy, demand: input.demand,
      bindings, bindingOffset: offset, issues, admit: argument });
    if (authored === undefined) return;
    for (const [index, binding] of bindings.entries()) {
      parameters.push(binding.parameter);
      positions.push({ binding: index + offset, parameterIndex: binding.parameterIndex,
        sequence: binding.place.sourceForm === "spread-sequence" });
    }
    const ordered = [...positions].sort((left, right) => left.parameterIndex - right.parameterIndex || left.binding - right.binding);
    const groups: CsharpCallArgumentEmissionGroup[] = [];
    let selectedIndex = 0;
    for (const [parameterIndex, parameter] of selection.targetMember.parameters.entries()) {
      const entries: typeof ordered = [];
      while (selectedIndex < ordered.length && ordered[selectedIndex]!.parameterIndex === parameterIndex) {
        entries.push(ordered[selectedIndex++]!);
      }
      if (entries.length === 0) {
        const completion = selectCsharpNativeParameterCompletion(parameter);
        if (completion.kind === "rejected") { refuse(node, completion.reason); return; }
        if (!selectCsharpTypeEmission({ carrier: completion.type })) {
          refuse(node, "A Native-only completion requires its exact renderable physical parameter type."); return;
        }
        groups.push(completion.kind === "params" ? Object.freeze({ kind: "collect", arguments: Object.freeze([]) }) : completion);
      } else if (parameter.paramsArray === true) {
        if (selectCsharpNativeParameterCompletion(parameter).kind !== "params") {
          refuse(node, "Native params arguments require their exact physical vector-array parameter."); return;
        }
        groups.push(Object.freeze({ kind: "collect", arguments: Object.freeze(entries.map(entry =>
          Object.freeze({ index: entry.binding, spread: entry.sequence }))) }));
      } else if (entries.length === 1) groups.push(Object.freeze({ kind: "value", index: entries[0]!.binding }));
      else { refuse(node, "Every non-params Native physical slot requires exactly one authored binding."); return; }
    }
    if (selectedIndex !== ordered.length) { refuse(node, "A selected Native argument has no original physical parameter slot."); return; }
    const operands = Object.freeze([...prefix, ...authored]);
    producer.call(node, { operands, suspends: Object.freeze(operands.map(suspends)), bindings: Object.freeze(parameters),
      groups: Object.freeze(groups), reordered: ordered.some((entry, index) => entry.binding !== index) });
  };
  const sourceCall = (node: Node, source: SourceApplication,
    classification: import("../../../target-model/records/operations/operations.js").CsharpSourceCallArgumentClassification): void => {
    if (source.argumentDisposition === "skip") return;
    const grouping = classification.sourceArgumentGrouping;
    if (grouping?.kind === "source-refused") { issues.push(forwardSourceRefusal(grouping.refusal)); return; }
    if (grouping?.kind !== "grouped") {
      refuse(node, "A Source-owned invocation requires its complete selected Native parameter binding."); return;
    }
    const bindings = grouping.arguments.map(entry => Object.freeze({ place: entry.binding, parameter: entry.parameter,
      parameterIndex: entry.parameterIndex, mapping: undefined }));
    const operands = admitCsharpAuthoredArguments({ source, policy: input.policy, demand: input.demand,
      bindings, bindingOffset: 0, issues, admit: argument });
    if (operands === undefined) return;
    const groups: CsharpCallArgumentEmissionGroup[] = [];
    for (const group of grouping.groups) {
      if (group.collect) {
        groups.push(Object.freeze({ kind: "collect", arguments: Object.freeze([...group.arguments]) }));
      } else if (group.arguments.length === 1) {
        groups.push(Object.freeze({ kind: "value", index: group.arguments[0]!.index }));
      } else {
        const conversion = input.conversions.conversion.get(csharpAbsenceTargetType(), group.type, "implicit");
        if (conversion === undefined || !csharpConversionIsApplicable(conversion, "implicit")) {
          refuse(node, "An omitted Source-owned parameter has no admitted Native representation of the single absence state."); return;
        }
        groups.push(Object.freeze({ kind: "absence", type: group.type, conversion,
          literal: getCsharpNullableElementTargetType(group.type) !== undefined }));
      }
    }
    producer.call(node, { operands, suspends: Object.freeze(operands.map(suspends)), bindings: Object.freeze(bindings.map(binding => binding.parameter)),
      groups: Object.freeze(groups), reordered: false });
  };
  for (const node of input.nodes) {
    if (!input.admitted(node)) continue;
    const classification = input.operations.selectedCall.get(node) ?? input.operations.selectedConstruction.get(node);
    const selected = classification?.target;
    if (selected?.kind === "resolved") nativeCall(node, selected.source, selected.call);
    else if (selected?.kind === "source-owned" && classification !== undefined) sourceCall(node, selected.source, classification);
  }
  return Object.freeze({ records: producer.seal(), requests: Object.freeze(requests), issues: Object.freeze(issues) });
}
