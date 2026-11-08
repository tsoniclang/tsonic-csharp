import type { Node } from "@tsonic/tsts";
import type { SourceSignatureIdentity, SourceTypeDescriptorSignature, SourceTypeEvidence } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../target-model/types/native-type-data.js";
import type { CsharpNativeCallableMember } from "../../target-model/types/native-type-data.js";
import type { CsharpRepresentationOutcome, CsharpRepresentationView } from "../../target-model/types/representation.js";
import type { CsharpConversionRelation, CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import { represented, sourceOutcome, nativeRepresentationFailure } from "../types/source-type-flow/representation-results.js";
import { csharpNativeCallableMemberKey } from "../../target-model/types/carriers/delegates.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpSourceParameterEvidenceVector } from "../types/callables/parameter-vector.js";

export interface CsharpSourceConversionValue {
  readonly evidence: SourceTypeEvidence;
  readonly carrier: TargetTypeRef;
  readonly callable?: { readonly identity: SourceSignatureIdentity; readonly member: CsharpNativeCallableMember };
}

export interface CsharpSourceConversionAdmission {
  readonly representation: CsharpRepresentationView;
  readonly relation: CsharpConversionRelation;
  readonly source: CsharpSourceConversionValue;
  readonly destination: CsharpSourceConversionValue;
  readonly site: Node;
}

export function admitCsharpSourceConversion(input: CsharpSourceConversionAdmission): CsharpRepresentationOutcome<CsharpConversionSelection> {
  const { representation, source, destination, relation, site } = input;
  representation.source.assertEvidence(source.evidence);
  representation.source.assertEvidence(destination.evidence);
  const child = (selected: CsharpConversionRelation, read: CsharpSourceConversionValue, write: CsharpSourceConversionValue) =>
    admitCsharpSourceConversion({ representation, relation: selected, source: read, destination: write, site });
  switch (relation.kind) {
    case "source-erasure-required": {
      if (!targetTypeRefEquals(relation.source, source.carrier) || !targetTypeRefEquals(relation.target, destination.carrier)) {
        throw new TypeError("Source erasure admission requires the exact selected Native relation endpoints.");
      }
      const category = representation.category(source.evidence, source.carrier, site);
      return category.kind !== "represented" ? category : represented(Object.freeze({ kind: "js-value-box", category: category.value }));
    }
    case "implicit": {
      if (relation.proof !== "runtime-union-arm") return represented(relation);
      const selected = child(relation.sourceToArm, source, { evidence: destination.evidence, carrier: relation.armType });
      return selected.kind !== "represented" ? selected : represented(Object.freeze({ ...relation, sourceToArm: selected.value }));
    }
    case "nullable-map": {
      const read = optionalValue(representation, source.evidence);
      if (read.kind !== "represented") return read;
      const write = optionalValue(representation, destination.evidence);
      if (write.kind !== "represented") return write;
      const selected = child(relation.conversion, { evidence: read.value, carrier: relation.sourceElement },
        { evidence: write.value, carrier: relation.targetElement });
      return selected.kind !== "represented" ? selected : represented(Object.freeze({ ...relation, conversion: selected.value }));
    }
    case "delegate-adapter": {
      const physicalRead = relation.members.source.signature;
      const physicalWrite = relation.members.target.signature;
      const read = callableValue(representation, source, relation.members.source, site);
      if (read.kind !== "represented") return read;
      const write = callableValue(representation, destination, relation.members.target, site);
      if (write.kind !== "represented") return write;
      const readParameters = callableParameters(representation, read.value, physicalRead, site);
      if (readParameters.kind !== "represented") return readParameters;
      const writeParameters = callableParameters(representation, write.value, physicalWrite, site);
      if (writeParameters.kind !== "represented") return writeParameters;
      const { receiverConversion: _receiverConversion, ...adapter } = relation;
      const parameterConversions: CsharpConversionSelection[] = [];
      let receiverConversion: CsharpConversionSelection | undefined;
      if (relation.receiverConversion !== undefined) {
        const readReceiver = sourceOutcome(representation.source.component(read.value.evidence,
          { kind: "receiver", signature: read.value.signature.identity }));
        if (readReceiver.kind !== "represented") return readReceiver;
        const writeReceiver = sourceOutcome(representation.source.component(write.value.evidence,
          { kind: "receiver", signature: write.value.signature.identity }));
        if (writeReceiver.kind !== "represented") return writeReceiver;
        if (physicalRead.receiver === undefined || physicalWrite.receiver === undefined) throw new TypeError("A Native receiver adapter lost its separate physical receiver slot.");
        const selected = child(relation.receiverConversion, { evidence: writeReceiver.value, carrier: physicalWrite.receiver.type },
          { evidence: readReceiver.value, carrier: physicalRead.receiver.type });
        if (selected.kind !== "represented") return selected;
        receiverConversion = selected.value;
      }
      const receiver = receiverConversion === undefined ? {} : { receiverConversion };
      for (const [index, conversion] of relation.parameterConversions.entries()) {
        const readParameter = readParameters.value[index];
        const writeParameter = writeParameters.value[index];
        if (readParameter === undefined || writeParameter === undefined) throw new TypeError("A Native delegate adapter lost an original physical parameter component.");
        const physicalSource = physicalWrite.parameters[index];
        const physicalTarget = physicalRead.parameters[index];
        if (physicalSource === undefined || physicalTarget === undefined) throw new TypeError("A Native delegate adapter lost a corresponding parameter ABI.");
        const selected = child(conversion, { evidence: writeParameter, carrier: physicalSource },
          { evidence: readParameter, carrier: physicalTarget });
        if (selected.kind !== "represented") return selected;
        parameterConversions.push(selected.value);
      }
      if (relation.returnConversion.kind === "void-return") return represented(Object.freeze({ ...adapter,
        ...receiver,
        parameterConversions: Object.freeze(parameterConversions), returnConversion: relation.returnConversion }));
      const completion = sourceOutcome(representation.source.component(read.value.evidence, { kind: "result", signature: read.value.signature.identity }));
      if (completion.kind !== "represented") return completion;
      const required = sourceOutcome(representation.source.component(write.value.evidence, { kind: "result", signature: write.value.signature.identity }));
      if (required.kind !== "represented") return required;
      if (relation.returnConversion.kind === "task-return") {
        const readAwaited = sourceOutcome(representation.source.component(completion.value, { kind: "awaited" }));
        if (readAwaited.kind !== "represented") return readAwaited;
        const writeAwaited = sourceOutcome(representation.source.component(required.value, { kind: "awaited" }));
        if (writeAwaited.kind !== "represented") return writeAwaited;
        const selected = child(relation.returnConversion.conversion,
          { evidence: readAwaited.value, carrier: relation.returnConversion.sourceResult },
          { evidence: writeAwaited.value, carrier: relation.returnConversion.targetResult });
        return selected.kind !== "represented" ? selected : represented(Object.freeze({ ...adapter,
          ...receiver,
          parameterConversions: Object.freeze(parameterConversions), returnConversion: Object.freeze({ ...relation.returnConversion, conversion: selected.value }) }));
      }
      const selected = child(relation.returnConversion,
        { evidence: completion.value, carrier: physicalRead.returnType }, { evidence: required.value, carrier: physicalWrite.returnType });
      return selected.kind !== "represented" ? selected : represented(Object.freeze({ ...adapter,
        ...receiver,
        parameterConversions: Object.freeze(parameterConversions), returnConversion: selected.value }));
    }
    case "provider-argument-adapter": {
      const first = child(relation.sourceToInput, source, { evidence: source.evidence, carrier: relation.adapter.inputType });
      if (first.kind !== "represented") return first;
      const last = child(relation.resultToTarget, { evidence: source.evidence, carrier: relation.adapter.resultType }, destination);
      return last.kind !== "represented" ? last : represented(Object.freeze({ ...relation, sourceToInput: first.value, resultToTarget: last.value }));
    }
    default: return represented(relation);
  }
}

function callableParameters(view: CsharpRepresentationView,
  callable: { readonly evidence: SourceTypeEvidence; readonly signature: SourceTypeDescriptorSignature },
  physical: CsharpNativeCallableMember["signature"], site: Node): CsharpRepresentationOutcome<readonly SourceTypeEvidence[]> {
  const result: SourceTypeEvidence[] = [];
  for (const [index, parameter] of callable.signature.parameters.entries()) {
    const evidence = sourceOutcome(view.source.component(callable.evidence,
      { kind: "parameter", signature: callable.signature.identity, index }));
    if (evidence.kind !== "represented") return evidence;
    const value = view.represent(evidence.value, "storage", site);
    if (value.kind !== "represented") return value;
    const mode = physical.parameterPassingModes[result.length];
    const empty = parameter.kind === "rest" && value.value.carrier.kind === "tuple" && value.value.carrier.elements.length === 0;
    if (mode === undefined && !empty) return nativeRepresentationFailure(site, "CSHARP_ADAPTER_PARAMETER_COMPONENT_MISMATCH",
      "The selected Native callable parameter vector differs from its complete original Source components.");
    const vector = selectCsharpSourceParameterEvidenceVector(view.source, evidence.value, {
      name: `parameter${index}`, type: value.value.carrier, passingMode: mode ?? "by-value",
      ...(parameter.kind === "optional" ? { optional: true } : {}),
      ...(parameter.kind === "rest" ? { paramsArray: true } : {}),
    }, site);
    if (vector.kind !== "represented") return vector;
    result.push(...vector.value.map(entry => entry.evidence));
  }
  return result.length === physical.parameters.length ? represented(Object.freeze(result))
    : nativeRepresentationFailure(site, "CSHARP_ADAPTER_PARAMETER_COMPONENT_MISMATCH",
      "The selected Native callable parameter vector differs from its complete original Source components.");
}

function optionalValue(view: CsharpRepresentationView, evidence: SourceTypeEvidence): CsharpRepresentationOutcome<SourceTypeEvidence> {
  const visited = new Set<SourceTypeEvidence>();
  while (!visited.has(evidence) && (evidence.type.kind === "declared" || evidence.type.kind === "projection" || evidence.type.kind === "intersection")) {
    visited.add(evidence);
    const definition = sourceOutcome(view.source.definition(evidence));
    if (definition.kind !== "represented") return definition;
    evidence = definition.value;
  }
  return evidence.type.kind === "optional" ? sourceOutcome(view.source.component(evidence, { kind: "optional-value" })) : represented(evidence);
}

function callableValue(view: CsharpRepresentationView, endpoint: CsharpSourceConversionValue, physical: CsharpNativeCallableMember,
  site: Node): CsharpRepresentationOutcome<{
  readonly evidence: SourceTypeEvidence;
  readonly signature: SourceTypeDescriptorSignature;
}> {
  let evidence = endpoint.evidence;
  const visited = new Set<SourceTypeEvidence>();
  while (!visited.has(evidence)) {
    visited.add(evidence);
    if (evidence.type.kind === "declared" || evidence.type.kind === "projection" || evidence.type.kind === "intersection") {
      const definition = sourceOutcome(view.source.definition(evidence));
      if (definition.kind !== "represented") return definition;
      evidence = definition.value;
      continue;
    }
    if (evidence.type.kind === "optional") {
      const value = sourceOutcome(view.source.component(evidence, { kind: "optional-value" }));
      if (value.kind !== "represented") return value;
      evidence = value.value;
      continue;
    }
    if (evidence.type.kind === "callable" || evidence.type.kind === "shape") {
      const signatures = [...evidence.type.calls, ...evidence.type.constructs];
      if (endpoint.callable !== undefined) {
        const signature = signatures.find(signature => signature.identity === endpoint.callable!.identity);
        if (signature === undefined || csharpNativeCallableMemberKey(endpoint.callable.member) !== csharpNativeCallableMemberKey(physical)) {
          throw new TypeError("A callable admission requires its original Source signature identity and the exact selected physical Native member.");
        }
        return represented(Object.freeze({ evidence, signature }));
      }
      if (signatures.length === 1 && signatures[0]!.identity.kind === physical.signature.kind) {
        return represented(Object.freeze({ evidence, signature: signatures[0]! }));
      }
    }
    break;
  }
  return nativeRepresentationFailure(site, "CSHARP_ADAPTER_SOURCE_SIGNATURE_MISSING",
    "A Native adapter requires the exact applied original Source callable signature and child evidence; an anchor's function category is not a parameter/result category.");
}
