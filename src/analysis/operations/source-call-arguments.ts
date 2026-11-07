import type { Node } from "@tsonic/tsts";
import type { SourceArgumentCorrespondence, SourceCallSelection } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpSourceArgumentGrouping } from "../../policy/operations/members/source-argument-groups.js";
import type { CsharpSourceCallArgumentClassification } from "../../target-model/records/operations/operations.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/operations/member-selections.js";
import type { CsharpTargetParameter } from "../../target-model/types/model.js";
import { csharpSourceArgumentExpectedType } from "../../target-model/types/member-facts.js";
import type { CsharpTypedLocationOperationSelection } from "../../target-model/records/storage/typed-locations.js";
import { isCsharpRefusal } from "../../representation/index.js";
import type { SourceCallableContract } from "../../target-model/records/callables/source-callable-contract.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { csharpFreeTypeParameterIdentities } from "../../target-model/types/generic-references.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";

/** The C# argument form of a Host argument correspondence: a spread passes a sequence; every other argument a value. */
export function csharpArgumentSourceForm(mode: SourceArgumentCorrespondence["mode"]): "value" | "spread-sequence" {
  return mode === "spread" ? "spread-sequence" : "value";
}

export function classifyCsharpTypedLocationCallArguments(
  source: SourceCallSelection,
  typedLocation: Extract<CsharpTypedLocationOperationSelection,
    { readonly kind: "location-bind" | "location-project" | "location-view" }>,
): Pick<CsharpSourceCallArgumentClassification, "sourceArgumentParameterTypes"> {
  return Object.freeze({ sourceArgumentParameterTypes: Object.freeze(source.arguments.map(binding => {
    const arguments_ = typedLocation.arguments.filter(argument => argument.expression === binding.argument);
    return csharpArgumentSourceForm(binding.mode) === "value" && arguments_.length === 1 ? arguments_[0]!.type : undefined;
  })) });
}

export function classifyCsharpNativeCallArguments(
  source: SourceCallSelection,
  native: Extract<CsharpTargetCallSelection, { readonly kind: "resolved" }>,
): Pick<CsharpSourceCallArgumentClassification, "sourceArgumentParameterTypes"> {
  // A selected native argument is numbered by its position in the Host argument correspondences (D-F1-2).
  const sourceArgumentParameterTypes = Object.freeze(source.arguments.map((binding, index) => {
    const sourceForm = csharpArgumentSourceForm(binding.mode);
    const arguments_ = native.call.arguments.filter(argument =>
      argument.effectiveArgumentIndex === index && argument.sourceForm === sourceForm);
    return arguments_.length === 1
      ? csharpSourceArgumentExpectedType(arguments_[0]!.targetParameter, sourceForm) : undefined;
  }));
  return Object.freeze({ sourceArgumentParameterTypes });
}

/**
 * The native parameter vector of a source-owned call: the callee's callable ABI contract (parameter passing modes,
 * optional and params slots, a tuple-typed rest expanded per element, and the contract carriers), with the callee's
 * method and receiver binders replaced by the Host instantiation of this use, as at baseline
 * (resolveSourceCallParameters). A callee without a callable contract (no project callable declaration) takes the
 * Host-selected signature slots with their instantiated descriptors represented as storage, passed by value. A CSHARP_
 * refusal of a parameter leaves the vector unresolved; the refusal is reported where the parameter's storage is declared.
 */
function sourceCallNativeParameters(policy: CsharpPolicyContext, source: SourceCallSelection, contract: SourceCallableContract | undefined):
  readonly CsharpTargetParameter[] | undefined {
  if (contract !== undefined) {
    const substitutions = sourceCallContractSubstitutions(policy, source, contract);
    return substitutions === undefined ? undefined : Object.freeze(contract.nativeParameters.map(parameter =>
      Object.freeze({ ...parameter.targetParameter, type: substituteTargetTypeParameters(parameter.targetParameter.type, substitutions) })));
  }
  const parameters: CsharpTargetParameter[] = [];
  for (const parameter of source.parameters) {
    const type = policy.types.represent(parameter.type, source.use, "storage");
    if (isCsharpRefusal(type)) return undefined;
    parameters.push(Object.freeze({
      name: parameter.name,
      passingMode: "by-value" as const,
      optional: parameter.kind === "optional",
      paramsArray: parameter.kind === "rest",
      type,
    }));
  }
  return Object.freeze(parameters);
}

/**
 * The C# binder substitution of a callee contract at one use: each method binder and receiver-class binder of the
 * Host instantiation (`instantiations.at(use)`, the one Source substitution) represented once. undefined when a binder
 * the contract's parameters mention has no represented argument at this use.
 */
