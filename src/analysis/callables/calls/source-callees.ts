import type { SourceApplication } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpSourceCallableApplication } from "../../../target-model/records/callables/native-application.js";
import type { CsharpSourceCalleeSelection } from "../../../target-model/operations/source-callees.js";

export function classifyCsharpSourceCallee(
  policy: CsharpPolicyContext,
  source: SourceApplication,
  application: CsharpSourceCallableApplication,
): CsharpRepresentationOutcome<CsharpSourceCalleeSelection> {
  if (application.identity !== source.identity) {
    throw new TypeError("A physical Source callee requires the identical original application identity.");
  }
  const expression = source.callee.occurrence;
  const declaration = source.identity.signature.declaration;
  const module = declaration === undefined ? undefined : policy.moduleCallables.get(declaration);
  if (declaration !== undefined && (policy.ast.is.IsFunctionDeclaration(declaration) || module !== undefined)) {
    const implementation = module?.callable ?? declaration;
    if (!policy.facts.navigation.isProjectDeclaration(implementation)) return Object.freeze({
      kind: "native-refused", source: "tsonic-csharp", code: "CSHARP_SOURCE_CALLABLE_ABI_NOT_PROVEN", site: expression,
      message: "The original external function has no Native target relation or acquired physical callable implementation.",
    });
    return Object.freeze({ kind: "represented", value: Object.freeze({
      kind: "function", expression, declaration: implementation,
    }) });
  }
  if (declaration !== undefined &&
    (policy.ast.is.IsMethodDeclaration(declaration) || policy.ast.is.IsMethodSignatureDeclaration(declaration))) {
    if (source.receiver.kind === "value") {
      const member = policy.facts.objects.use(expression);
      if (member.kind === "refused") return Object.freeze({ kind: "source-refused", refusal: member });
      if (!member.value.callCallee || member.value.receiver.occurrence !== source.receiver.occurrence ||
        !member.value.readDeclarations.includes(declaration)) {
        throw new TypeError("A direct Native method requires its exact same-use original Source declaration and receiver.");
      }
      const receiver = policy.nativeValue(source.receiver.occurrence);
      if (receiver.kind !== "represented") return receiver;
      return Object.freeze({ kind: "represented", value: Object.freeze({
        kind: "method", expression, declaration,
        receiver: Object.freeze({ expression: source.receiver.occurrence, type: receiver.value }),
      }) });
    }
    if (source.receiver.kind === "type") {
      const owner = policy.projectTypes.catalog.definitionForDeclaration(source.receiver.declaration);
      if (owner === undefined) return Object.freeze({ kind: "native-refused", source: "tsonic-csharp",
        code: "CSHARP_SOURCE_METHOD_RECEIVER_ABI_NOT_PROVEN", site: expression,
        message: "The original static Source method has no actual Native declaring type." });
      const parameters = owner.typeParameterBindings.map(parameter => {
        if (parameter.csharpConstraints?.kind !== "resolved") throw new TypeError("A Native static owner requires its completed physical generic constraints.");
        return Object.freeze({ identity: parameter.identity, name: parameter.name,
          constraints: parameter.csharpConstraints.constraints,
          ...(parameter.csharpDeclaration === undefined ? {} : { declaration: parameter.csharpDeclaration }) });
      });
      const arguments_ = policy.representation.applyRequirements(parameters, source.identity, source.identity.invocation);
      if (arguments_.kind !== "represented") return arguments_;
      const receiver = policy.projectTypes.catalog.targetTypeForDeclaration(owner.declaration, arguments_.value);
      if (receiver === undefined) return Object.freeze({ kind: "native-refused", source: "tsonic-csharp",
        code: "CSHARP_SOURCE_METHOD_RECEIVER_ABI_NOT_PROVEN", site: expression,
        message: "The exact original static method owner has no complete Native type application." });
      return Object.freeze({ kind: "represented", value: Object.freeze({ kind: "method", expression, declaration,
        receiver: Object.freeze({ expression: source.callee.occurrence, type: receiver }) }) });
    }
  }
  return Object.freeze({ kind: "represented", value: Object.freeze({
    kind: "value", expression, type: application.carrier,
  }) });
}
