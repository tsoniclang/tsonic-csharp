import type { Node } from "@tsonic/tsts";
import type { CsharpRepresentationContract } from "./iteration.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { targetTypeRefKey } from "../../target-model/types/equality.js";

export function csharpRepresentationDifference(
  previous: CsharpRepresentationContract,
  repeated: CsharpRepresentationContract,
  identity: (node: Node | undefined) => string | undefined,
): readonly string[] {
  const snapshot = (contract: CsharpRepresentationContract): ReadonlyMap<string, string> => {
    const facts = new Map<string, string>();
    const type = (value: TargetTypeRef | undefined): string => value === undefined ? "absent" : targetTypeRefKey(value);
    const put = (key: string, value: unknown): void => { facts.set(key, JSON.stringify(value) ?? "absent"); };
    put("callables.closedInputs.length", contract.callables.closedInputs.length);
    contract.callables.closedInputs.forEach((entry, index) => {
      put(`callables.closedInputs[${index}]`, [identity(entry.declaration), type(entry.input.type), identity(entry.input.source.sourceDeclaration)]);
    });
    put("callables.contracts.length", contract.callables.contracts.length);
    contract.callables.contracts.forEach((entry, index) => {
      const key = `callables.contracts[${index}](${identity(entry.sourceDeclaration) ?? entry.kind})`;
      put(`${key}.kind`, entry.kind);
      put(`${key}.return`, type(entry.returnType));
      put(`${key}.sourceReturn`, type(entry.nativeSignature.sourceReturnType));
      put(`${key}.receiver`, identity(entry.nativeSignature.receiverTypeOwner));
      put(`${key}.binders`, [entry.nativeSignature.methodTypeParameterIdentities, entry.nativeSignature.methodAllowsRefLikeTypeArguments]);
      put(`${key}.parameters.length`, entry.nativeParameters.length);
      entry.nativeParameters.forEach((parameter, parameterIndex) => {
        const selected = parameter.targetParameter;
        put(`${key}.parameters[${parameterIndex}]`, [identity(parameter.sourceParameter), selected.name, type(selected.type),
          selected.passingMode, selected.optional, selected.paramsArray, selected.csharpOutputMayBeNull,
          selected.csharpAcceptsCheckedSourceArgument, selected.csharpAcceptsClosedSourceArgument, selected.csharpValueProjection,
          selected.csharpOmittableOptionalArgument, selected.csharpSourceArgumentAdapter?.kind,
          type(selected.csharpSourceArgumentAdapter?.sourceCallableType)]);
      });
      if (entry.kind === "source") {
        put(`${key}.sourceParameters`, entry.parameters.map(parameter => identity(parameter)));
        put(`${key}.bodyInputs`, entry.bodyInputs === undefined ? "absent" : entry.bodyInputs.parameters.map(parameter =>
          [identity(parameter.sourceParameter), parameter.missing, type(parameter.targetParameter.type)]));
        put(`${key}.bodyAdapters`, entry.bodyInputs?.adapters.map(adapter => [adapter.kind, adapter.parameterIndex,
          type(adapter.adapter.source), type(adapter.adapter.target), adapter.adapter.conversion.kind]));
      }
    });
    put("storage.closedContracts", contract.storage.closedNativeContracts.map(type));
    put("storage.contracts.length", contract.storage.contracts.length);
    contract.storage.contracts.forEach((entry, index) => {
      put(`storage.contracts[${index}](${identity(entry.declaration) ?? "unidentified"})`,
        [type(entry.type), type(entry.targetType), type(entry.lambdaParameterType), type(entry.nullableWrittenType), entry.typedLocationIdentity]);
    });
    put("storage.issues", contract.storage.issues.map(issue => [identity(issue.node), issue.code, issue.message]));
    put("storage.nativeArrays", contract.storage.nativeArrays.map(entry => [identity(entry.subject),
      entry.storage.kind, entry.storage.stride.toString(), type(entry.storage.layout.pointeeType)]));
    put("storage.nativeFields", contract.storage.nativeFields.map(entry => [type(entry.owner), entry.memberName,
      entry.storageName, type(entry.layout.pointeeType), entry.layout.size.toString(), entry.layout.alignment.toString()]));
    put("storage.nativeBackings", contract.storage.nativeBackings.map(entry => [identity(entry.subject),
      type(entry.layout.pointeeType), entry.layout.size.toString(), entry.layout.alignment.toString()]));
    put("projections.entries", contract.typeProjections.entries.map(entry => [identity(entry.declaration),
      entry.parameters.map(parameter => parameter.identity), entry.outerParameters.map(parameter => parameter.identity)]));
    return facts;
  };
  const before = snapshot(previous);
  const after = snapshot(repeated);
  const bounded = (value: string | undefined): string => value === undefined ? "absent"
    : value.length <= 4096 ? value : `${value.slice(0, 4096)} [${value.length} characters]`;
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(key) !== after.get(key)) return Object.freeze([
      `native.representation.component=${key.split(".")[0]}`,
      `native.representation.key=${key}`,
      `native.representation.previous=${bounded(before.get(key))}`,
      `native.representation.repeated=${bounded(after.get(key))}`,
    ]);
  }
  return Object.freeze(["native.representation.component=unserialized-metadata",
    "native.representation.key=contract-equality", "native.representation.previous=distinct contract",
    "native.representation.repeated=equal serialized carrier facts"]);
}