function sourceCallContractSubstitutions(policy: CsharpPolicyContext, source: SourceCallSelection, contract: SourceCallableContract):
  ReadonlyMap<string, TargetTypeRef> | undefined {
  const substitutions = new Map<string, TargetTypeRef>();
  const instantiation = policy.types.instantiation(source.use);
  if (instantiation !== undefined) {
    const bindings = [
      ...instantiation.instantiation.receiver.map((binding, index) => ({ binding, type: instantiation.receiver[index] })),
      ...instantiation.instantiation.method.map((binding, index) => ({ binding, type: instantiation.method[index] })),
    ];
    for (const { binding, type } of bindings) {
      const identity = csharpSourceTypeParameter(binding.declaration, policy.ast, policy.facts.navigation.identity)?.identity;
      if (identity === undefined || type === undefined || isCsharpRefusal(type)) return undefined;
      substitutions.set(identity, type);
    }
  }
  const owner = contract.nativeSignature.receiverTypeOwner;
  const binders = new Set([...contract.nativeSignature.methodTypeParameterIdentities,
    ...(owner === undefined ? [] : policy.ast.typeParameters(owner).flatMap(parameter => {
      const identity = parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, policy.ast, policy.facts.navigation.identity)?.identity;
      return identity === undefined ? [] : [identity];
    }))]);
  const free = csharpFreeTypeParameterIdentities(contract.nativeParameters.map(parameter => parameter.targetParameter.type));
  return [...free].some(identity => binders.has(identity) && !substitutions.has(identity)) ? undefined : substitutions;
}

export function classifyCsharpSourceCallArguments(
  policy: CsharpPolicyContext,
  source: SourceCallSelection,
  sourceCall: CsharpSourceCallArgumentClassification["sourceCall"],
  sourceMethodValue: CsharpSourceCallArgumentClassification["sourceMethodValue"],
): Pick<CsharpSourceCallArgumentClassification,
  "sourceParameterTypes" | "sourceArgumentParameterTypes" | "sourceArgumentGrouping"> {
  const contract = policy.sourceCallable(source.use, "implementation");
  const sourceNativeParameters = sourceCallNativeParameters(policy, source, contract);
  // Per selected signature parameter: the native parameter of its declaration (the first element slot of an expanded
  // tuple rest), else the Host-instantiated parameter descriptor represented as storage.
  const sourceParameterTypes = Object.freeze(source.parameters.map(parameter => {
    if (contract !== undefined) {
      const index = contract.nativeParameters.findIndex(entry => entry.sourceParameter === parameter.declaration);
      return index < 0 ? undefined : sourceNativeParameters?.[index]?.type;
    }
    const type = policy.types.represent(parameter.type, source.use, "storage");
    return isCsharpRefusal(type) ? undefined : type;
  }));
  // An argument binds the native slot at its effective position (the params slot for every later position).
  const restIndex = sourceNativeParameters?.findIndex(parameter => parameter.paramsArray === true) ?? -1;
  const sourceArgumentParameterTypes = Object.freeze(source.arguments.map(binding => {
    const parameter = sourceNativeParameters?.[restIndex < 0 ? binding.effectiveIndex : Math.min(binding.effectiveIndex, restIndex)];
    return parameter === undefined ? undefined : csharpSourceArgumentExpectedType(parameter, csharpArgumentSourceForm(binding.mode));
  }));
  const declaration: Node | undefined = policy.facts.navigation.identity.target(source.callee)?.declaration ?? source.declaration;
  const exactArity = sourceMethodValue === undefined && (sourceCall?.kind === "value" || declaration !== undefined &&
    (policy.ast.is.IsVariableDeclaration(declaration) || policy.ast.is.IsParameterDeclaration(declaration) ||
      policy.ast.is.IsPropertyDeclaration(declaration) || policy.ast.is.IsPropertySignatureDeclaration(declaration) ||
      policy.ast.is.IsBindingElement(declaration) || policy.ast.is.IsArrowFunction(declaration) || policy.ast.is.IsFunctionExpression(declaration)));
  const grouping = selectCsharpSourceArgumentGrouping(source, sourceNativeParameters, sourceArgumentParameterTypes,
    policy.ast.arguments(source.use).length, exactArity);
  const callee = source.callee;
  const label = policy.ast.is.IsIdentifier(callee) ? policy.ast.text(callee).slice(0, 96) : policy.ast.kindName(callee);
  return Object.freeze({ sourceParameterTypes, sourceArgumentParameterTypes,
    sourceArgumentGrouping: grouping.kind === "unresolved" ? Object.freeze({ ...grouping, reason: `${grouping.reason} Callee '${label}'.` }) : grouping,
  });
}
