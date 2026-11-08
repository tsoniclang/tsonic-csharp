import type { Node } from "@tsonic/tsts";
import type { TargetSelection } from "@tsonic/target-api";
import type { SourceMemberOrigin, TargetSourceProgram } from "@tsonic/target-api/source";
import { sourceNodeIdentity } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpProviderRelationResolver } from "../../providers/model/relation-resolver.js";
import type { CsharpProjectTypeCatalog } from "../../target-model/records/types/project-types.js";
import type { CsharpObjectShapeFact, CsharpTargetParameter, TargetTypeRef } from "../../target-model/types/model.js";
import type {
  CsharpDeclaredRepresentation,
  CsharpRepresentationOutcome,
  CsharpRepresentationView,
  CsharpRepresentedType,
  CsharpRepresentedTypeParameter,
  CsharpSourceRoleImplementation,
} from "../../target-model/types/representation.js";
import type { CsharpRepresentationHost, CsharpSourceMemberDeclaration } from "../../policy/types/source-type-flow/representation-host.js";
import { selectCsharpRepresentationConstraints } from "../../policy/types/source-type-flow/representation-constraints.js";
import { represented, nativeRepresentationFailure, representationRequirements } from "../../policy/types/source-type-flow/representation-results.js";
import { csharpJsMapTargetType, csharpJsSetTargetType } from "../../target-model/types/carriers/js.js";
import { classifyCsharpSourceProfileDeclaration } from "../../policy/identities/source-types.js";
import { selectCsharpSourceProfileCarrier } from "../../policy/operations/source-profiles/type-carriers.js";
import { csharpTargetTypeFromBinding } from "../../policy/types/storage/bindings.js";
import { csharpRecordDictionaryCarrier } from "../../target-model/types/carriers/collections.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { selectCsharpSourceParameterEvidenceVector } from "../../policy/types/callables/parameter-vector.js";
import { selectCsharpClassFactoryType } from "../project-types/class-factory-types.js";
import { csharpSourceParameterPassingMode } from "../../source/extension/arguments.js";
import type { CsharpNativeCallableRequest, CsharpNativeDelegateRegistry } from "../callables/native/native-delegates.js";

export interface CsharpNativeRepresentationPorts {
  readonly source: TargetSourceProgram;
  readonly target: TargetSelection;
  readonly providers: CsharpProviderRelationResolver;
  readonly catalog: CsharpProjectTypeCatalog;
  readonly representation: () => CsharpRepresentationView;
  readonly retainShape: (shape: CsharpObjectShapeFact, site: Node) => CsharpRepresentationOutcome<CsharpObjectShapeFact>;
  readonly retainRoleWitness: (implementation: CsharpSourceRoleImplementation, site: Node) => CsharpRepresentationOutcome<TargetTypeRef>;
  readonly nativeDelegates: CsharpNativeDelegateRegistry;
}

