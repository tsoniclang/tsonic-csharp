import type { CsharpUnionCallClassification } from "../../target-model/records/calls/union-calls.js";
import type { Node } from "@tsonic/tsts";
import type { SourceCallSelection, SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpSourceArgumentPassingMode } from "../../source/extension/arguments.js";
import { csharpDelegateSignatureHasSupportedPassingModes, getCsharpCallableValueSignature } from "../../target-model/types/carriers/delegates.js";
import { selectCsharpConversion } from "../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { isCsharpRefusal } from "../../representation/index.js";
import { sourceSlot, sourceUnionRelation } from "../program/source-facts.js";

/**
 * A call on a closed union of project classes (`(A | B).m(x)`): the Host per-arm relation at the call names the method
 * each arm reaches (R1); C# only checks that every arm's instantiated native signature agrees with the call's carriers
 * and that each arm result converts to the joined result. Arms are positional in Host order (R6).
 */
export function classifyCsharpUnionCall(
  policy: CsharpPolicyContext,
  source: SourceCallSelection | undefined,
): CsharpUnionCallClassification {
  if (source === undefined || !policy.ast.is.IsPropertyAccessExpression(source.callee)) return { kind: "not-union" };
  const relation = sourceUnionRelation(policy.facts, source.use);
  if (relation?.kind !== "per-arm") return { kind: "not-union" };
  const property = policy.facts.selections.memberAccess(source.callee);
  if (property === undefined) return { kind: "not-union" };
  const receiverCarrier = policy.types.represent(property.receiverType, property.receiver, "value");
  if (isCsharpRefusal(receiverCarrier)) return { kind: "rejected", reason: receiverCarrier.message };
  const receiverType = receiverCarrier;
  if (getCsharpRuntimeUnionArms(receiverType, policy.typeDefinitions) === undefined) return { kind: "not-union" };
  const sum = policy.facts.sums.sum(relation.sum);
  const reject = (reason: string): CsharpUnionCallClassification => ({ kind: "rejected", reason });
  if (property.optionalChain ||
    source.arguments.some(argument => csharpSourceArgumentPassingMode(policy.sourceFacts, argument.argument) !== "by-value")) {
    return reject("Closed class-union calls require a present receiver and exact value-argument passing contracts.");
  }
  const parameterCarriers = source.parameters.map(parameter => policy.types.represent(parameter.type, source.use, "storage"));
  const resultCarrier = policy.types.value(source.use);
  const instantiation = policy.types.instantiation(source.use);
  const methodArguments = instantiation?.method ?? [];
  const refused = [...parameterCarriers, resultCarrier, ...methodArguments].find(isCsharpRefusal);
  if (refused !== undefined) return reject(refused.message);
  const parameterTypes = parameterCarriers as readonly TargetTypeRef[];
  const resultType = resultCarrier as TargetTypeRef;
  const methodBindings = instantiation?.instantiation.method ?? [];
  let armFailure: string | undefined;
  const refuseArm = (reason: string): undefined => {
    armFailure ??= reason;
    return undefined;
  };
  const methods = relation.arms.map(({ arm: index, member: declaration }) => {
    const armType = sum.arms[index]?.type;
    if (armType === undefined || declaration === undefined || !policy.ast.is.IsMethodDeclaration(declaration) ||
      policy.ast.hasModifierKind(declaration, "static")) return refuseArm("Each class-union arm must reach exactly one instance method.");
    const arm = policy.types.represent(armType, property.receiver, "value");
    if (isCsharpRefusal(arm) || policy.projectTypes.catalog.definitionForTarget(arm)?.kind !== "class")
      return refuseArm("Each class-union arm must be one project class carrier.");
    // The arm's method type instantiated by the arm's class arguments and the call's method binders (the sole Host substitution).
    const methodType = sourceSlot(policy.facts, declaration).type;
    const bindings = new Map<Node, SourceTypeDescriptor>(methodBindings.map(binding => [binding.declaration, binding.type] as const));
    if (armType.kind === "declared") {
      const owner = policy.ast.parent(declaration);
      const binders = owner === undefined ? [] : policy.ast.typeParameters(owner);
      binders.forEach((binder, position) => {
        const argument = armType.typeArguments[position];
        if (binder !== undefined && argument !== undefined) bindings.set(binder, argument);
      });
    }
    const instantiated = policy.types.represent(policy.facts.sums.substitute(methodType, bindings), declaration, "value");
    const signature = isCsharpRefusal(instantiated) ? undefined : getCsharpCallableValueSignature(instantiated);
    const name = policy.ast.name(declaration);
    const selectedName = name === undefined ? undefined : policy.facts.analyses.propertyName(name);
    if (signature === undefined || selectedName?.kind !== "resolved" || signature.parameters.length !== parameterTypes.length ||
      !csharpDelegateSignatureHasSupportedPassingModes(signature) || signature.returnPassing !== undefined ||
      signature.parameterPassingModes.some(mode => mode !== "by-value")) return refuseArm("Class-union incoming native signature, ref mode or parameter arity is not exact.");
    const parameters = policy.ast.parameters(declaration);
    if (parameters.some((parameter, index) => {
      const contract = source.signatureParameters[index];
      const parameterSyntax = parameter === undefined ? undefined : policy.ast.as.AsParameterDeclaration(parameter);
      if (contract === undefined || parameterSyntax === undefined ||
        (contract.kind === "rest") !== (parameterSyntax.DotDotDotToken !== undefined) ||
        (contract.kind === "rest") !== (signature.restParameterIndex === index) ||
        contract.kind === "optional" && !signature.optionalParameterIndexes?.includes(index)) return true;
      return !targetTypeRefEquals(parameterTypes[index]!, signature.parameters[index]!);
    })) return refuseArm("Class-union incoming native parameters do not match the selected argument contracts.");
    const armResult = signature.returnType;
    const resultElement = getCsharpNullableElementTargetType(resultType);
    if (!targetTypeRefEquals(resultType, armResult) &&
      (resultElement === undefined || !targetTypeRefEquals(resultElement, armResult)) &&
      getCsharpRuntimeUnionArms(resultElement ?? resultType, policy.typeDefinitions) === undefined)
      return refuseArm("Class-union result join requires an exact native carrier or selected union.");
    const conversion = selectCsharpConversion(policy, armResult, resultType, "implicit");
    if (!csharpConversionIsApplicable(conversion, "implicit"))
      return refuseArm(`Class-union result conversion is not proven. ${conversion.kind === "rejected" || conversion.kind === "ambiguous" ? conversion.reason : conversion.kind}`);
    return Object.freeze({ arm, declaration, targetName: selectedName.name,
      result: Object.freeze({ nativeType: armResult, selectedType: armResult }), conversion });
  });
  return methods.some(method => method === undefined) ? reject(armFailure ?? "Each selected class-union arm must identify one method with the same exact native argument and result contract.") : {
    kind: "resolved", receiver: property.receiver, receiverType, resultType,
    parameterTypes: Object.freeze([...parameterTypes]),
    methods: Object.freeze(methods as NonNullable<typeof methods[number]>[]),
  };
}
