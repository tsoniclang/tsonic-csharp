import type { CsharpUnionCallClassification } from "../../target-model/records/calls/union-calls.js";
import type { SourceFile } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo } from "../../target-model/records/calls/source-calls.js";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpSourceArgumentPassingMode } from "../../source/extension/arguments.js";
import { csharpDelegateSignatureHasSupportedPassingModes } from "../../target-model/types/carriers/delegates.js";
import { selectCsharpConversion } from "../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { selectCsharpUnionCallMethods } from "../source-evidence/types/resolution/union-call-methods.js";

export function classifyCsharpUnionCall(
  policy: CsharpPolicyContext,
  source: ResolvedSourceCallInfo | undefined,
  sourceFile: SourceFile,
): CsharpUnionCallClassification {
  if (source === undefined || !policy.ast.is.IsPropertyAccessExpression(source.sourceCallee.expression)) return { kind: "not-union" };
  const semantics = policy.semantics(sourceFile);
  const property = semantics.operations.propertyAccess(source.sourceCallee.expression);
  if (property === undefined) return { kind: "not-union" };
  const receiverType = policy.types.resolveSelectedValue(property.receiver.expression, property.receiver.type, sourceFile);
  const arms = getCsharpRuntimeUnionArms(receiverType, policy.typeDefinitions);
  if (arms === undefined || receiverType === undefined ||
    arms.some(arm => policy.projectTypes.catalog.definitionForTarget(arm)?.kind !== "class")) return { kind: "not-union" };
  const reject = (reason: string): CsharpUnionCallClassification => ({ kind: "rejected", reason });
  if (property.optionalChain ||
    source.sourceArguments.some(argument => csharpSourceArgumentPassingMode(policy.sourceFacts, argument.expression) !== "by-value")) {
    return reject("Closed class-union calls require a present receiver and exact value-argument passing contracts.");
  }
  const parameterTypes = source.sourceSelectedSignatureParameters.map((_, index) => policy.types.resolveSourceCallParameter(source, index, sourceFile, "callable"));
  const resultType = policy.types.resolveSourceCallResult(source, sourceFile, undefined)?.selectedType;
  const typeArguments = policy.types.resolveSourceCallTypeArguments(source, sourceFile);
  if (resultType === undefined || typeArguments === undefined || parameterTypes.some(type => type === undefined)) return reject("Closed class-union call arguments and result require exact target carriers.");
  const selectedMethods = selectCsharpUnionCallMethods(policy, property, arms, typeArguments,
    (declaration, file) => policy.types.resolveNode(declaration, file)?.sourceResult?.selectedType);
  if (selectedMethods.kind === "rejected") return reject(selectedMethods.reason);
  if (selectedMethods.kind === "incomplete-result")
    return reject("Class-union result completion requires the exact selected native result.");
  let armFailure: string | undefined;
  const refuseArm = (reason: string): undefined => {
    armFailure ??= reason;
    return undefined;
  };
  const methods = selectedMethods.methods.map(method => {
    const { arm, declaration, signature, parameters, nativeParameters, result } = method;
    const name = policy.ast.name(declaration);
    const selectedName = name === undefined ? undefined : policy.semanticsFor(name).propertyNames.get(name);
    if (selectedName?.kind !== "resolved" || parameters === undefined || parameters.length !== parameterTypes.length ||
      !csharpDelegateSignatureHasSupportedPassingModes(signature) ||
      signature.parameters.length !== parameters.length || signature.returnPassing !== undefined ||
      signature.parameterPassingModes.some(mode => mode !== "by-value")) return refuseArm("Class-union incoming native signature, ref mode or parameter arity is not exact.");
    if (parameters.some((parameter, index) => {
      if (parameter === undefined) return true;
      const contract = source.sourceSelectedSignatureParameters[index];
      const parameterSyntax = policy.ast.as.AsParameterDeclaration(parameter);
      if (contract === undefined || parameterSyntax === undefined ||
        contract.rest !== (parameterSyntax.DotDotDotToken !== undefined) ||
        contract.rest !== (signature.restParameterIndex === index) ||
        contract.acceptsOmission && !contract.rest &&
          !signature.optionalParameterIndexes?.includes(index)) return true;
      const expected = parameterTypes[index];
      const actual = nativeParameters?.[index];
      return expected === undefined || actual === undefined || !targetTypeRefEquals(expected, actual);
    })) return refuseArm("Class-union incoming native parameters do not match the selected checked argument contracts.");
    const resultElement = getCsharpNullableElementTargetType(resultType);
    if (!targetTypeRefEquals(resultType, result.selectedType) &&
      (resultElement === undefined || !targetTypeRefEquals(resultElement, result.selectedType)) &&
      getCsharpRuntimeUnionArms(resultElement ?? resultType, policy.typeDefinitions) === undefined)
      return refuseArm("Class-union result join requires an exact native carrier or selected union.");
    const conversion = selectCsharpConversion(policy, result.selectedType, resultType, "implicit");
    if (!csharpConversionIsApplicable(conversion, "implicit"))
      return refuseArm(`Class-union result conversion is not proven. ${conversion.kind === "rejected" || conversion.kind === "ambiguous" ? conversion.reason : conversion.kind}`);
    return Object.freeze({ arm, declaration, targetName: selectedName.name, result, conversion });
  });
  return methods.some(method => method === undefined) ? reject(armFailure ?? "Each selected class-union arm must identify one method with the same exact native argument and result contract.") : {
    kind: "resolved", receiver: property.receiver.expression, receiverType, resultType,
    parameterTypes: Object.freeze(parameterTypes as TargetTypeRef[]),
    methods: Object.freeze(methods as NonNullable<typeof methods[number]>[]),
  };
}
