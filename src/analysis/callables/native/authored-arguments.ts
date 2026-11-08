import type { Node } from "@tsonic/tsts";
import type { SourceApplication, SourceArgumentPlace } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant, type TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { TargetTypeRef } from "../../../target-model/types/native-type-data.js";
import type { CsharpTargetParameter } from "../../../target-model/types/model.js";
import type { CsharpCallArgumentProjection, CsharpProviderArgumentMapping } from "../../../target-model/records/objects/members.js";
import type { CsharpRestSequence } from "../../../target-model/records/objects/rest-sequences.js";
import type { CsharpExpandedCallArgument, CsharpTargetArgumentOperand } from "../../../target-model/records/calls/target-arguments.js";
import type { CsharpNativeDemandAnalysis } from "../../../target-model/records/native/native-demand.js";
import { csharpTargetParameterValueType } from "../../../target-model/types/member-facts.js";
import { csharpTupleElementMemberName, getCsharpReadOnlyIndexableCollectionElementTargetType } from "../../../target-model/types/carriers/collections.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";
import { selectCsharpScalarConversion } from "../../../policy/conversions/scalars.js";
import { admitCsharpSourceConversion } from "../../../policy/conversions/source-admission.js";
import { csharpConversionIsApplicable } from "../../../policy/conversions/applicability.js";
import { csharpRepresentationDiagnostic, forwardSourceRefusal } from "../../source-evidence/representations.js";

export interface CsharpNativeBoundArgument {
  readonly place: SourceArgumentPlace;
  readonly parameter: CsharpTargetParameter;
  readonly parameterIndex: number;
  readonly mapping: CsharpProviderArgumentMapping | undefined;
  readonly projection?: CsharpCallArgumentProjection;
  readonly sequence?: CsharpRestSequence;
}

