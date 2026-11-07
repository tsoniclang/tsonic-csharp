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
 * The native parameter vector of a source-owned call: the Host-selected signature slots (required, optional, rest)
 * with their instantiated parameter descriptors represented as storage. A CSHARP_ refusal of a parameter leaves the
 * vector unresolved; the refusal is reported where the parameter's storage is declared.
 */
function sourceCallNativeParameters(policy: CsharpPolicyContext, source: SourceCallSelection): readonly CsharpTargetParameter[] | undefined {
  const parameters: CsharpTargetParameter[] = [];
  for (const [index, descriptor] of source.parameters.entries()) {
    const slot = source.signatureParameters[index];
    const type = policy.types.represent(descriptor, source.use, "storage");
    if (slot === undefined || isCsharpRefusal(type)) return undefined;
    const name = policy.ast.name(slot.declaration);
    parameters.push(Object.freeze({
      name: name === undefined ? `arg${index}` : policy.ast.text(name),
      passingMode: "by-value" as const,
      optional: slot.kind === "optional",
      paramsArray: slot.kind === "rest",
      type,
    }));
  }
  return Object.freeze(parameters);
}

export function classifyCsharpSourceCallArguments(
  policy: CsharpPolicyContext,
  source: SourceCallSelection,
  sourceCall: CsharpSourceCallArgumentClassification["sourceCall"],
  sourceMethodValue: CsharpSourceCallArgumentClassification["sourceMethodValue"],
): Pick<CsharpSourceCallArgumentClassification,
  "sourceParameterTypes" | "sourceArgumentParameterTypes" | "sourceArgumentGrouping"> {
  const sourceNativeParameters = sourceCallNativeParameters(policy, source);
  const sourceParameterTypes = Object.freeze(source.parameters.map(descriptor => {
    const type = policy.types.represent(descriptor, source.use, "storage");
    return isCsharpRefusal(type) ? undefined : type;
  }));
  const sourceArgumentParameterTypes = Object.freeze(source.arguments.map(binding => {
    const parameter = sourceNativeParameters?.[binding.parameterIndex];
    return parameter === undefined ? undefined : csharpSourceArgumentExpectedType(parameter, csharpArgumentSourceForm(binding.mode));
  }));
  const declaration: Node | undefined = policy.facts.navigation.identity.target(source.callee)?.declaration ?? source.declaration;
  const exactArity = sourceMethodValue === undefined && (sourceCall?.kind === "value" || declaration !== undefined &&
    (policy.ast.is.IsVariableDeclaration(declaration) || policy.ast.is.IsParameterDeclaration(declaration) ||
      policy.ast.is.IsPropertyDeclaration(declaration) || policy.ast.is.IsPropertySignatureDeclaration(declaration) ||
      policy.ast.is.IsBindingElement(declaration) || policy.ast.is.IsArrowFunction(declaration) || policy.ast.is.IsFunctionExpression(declaration)));
  const grouping = selectCsharpSourceArgumentGrouping(source, sourceNativeParameters, sourceArgumentParameterTypes, exactArity);
  const callee = source.callee;
  const label = policy.ast.is.IsIdentifier(callee) ? policy.ast.text(callee).slice(0, 96) : policy.ast.kindName(callee);
  return Object.freeze({ sourceParameterTypes, sourceArgumentParameterTypes,
    sourceArgumentGrouping: grouping.kind === "unresolved" ? Object.freeze({ ...grouping, reason: `${grouping.reason} Callee '${label}'.` }) : grouping,
  });
}
