import type { SourceFile } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { selectCsharpSourceArgumentGrouping } from "../../policy/operations/members/source-argument-groups.js";
import type { ResolvedSourceCallInfo } from "../../target-model/records/calls/source-calls.js";
import type { CsharpSourceCallArgumentClassification } from "../../target-model/records/operations/operations.js";
import type { CsharpTargetCallSelection } from "../../target-model/records/operations/member-selections.js";
import { csharpSourceArgumentExpectedType } from "../../target-model/types/member-facts.js";
import type { CsharpTypedLocationOperationSelection } from "../../target-model/records/storage/typed-locations.js";

export function classifyCsharpSourceCallArguments(
  policy: CsharpPolicyContext,
  source: ResolvedSourceCallInfo,
  sourceFile: SourceFile,
  sourceCall?: CsharpSourceCallArgumentClassification["sourceCall"],
  sourceMethodValue?: CsharpSourceCallArgumentClassification["sourceMethodValue"],
  native?: Extract<CsharpTargetCallSelection, { readonly kind: "resolved" }>,
  typedLocation?: CsharpTypedLocationOperationSelection,
): Pick<CsharpSourceCallArgumentClassification,
  "sourceParameterTypes" | "sourceArgumentParameterTypes" | "sourceArgumentGrouping"> {
  if (typedLocation?.kind === "location-bind" || typedLocation?.kind === "location-project" || typedLocation?.kind === "location-view") {
    return Object.freeze({ sourceArgumentParameterTypes: Object.freeze(source.sourceArgumentBindings.map(binding => {
      const expression = source.sourceArguments[binding.sourceArgumentIndex]?.expression;
      const arguments_ = typedLocation.arguments.filter(argument => argument.expression === expression);
      return binding.sourceForm === "value" && arguments_.length === 1 ? arguments_[0]!.type : undefined;
    })) });
  }
  if (native !== undefined) {
    const sourceArgumentParameterTypes = Object.freeze(source.sourceArgumentBindings.map(binding => {
      const arguments_ = native.call.arguments.filter(argument =>
        argument.sourceArgumentIndex === binding.sourceArgumentIndex &&
        argument.effectiveArgumentIndex === binding.effectiveArgumentIndex &&
        argument.sourceForm === binding.sourceForm && argument.spreadElementIndex === binding.spreadElementIndex);
      return arguments_.length === 1
        ? csharpSourceArgumentExpectedType(arguments_[0]!.targetParameter, binding.sourceForm) : undefined;
    }));
    return Object.freeze({ sourceArgumentParameterTypes });
  }
  const sourceNativeParameters = policy.types.resolveSourceCallParameters(source, sourceFile);
  const sourceParameterTypes = Object.freeze(source.sourceSelectedSignatureParameters.map((_, index) =>
    policy.types.resolveSourceCallParameter(source, index, sourceFile, "callable")));
  const sourceArgumentParameterTypes = Object.freeze(source.sourceArgumentBindings.map(binding =>
    policy.types.resolveSourceCallArgumentParameter(source, binding, sourceFile)));
  const declaration = policy.navigation.sourceReferenceFor(source.sourceCallee.expression)?.declaration ?? source.sourceCallee.declaration;
  const exactArity = sourceMethodValue === undefined && (sourceCall?.kind === "value" || declaration !== undefined &&
    (policy.ast.is.IsVariableDeclaration(declaration) || policy.ast.is.IsParameterDeclaration(declaration) ||
      policy.ast.is.IsPropertyDeclaration(declaration) || policy.ast.is.IsPropertySignatureDeclaration(declaration) ||
      policy.ast.is.IsBindingElement(declaration) || policy.ast.is.IsArrowFunction(declaration) || policy.ast.is.IsFunctionExpression(declaration)));
  const grouping = selectCsharpSourceArgumentGrouping(source, sourceNativeParameters, sourceArgumentParameterTypes,
    policy.semantics(sourceFile).operations.callParameterSlots(source), exactArity);
  const callee = source.sourceCallee.expression;
  const label = policy.ast.is.IsIdentifier(callee) ? policy.ast.text(callee).slice(0, 96) : policy.ast.kindName(callee);
  return Object.freeze({ sourceParameterTypes, sourceArgumentParameterTypes,
    sourceArgumentGrouping: grouping.kind === "unresolved" ? Object.freeze({ ...grouping, reason: `${grouping.reason} Callee '${label}'.` }) : grouping,
  });
}