export function admitCsharpAuthoredArguments(input: {
  readonly source: SourceApplication;
  readonly policy: CsharpPolicyContext;
  readonly demand: CsharpNativeDemandAnalysis;
  readonly bindings: readonly CsharpNativeBoundArgument[];
  readonly bindingOffset: number;
  readonly issues: TargetDiagnostic[];
  admit(expression: Node, parameter: CsharpTargetParameter, form: SourceArgumentPlace["sourceForm"],
    mapping: CsharpProviderArgumentMapping | undefined): boolean;
}): readonly CsharpTargetArgumentOperand[] | undefined {
  const { source, policy, issues } = input;
  if (source.argumentDisposition === "skip") return Object.freeze([]);
  const operands: CsharpTargetArgumentOperand[] = [];
  const used = new Set<number>();
  const refuse = (site: Node, message: string): undefined => {
    issues.push({ source: "tsonic-csharp", code: "CSHARP_NATIVE_ARGUMENT_ABI_NOT_PROVEN", category: "error", sourceNode: site, message });
    return undefined;
  };
  for (const [authoredIndex, authored] of source.sourceArguments.entries()) {
    if (authored.operand.kind === "refused") {
      issues.push(forwardSourceRefusal(authored.operand));
      return undefined;
    }
    const operand = authored.operand.value;
    const entries = input.bindings.flatMap((binding, index) => binding.place.sourceArgumentIndex === authoredIndex
      ? [{ ...binding, binding: index + input.bindingOffset }] : []);
    for (const entry of entries) {
      const place = entry.place;
      if (!source.arguments.includes(place) || place.sourceArgument !== authored.occurrence ||
        place.parameter.signature !== source.identity.signature ||
        (authored.form === "value") !== (place.sourceForm === "value")) {
        failTargetAnalysisInvariant("tsonic-csharp", "A Native argument binding must join the identical authored Source evaluation and effective place.", authored.occurrence);
      }
      used.add(entry.binding);
    }
    if (entries.length === 0) {
      operands.push(Object.freeze({ kind: "discard", expression: operand.occurrence }));
      continue;
    }
    const first = entries[0]!;
    if (entries.length === 1 && first.projection !== undefined) {
      const projection = first.projection;
      if (authored.form !== "value" || projection.source !== operand.occurrence || first.parameter.passingMode !== "by-value" ||
        !targetTypeRefEquals(projection.target, first.parameter.type) || projection.resultIndex !== undefined &&
        (!Number.isSafeInteger(projection.resultIndex) || projection.resultIndex < 0 || projection.resultIndex >= projection.values.length)) {
        return refuse(operand.occurrence, "A Native argument projection requires the identical authored operand and complete physical result correspondence.");
      }
      operands.push(Object.freeze({ kind: "projection", binding: first.binding, projection, parameter: first.parameter }));
      continue;
    }
    if (entries.length === 1 && first.sequence !== undefined) {
      if (authored.form !== "spread" || first.sequence.expression !== operand.occurrence ||
        first.sequence.targetParameterIndex !== first.parameterIndex) {
        return refuse(operand.occurrence, "A Native rest sequence requires its exact authored spread operand and parameter.");
      }
      operands.push(Object.freeze({ kind: "sequence", binding: first.binding, sequence: first.sequence }));
      continue;
    }
    if (entries.length === 1 && first.place.sourceForm !== "spread-element") {
      if (!input.admit(operand.occurrence, first.parameter, first.place.sourceForm, first.mapping)) return undefined;
      operands.push(Object.freeze({ kind: "argument", binding: first.binding, expression: operand.occurrence,
        parameter: first.parameter, form: first.place.sourceForm, mapping: first.mapping }));
      continue;
    }
    const use = input.demand.nativeUse.expression(operand.occurrence)?.use;
    const carrier = use === undefined || use.kind === "erased" || use.completion.kind !== "value" ? undefined : use.completion.type;
    if (carrier === undefined) return refuse(operand.occurrence, "An expanded argument requires the actual completed Native aggregate carrier.");
    const values: CsharpExpandedCallArgument[] = [];
    const indexes = new Set<number>();
    for (const entry of entries) {
      if (entry.projection !== undefined || entry.sequence !== undefined || entry.parameter.passingMode !== "by-value") {
        return refuse(operand.occurrence, "An extracted by-value argument cannot fabricate a by-reference place or replace an explicit Native projection.");
      }
      let actual: TargetTypeRef | undefined;
      let read: CsharpExpandedCallArgument["read"];
      if (entry.place.sourceForm === "value") {
        actual = carrier;
        read = Object.freeze({ kind: "value" });
      } else {
        const index = entry.place.spreadElementIndex;
        if (entry.place.sourceForm !== "spread-element" || index === undefined || !Number.isSafeInteger(index) || index < 0 || indexes.has(index)) {
          failTargetAnalysisInvariant("tsonic-csharp", "An expanded Native argument requires each distinct published Source extraction index.", authored.occurrence);
        }
        indexes.add(index);
        if (carrier.kind === "tuple") {
          actual = carrier.elements[index];
          read = Object.freeze({ kind: "tuple", name: csharpTupleElementMemberName(index) });
        } else {
          actual = getCsharpReadOnlyIndexableCollectionElementTargetType(carrier);
          read = Object.freeze({ kind: "collection", index });
        }
      }
      if (actual === undefined) return refuse(operand.occurrence, "The published Source extraction has no corresponding actual Native tuple or indexable slot.");
      const target = csharpTargetParameterValueType(entry.parameter, entry.place.sourceForm);
      const scalar = policy.facts.descriptors.scalarLiteral(entry.place.source);
      const relation = entry.mapping?.kind === "by-value" ? entry.mapping.conversion
        : selectCsharpScalarConversion(policy, actual, target, "implicit", scalar);
      if (!csharpConversionIsApplicable(relation, "implicit")) {
        return refuse(entry.place.effectiveArgument, "The exact extracted Native argument cannot enter its selected physical parameter without a value-changing or unavailable conversion.");
      }
      const conversion = admitCsharpSourceConversion({ representation: policy.representation, relation,
        source: { evidence: entry.place.source, carrier: actual },
        destination: { evidence: entry.place.destination.applied, carrier: target }, site: entry.place.effectiveArgument });
      if (conversion.kind !== "represented") {
        issues.push(csharpRepresentationDiagnostic(conversion));
        return undefined;
      }
      values.push(Object.freeze({ binding: entry.binding, read, source: actual, target, conversion: conversion.value }));
    }
    operands.push(Object.freeze({ kind: "expanded", expression: operand.occurrence, carrier, values: Object.freeze(values) }));
  }
  if (used.size !== input.bindings.length) failTargetAnalysisInvariant("tsonic-csharp",
    "Every selected Native argument binding must join one original authored Source evaluation.", source.identity.invocation);
  return Object.freeze(operands);
}
