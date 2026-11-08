import { createHash } from "node:crypto";
import type { Node } from "@tsonic/tsts";
import type { SourceSignatureIdentity } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpDelegateSignatureShape, CsharpTargetNamedTypeRef, CsharpTargetParameter, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpRepresentationOutcome, CsharpRepresentedTypeParameter } from "../../../target-model/types/representation.js";
import type { CsharpNativeCallableEmissionMember, CsharpNativeDelegateEmission, CsharpNativeDelegateRecords } from "../../../target-model/records/callables/native-delegates.js";
import { targetTypeRefKey } from "../../../target-model/types/equality.js";
import { csharpFreeTypeParameterIdentities } from "../../../target-model/types/generic-references.js";
import { csharpTargetNamedType } from "../../../target-model/types/factories.js";
import { csharpDelegateTargetType, getCsharpCallableMembers } from "../../../target-model/types/carriers/delegates.js";
import { substituteTargetTypeParameters } from "../../../policy/types/resolution/substitution.js";
import { isCsharpVoidTargetType } from "../../../target-model/types/identity.js";
import { createCsharpMetadataBudget } from "../../../target-model/metadata/immutable.js";
import { represented } from "../../../policy/types/source-type-flow/representation-results.js";
import type { CsharpTypeDefinitionRegistry } from "../../project-types/type-definitions.js";
import type { CsharpNativeCallableQueries } from "../../../policy/model/type-resolution.js";

export interface CsharpNativeCallableRequest {
  readonly source: SourceSignatureIdentity;
  readonly receiver: CsharpTargetParameter | undefined;
  readonly parameters: readonly CsharpTargetParameter[];
  readonly result: TargetTypeRef;
  readonly returnPassing?: "byref-readwrite" | "byref-readonly";
  readonly typeParameters: readonly CsharpRepresentedTypeParameter[];
  readonly requirements: readonly CsharpRepresentedTypeParameter[];
}

export interface CsharpNativeDelegateRegistry extends CsharpNativeCallableQueries {
  retain(requests: readonly CsharpNativeCallableRequest[], site: Node, storage: "value" | "contract"): CsharpRepresentationOutcome<TargetTypeRef>;
  inherit(carrier: TargetTypeRef, contracts: readonly TargetTypeRef[]): void;
  seal(): CsharpNativeDelegateRecords;
}