export function createCsharpNativeRepresentationHost(ports: CsharpNativeRepresentationPorts): CsharpRepresentationHost {
  const { source, providers, catalog } = ports;
  const { ast } = source;
  const sourceView = source.facts.descriptors;
  const host: CsharpRepresentationHost = {
    source: sourceView,
    applications: source.facts.applications,
    target: ports.target,
    identity(declaration) {
      const identity = sourceNodeIdentity(ast, declaration);
      const name = ast.name(declaration);
      if (identity === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "An authenticated original Native representation root requires its canonical source identity.", declaration);
      return Object.freeze({ identity, name: name === undefined ? undefined : ast.text(name) });
    },
    nativeConstraints(_original, bound, _defaultType, parameter, site) {
      return selectCsharpRepresentationConstraints({ bound, parameter, site, providers,
        nativeDeclarationKind(carrier) {
          const project = catalog.definitionForTarget(carrier);
          if (project !== undefined) return project.kind;
          if (carrier.kind !== "target-named") return undefined;
          const binding = providers.findTargetBindingByTargetId(carrier.id, "ordinary");
          return binding.kind === "resolved" ? binding.binding.kind : undefined;
        } });
    },
    declaredType(evidence, arguments_, site) {
      sourceView.assertEvidence(evidence);
      if (evidence.type.kind !== "declared") throw new TypeError("A Native declared carrier requires original declared evidence.");
      const { declaration, extent } = evidence.type;
      const argumentsCarriers = arguments_.map(argument => argument.carrier);
      const requirements = representationRequirements(arguments_.map(argument => argument.requirements));
      const present = (carrier: TargetTypeRef, additional: CsharpDeclaredRepresentation["requirements"] = []):
        CsharpRepresentationOutcome<{ readonly kind: "present"; readonly value: CsharpDeclaredRepresentation }> =>
        represented(Object.freeze({ kind: "present", value: Object.freeze({ carrier,
          requirements: representationRequirements([requirements, additional]) }) }));
      if (extent !== undefined) {
        if (extent.length < 0n || extent.length > 2_147_483_647n || arguments_.length !== 2 || arguments_[0] === undefined) {
          return nativeRepresentationFailure(site, "CSHARP_FIXED_ARRAY_EXTENT_UNSUPPORTED",
            "The exact Source FixedArray requires an element and an extent in the Native T[].Length range.");
        }
        return present(Object.freeze({ kind: "array", element: arguments_[0].carrier }));
      }
      const pointer = source.facts.protocols.pointerType(evidence);
      if (pointer.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: pointer });
      if (pointer.value.kind === "present") {
        const selected = pointer.value.value;
        if (selected.kind === "raw-address") return present(csharpRuntimeRawPointerTargetType());
        if (selected.kind === "typed-location" || selected.kind === "native-pointer") {
          const pointee = ports.representation().represent(selected.pointee, "storage", site);
          if (pointee.kind !== "represented") return pointee;
          return present(selected.kind === "typed-location" ? csharpRuntimeLocationTargetType(pointee.value.carrier)
            : Object.freeze({ kind: "pointer", pointee: pointee.value.carrier,
              mutability: selected.mutability === "readonly" ? "const" : "mut" }), pointee.value.requirements);
        }
        const parameters: CsharpRepresentedType[] = [];
        for (const parameter of selected.parameters) {
          const value = ports.representation().represent(parameter, "storage", site);
          if (value.kind !== "represented") return value;
          parameters.push(value.value);
        }
        const result = ports.representation().represent(selected.result, "return", site);
        if (result.kind !== "represented") return result;
        return present(Object.freeze({ kind: "function-pointer", args: Object.freeze(parameters.map(parameter => parameter.carrier)),
          result: result.value.carrier, abi: selected.abi }), representationRequirements([
          result.value.requirements, ...parameters.map(parameter => parameter.requirements),
        ]));
      }
      const original = source.facts.navigation.providerDeclaration(declaration);
      if (original.kind === "present") {
        const resolution = providers.resolveType(original.value);
        if (resolution.kind !== "resolved") return nativeRepresentationFailure(site, "CSHARP_PROVIDER_TYPE_BINDING_MISSING",
          resolution.kind === "missing" ? resolution.reason : resolution.diagnostic.message);
        const relations = resolution.relations.filter(relation => relation.kind === "type");
        if (relations.length !== 1) return nativeRepresentationFailure(site, "CSHARP_PROVIDER_TYPE_BINDING_AMBIGUOUS",
          "An original provider declaration requires exactly one Native type relation.");
        const relation = relations[0]!;
        const count = relation.targetBinding.typeParameters?.length ?? 0;
        const targets: (TargetTypeRef | undefined)[] = Array.from({ length: count });
        for (const parameter of relation.bindingTypeParameters) {
          const argument = argumentsCarriers[parameter.sourceTypeParameterIndex];
          if (argument === undefined || parameter.targetTypeParameterIndex < 0 || parameter.targetTypeParameterIndex >= count ||
            targets[parameter.targetTypeParameterIndex] !== undefined) return nativeRepresentationFailure(site,
              "CSHARP_PROVIDER_TYPE_ARGUMENTS_INVALID", "The Native provider relation requires an exact complete nonduplicate type-argument vector.");
          targets[parameter.targetTypeParameterIndex] = argument;
        }
        if (targets.some(argument => argument === undefined)) return nativeRepresentationFailure(site,
          "CSHARP_PROVIDER_TYPE_ARGUMENTS_MISSING", "The Native provider relation has an unbound physical type argument.");
        const carrier = csharpTargetTypeFromBinding(relation.targetBinding, targets as readonly TargetTypeRef[]);
        return carrier === undefined ? nativeRepresentationFailure(site, "CSHARP_PROVIDER_TYPE_CARRIER_MISSING",
          "The exact Native provider binding has no physical carrier.") : present(carrier);
      }
      const project = catalog.select(declaration);
      if (project.kind !== "represented") return project;
      if (project.value.kind === "present") {
        const carrier = catalog.targetTypeForDeclaration(declaration, argumentsCarriers);
        return carrier === undefined ? nativeRepresentationFailure(site, "CSHARP_PROJECT_TYPE_ARGUMENTS_MISSING",
          "The original project declaration has no complete Native type-argument vector.") : present(carrier);
      }
      const profile = classifyCsharpSourceProfileDeclaration(source.facts.navigation, declaration);
      if (profile === undefined) return represented(Object.freeze({ kind: "none" }));
      if (profile.kind === "set" || profile.kind === "readonly-set" || profile.kind === "map" || profile.kind === "readonly-map") {
        const map = profile.kind === "map" || profile.kind === "readonly-map";
        const key = arguments_[0];
        const value = arguments_[1];
        if (key === undefined || arguments_.length !== (map ? 2 : 1) || map && value === undefined) {
          return nativeRepresentationFailure(site, "CSHARP_COLLECTION_ARGUMENTS_MISSING",
            "The Source collection requires its complete original key and value arguments.");
        }
        const selected = ports.representation().collectionKey(key.evidence, key.carrier, site);
        return selected.kind !== "represented" ? selected : present(map
          ? csharpJsMapTargetType(key.carrier, value!.carrier, selected.value.type)
          : csharpJsSetTargetType(key.carrier, selected.value.type), selected.value.requirements);
      }
      let dictionaryCarrier: TargetTypeRef | undefined;
      if (profile.kind === "record") {
        const selected = dictionary(argumentsCarriers, site);
        if (selected.kind !== "represented") return selected;
        dictionaryCarrier = selected.value;
      }
      const carrier = selectCsharpSourceProfileCarrier({ dictionaryCarrier }, profile, argumentsCarriers);
      if (carrier === undefined) return nativeRepresentationFailure(site, "CSHARP_SOURCE_PROFILE_CARRIER_MISSING",
        "The original Source profile declaration has no selected physical carrier for these exact arguments.");
      const published = providers.publishNativeIdentities(carrier);
      return published.kind === "resolved" ? present(published.value) : nativeRepresentationFailure(site,
        "CSHARP_SOURCE_PROFILE_BINDING_MISSING", published.kind === "missing" ? published.reason : published.diagnostic.message);
    },
    indexType(key, value, _readonly, site) {
      return dictionary([key, value], site);
    },
    callableType(signatures, site, storage) {
      if (signatures.length === 0) return nativeRepresentationFailure(site, "CSHARP_CALLABLE_SIGNATURES_MISSING",
        "A Native callable requires the complete original call and construct signature vector.");
      const requests: CsharpNativeCallableRequest[] = [];
      for (const signature of signatures) {
        const parameters: CsharpTargetParameter[] = [];
        for (const [index, parameter] of signature.source.parameters.entries()) {
          const value = signature.parameters[index];
          if (value === undefined) throw new TypeError("A Native callable requires every supplied represented parameter.");
          const mode = parameter.declaration === undefined ? Object.freeze({ kind: "resolved" as const, value: "by-value" as const })
            : csharpSourceParameterPassingMode(source.facts.protocols, parameter.declaration);
          if (mode.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: mode });
          const vector = selectCsharpSourceParameterEvidenceVector(sourceView, value.evidence, { name: `parameter${index}`, type: value.carrier,
            passingMode: mode.value,
            ...(parameter.kind === "optional" ? { optional: true } : {}), ...(parameter.kind === "rest" ? { paramsArray: true } : {}) }, site);
          if (vector.kind !== "represented") return vector;
          parameters.push(...vector.value.map(entry => entry.parameter));
        }
        const receiverMode = signature.source.receiver?.declaration === undefined
          ? Object.freeze({ kind: "resolved" as const, value: "by-value" as const })
          : csharpSourceParameterPassingMode(source.facts.protocols, signature.source.receiver.declaration);
        if (receiverMode.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: receiverMode });
        const receiver: CsharpTargetParameter | undefined = signature.receiver === undefined ? undefined : Object.freeze({
          name: "receiver", type: signature.receiver.carrier, passingMode: receiverMode.value,
        });
        const typeParameters = signature.typeParameters;
        const requirements = representationRequirements([signature.result.requirements,
          ...signature.parameters.map(parameter => parameter.requirements), ...(signature.receiver === undefined ? [] : [signature.receiver.requirements]),
          typeParameters]);
        requests.push(Object.freeze({ source: signature.source.identity, receiver, parameters: Object.freeze(parameters),
          result: signature.result.carrier, typeParameters: Object.freeze(typeParameters), requirements }));
      }
      const first = signatures[0]!;
      if (storage === "value" && signatures.every(signature => signature.source.identity.kind === "construct" &&
          targetTypeRefEquals(signature.result.carrier, first.result.carrier))) {
        const factory = selectCsharpClassFactoryType(ast, catalog, first.result.carrier);
        if (factory !== undefined) return represented(factory);
      }
      return ports.nativeDelegates.retain(Object.freeze(requests), site, storage);
    },
    memberDeclaration(origin, site) {
      return memberDeclaration(origin, site);
    },
    shapeKind(original) {
      const owner = catalog.definitionForDeclaration(original);
      return owner?.kind === "class" || owner?.kind === "struct" ? "storage" : "contract";
    },
    retainShape: ports.retainShape,
    retainRoleWitness: ports.retainRoleWitness,
  };

  function dictionary(arguments_: readonly TargetTypeRef[], site: Node): CsharpRepresentationOutcome<TargetTypeRef> {
    if (arguments_.length !== 2) return nativeRepresentationFailure(site, "CSHARP_INDEX_SIGNATURE_ARGUMENTS_MISSING",
      "A Native indexed carrier requires its exact original key and value arguments.");
    const binding = providers.findTargetBindingByMetadataName("System.Collections.Generic.Dictionary`2", "ordinary");
    if (binding.kind !== "resolved") return nativeRepresentationFailure(site, "CSHARP_INDEX_SIGNATURE_BINDING_MISSING",
      binding.kind === "missing" ? "The Native Dictionary binding is absent." : binding.diagnostic.message);
    const carrier = csharpTargetTypeFromBinding(binding.binding, arguments_);
    return carrier?.kind !== "target-named" ? nativeRepresentationFailure(site, "CSHARP_INDEX_SIGNATURE_CARRIER_MISSING",
      "The Native Dictionary binding has no physical indexed carrier.") : represented(csharpRecordDictionaryCarrier(carrier));
  }

  function memberDeclaration(origin: SourceMemberOrigin, site: Node): CsharpRepresentationOutcome<CsharpSourceMemberDeclaration> {
    if (origin.kind === "mapped") return represented(Object.freeze({ declarations: Object.freeze([]), kind: "property", bound: false }));
    if (origin.kind === "class-prototype") return represented(Object.freeze({ declarations: Object.freeze([origin.owner]), kind: "property", bound: false }));
    const declaration = origin.declaration;
    if (ast.is.IsMethodDeclaration(declaration) || ast.is.IsMethodSignatureDeclaration(declaration)) {
      return represented(Object.freeze({ declarations: Object.freeze([declaration]), kind: "method", bound: true }));
    }
    if (ast.is.IsGetAccessorDeclaration(declaration) || ast.is.IsSetAccessorDeclaration(declaration)) {
      return represented(Object.freeze({ declarations: Object.freeze([declaration]), kind: "property", bound: false,
        accessor: Object.freeze({ getter: true, setter: ast.is.IsSetAccessorDeclaration(declaration) }) }));
    }
    if (ast.is.IsPropertyDeclaration(declaration) || ast.is.IsPropertySignatureDeclaration(declaration) ||
      ast.is.IsPropertyAssignment(declaration) || ast.is.IsShorthandPropertyAssignment(declaration) || ast.is.IsParameterDeclaration(declaration)) {
      return represented(Object.freeze({ declarations: Object.freeze([declaration]), kind: "property", bound: false }));
    }
    return nativeRepresentationFailure(site, "CSHARP_MEMBER_ORIGIN_UNSUPPORTED", "The authenticated original member has no selected Native declaration form.");
  }

  return Object.freeze(host);
}