export function createCsharpNativeDelegateRegistry(definitions: CsharpTypeDefinitionRegistry): CsharpNativeDelegateRegistry {
  const values = new Map<string, CsharpNativeDelegateEmission>();
  const selections = new Map<string, Map<SourceSignatureIdentity, {
    readonly name: string;
    readonly inherited?: { readonly owner: CsharpTargetNamedTypeRef; readonly contract: TargetTypeRef };
  }>>();
  const budget = createCsharpMetadataBudget();
  let open = true;

  function associate(carrier: TargetTypeRef, requests: readonly CsharpNativeCallableRequest[],
    members: readonly CsharpNativeCallableEmissionMember[]): void {
    if (carrier.kind !== "target-named") throw new TypeError("A Native callable association requires its actual named carrier.");
    const key = carrier.id;
    let selected = selections.get(key);
    if (selected === undefined) {
      selected = new Map();
      selections.set(key, selected);
    }
    requests.forEach((request, index) => {
      const member = members[index]!;
      const previous = selected!.get(request.source);
      if (previous !== undefined && previous.name !== member.name) failTargetAnalysisInvariant("tsonic-csharp",
        "One original callable signature cannot select different Native members in one physical contract.", request.source.owner);
      selected!.set(request.source, Object.freeze({ name: member.name }));
    });
  }

  return Object.freeze({
    retain(requests, site, storage) {
      if (requests.length === 0 || new Set(requests.map(request => request.source)).size !== requests.length) {
        failTargetAnalysisInvariant("tsonic-csharp", "A Native callable contract requires every distinct original signature exactly once.", site);
      }
      const members = requests.map((request, index): CsharpNativeCallableEmissionMember => {
        const parameters = Object.freeze([...request.parameters]);
        const rest = parameters.flatMap((parameter, position) => parameter.paramsArray ? [position] : []);
        if (rest.length > 1 || rest[0] !== undefined && rest[0] !== parameters.length - 1) failTargetAnalysisInvariant("tsonic-csharp",
          "A Native callable declaration requires one final rest sequence.", site);
        const signature: CsharpDelegateSignatureShape = Object.freeze({ kind: request.source.kind,
          ...(request.receiver === undefined ? {} : { receiver: Object.freeze({
            type: request.receiver.type, passingMode: request.receiver.passingMode }) }),
          parameters: Object.freeze(parameters.map(parameter => parameter.type)),
          parameterPassingModes: Object.freeze(parameters.map(parameter => parameter.passingMode)),
          returnType: request.result,
          ...(request.returnPassing === undefined ? {} : { returnPassing: request.returnPassing }),
          optionalParameterIndexes: Object.freeze(parameters.flatMap((parameter, position) => parameter.optional ? [position] : [])),
          ...(rest[0] === undefined ? {} : { restParameterIndex: rest[0] }) });
        return Object.freeze({ name: requests.length === 1 ? "Invoke" : `${request.source.kind === "call" ? "Invoke" : "Construct"}${index}`,
          signature, receiver: request.receiver, parameters, typeParameters: Object.freeze([...request.typeParameters]) });
      });
      const first = requests[0]!;
      const firstMember = members[0]!;
      if (storage === "value" && requests.length === 1 && first.source.kind === "call" && first.receiver === undefined &&
        first.typeParameters.length === 0 && first.returnPassing === undefined && first.parameters.length <= 16 &&
        first.parameters.every(parameter => parameter.passingMode === "by-value")) {
        const carrier = csharpDelegateTargetType(isCsharpVoidTargetType(first.result) ? "System.Action" : "System.Func",
          first.parameters.map(parameter => parameter.type), isCsharpVoidTargetType(first.result) ? undefined : first.result,
          { optionalParameterIndexes: firstMember.signature.optionalParameterIndexes,
            ...(firstMember.signature.restParameterIndex === undefined ? {} : { restParameterIndex: firstMember.signature.restParameterIndex }) });
        associate(carrier, requests, members);
        return represented(carrier);
      }
      const requirements = new Map<string, CsharpRepresentedTypeParameter>();
      for (const request of requests) {
        const bound = new Set(request.typeParameters.map(parameter => parameter.identity));
        for (const parameter of request.requirements) {
          if (!bound.has(parameter.identity)) requirements.set(parameter.identity, parameter);
        }
        const available = new Set([...requirements.keys(), ...bound]);
        if ([...csharpFreeTypeParameterIdentities([request.result, ...request.parameters.map(parameter => parameter.type),
          ...(request.receiver === undefined ? [] : [request.receiver.type])])]
          .some(identity => !available.has(identity))) failTargetAnalysisInvariant("tsonic-csharp",
            "A Native callable contract requires every completed original free or method generic parameter.", site);
      }
      const parameters = Object.freeze([...requirements.values()]);
      const kind = storage === "value" && requests.length === 1 && first.typeParameters.length === 0 ? "delegate" as const : "contract" as const;
      const key = JSON.stringify([kind, members.map(member => [member.name, member.signature.kind,
        member.receiver === undefined ? null : [targetTypeRefKey(member.receiver.type), member.receiver.passingMode],
        member.parameters.map(parameter => [targetTypeRefKey(parameter.type), parameter.passingMode, parameter.optional === true, parameter.paramsArray === true]),
        targetTypeRefKey(member.signature.returnType), member.signature.returnPassing,
        member.typeParameters.map(parameter => targetTypeRefKey(parameter))]), parameters.map(parameter => targetTypeRefKey(parameter))]);
      let record = values.get(key);
      if (record === undefined) {
        if (!open) failTargetAnalysisInvariant("tsonic-csharp", "A Native callable cannot appear after its registry is sealed.", site);
        budget.reserve(1 + members.reduce((total, member) => total + member.parameters.length + member.typeParameters.length, 0) + parameters.length);
        const name = `Native${kind === "delegate" ? first.source.kind === "call" ? "Call" : "Construct" : "Callable"}_${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
        const carrier: CsharpTargetNamedTypeRef = Object.freeze({ ...csharpTargetNamedType(`tsonic.native-callable:${name}`,
          parameters, { kind: "named", name },
          { allowsRefLikeTypeArguments: parameters.map(() => false), constraintRequiresReferenceType: true, typeofRuntimeKind: "function" }),
          ...(kind === "delegate" ? { csharpDelegateSignature: firstMember.signature } :
            { csharpCallableMembers: Object.freeze(members.map(member => Object.freeze({ name: member.name, signature: member.signature,
              typeParameters: Object.freeze(member.typeParameters.map(parameter => Object.freeze({
                ...(parameter.csharpDeclaration === undefined ? {} : { declaration: parameter.csharpDeclaration }), identity: parameter.identity, name: parameter.name,
                constraints: parameter.csharpConstraints.constraints }))) }))) }) });
        const definition = definitions.retainGenerated({ carrier, kind: kind === "contract" ? "interface" : "delegate",
          parameters, supertypes: Object.freeze([]) });
        record = Object.freeze({ kind, carrier: definition.carrier, members: Object.freeze(members), typeParameters: parameters, site });
        values.set(key, record);
      }
      associate(record.carrier, requests, record.members);
      return represented(record.carrier);
    },
    inherit(carrier, contracts) {
      if (carrier.kind !== "target-named") throw new TypeError("A Native callable implementation requires its actual named owner.");
      const target = selections.get(carrier.id) ?? new Map();
      for (const contract of contracts) {
        if (contract.kind !== "target-named") continue;
        const selected = selections.get(contract.id);
        if (selected === undefined) continue;
        for (const [identity, member] of selected) {
          const previous = target.get(identity);
          if (previous !== undefined && (previous.name !== member.name || previous.inherited !== undefined &&
            targetTypeRefKey(previous.inherited.contract) !== targetTypeRefKey(contract))) failTargetAnalysisInvariant("tsonic-csharp",
            "One original callable identity cannot have different methods on one physical owner.", identity.owner);
          target.set(identity, Object.freeze({ name: member.name, inherited: Object.freeze({ owner: carrier, contract }) }));
        }
      }
      selections.set(carrier.id, target);
    },
    member(carrier, source) {
      if (carrier.kind !== "target-named") return undefined;
      const association = selections.get(carrier.id)?.get(source);
      if (association === undefined) return undefined;
      let owner: TargetTypeRef = carrier;
      if (association.inherited !== undefined) {
        const parameters = association.inherited.owner.typeArguments ?? [];
        const arguments_ = carrier.typeArguments ?? [];
        if (parameters.length !== arguments_.length) throw new TypeError("A Native callable implementation lost its complete owner parameter vector.");
        const substitutions = new Map<string, TargetTypeRef>();
        parameters.forEach((parameter, index) => {
          if (parameter.kind === "type-parameter") substitutions.set(parameter.identity, arguments_[index]!);
          else if (targetTypeRefKey(parameter) !== targetTypeRefKey(arguments_[index]!)) throw new TypeError("A Native callable implementation changed a fixed owner argument.");
        });
        owner = substituteTargetTypeParameters(association.inherited.contract, substitutions);
      }
      const members = getCsharpCallableMembers(owner).filter(member => member.name === association.name);
      if (members.length !== 1) failTargetAnalysisInvariant("tsonic-csharp",
        "An original Source callable identity requires exactly its associated physical Native member, never a signature match.", source.owner);
      return Object.freeze({ ...members[0]!, owner });
    },
    seal() {
      if (!open) failTargetAnalysisInvariant("tsonic-csharp", "The Native callable registry seals exactly once.");
      open = false;
      const records = Object.freeze([...values.values()]);
      return Object.freeze({ nativeDelegates: Object.freeze({ get: () => records }) });
    },
  });
}
