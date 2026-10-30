import type { CsharpUnionCallClassification } from "../../target-model/records/calls/union-calls.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { ResolvedSourceCallInfo } from "../../target-model/records/calls/source-calls.js";
import { asSourceNode, sourceCallableValueParameters } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../policy/model/context.js";
import { getCsharpRuntimeUnionArms } from "../../target-model/types/carriers/runtime-carriers.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../target-model/types/equality.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import { csharpSourceArgumentPassingMode } from "../../source/extension/arguments.js";
import { substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { csharpSourceTypeParameter } from "../../source/extension/type-parameters.js";
import { csharpDelegateSignatureHasSupportedPassingModes, getCsharpCallableValueSignature, getCsharpTaskResultTargetType } from "../../target-model/types/carriers/delegates.js";
import type { CsharpSourceCallResult } from "../../target-model/operations/source-call-results.js";
import { selectCsharpConversion } from "../../policy/conversions/core.js";
import { csharpConversionIsApplicable } from "../../policy/conversions/applicability.js";
import { completeCsharpSourceCallAdoption } from "../source-evidence/types/resolution/call-results.js";

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
  const selectedProperty = semantics.types.propertyInfos(property.receiver.type).filter(info => info.symbol === property.selectedSymbol);
  const declarations = [...semantics.facts.selectedSubjects(property.selectedSymbol, property.selectedDeclaration),
    ...selectedProperty.flatMap(info => info.rootSymbols.flatMap(symbol => semantics.declarations.symbolDeclarations(symbol)))]
    .flatMap(subject => {
      const node = asSourceNode(subject, policy.ast);
      return node !== undefined && policy.navigation.isProjectDeclaration(node) ? [node] : [];
    });
  const parameterTypes = source.sourceSelectedSignatureParameters.map((_, index) => policy.types.resolveSourceCallParameter(source, index, sourceFile, "callable"));
  const resultType = policy.types.resolveSourceCallResult(source, sourceFile, undefined)?.selectedType;
  const typeArguments = policy.types.resolveSourceCallTypeArguments(source, sourceFile);
  if (resultType === undefined || typeArguments === undefined || parameterTypes.some(type => type === undefined)) return reject("Closed class-union call arguments and result require exact target carriers.");
  let armFailure: string | undefined;
  const refuseArm = (reason: string): undefined => {
    armFailure ??= reason;
    return undefined;
  };
  const methods = arms.map(arm => {
    const owners = new Set<Node>();
    const pending = [arm];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const type = pending.pop()!;
      const key = targetTypeRefKey(type);
      if (visited.has(key)) continue;
      visited.add(key);
      const definition = policy.projectTypes.catalog.definitionForTarget(type);
      if (definition !== undefined) owners.add(definition.declaration);
      pending.push(...(policy.projectTypes.directSupertypes(type) ?? []));
    }
    const candidates = [...new Set(declarations)].filter(declaration => {
      if (policy.ast.kindName(declaration) !== "KindMethodDeclaration" || policy.ast.hasModifierKind(declaration, "static")) return false;
      const owner = policy.projectTypes.catalog.definitionContainingDeclaration(declaration);
      return owner !== undefined && owners.has(owner.declaration);
    });
    if (candidates.length !== 1) return refuseArm(`Class-union candidate cardinality is ${candidates.length}; exactly one method is required.`);
    const declaration = candidates[0]!;
    const name = policy.ast.name(declaration);
    const selectedName = name === undefined ? undefined : policy.semanticsFor(name).propertyNames.get(name);
    const parameters = sourceCallableValueParameters(policy.ast, declaration, policy.semanticsFor(declaration));
    const file = policy.ast.getSourceFile(declaration);
    const signature = file === undefined ? undefined
      : getCsharpCallableValueSignature(policy.types.resolveNode(declaration, file)?.type);
    if (selectedName?.kind !== "resolved" || parameters === undefined || parameters.length !== parameterTypes.length ||
      signature === undefined || !csharpDelegateSignatureHasSupportedPassingModes(signature) ||
      signature.parameters.length !== parameters.length || signature.returnPassing !== undefined ||
      signature.parameterPassingModes.some(mode => mode !== "by-value")) return refuseArm("Class-union incoming native signature, ref mode or parameter arity is not exact.");
    const typeParameters = policy.ast.typeParameters(declaration).map(parameter =>
      parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, policy.ast));
    if (typeParameters.length !== typeArguments.length || typeParameters.some(parameter => parameter === undefined))
      return refuseArm(`Class-union formal type-argument count is ${typeParameters.length}, selected count is ${typeArguments.length}, and every formal must be exact.`);
    const substitutions = new Map(typeParameters.map((parameter, index) =>
      [parameter!.identity, typeArguments[index]!] as const));
    const instantiate = (member: Node, type: TargetTypeRef | undefined) => {
      if (type === undefined) return undefined;
      const value = policy.projectTypes.instantiateMemberType(member, arm,
        substituteTargetTypeParameters(type, substitutions));
      return value.kind === "resolved" ? value.type : undefined;
    };
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
      const actual = instantiate(parameter, signature.parameters[index]);
      return expected === undefined || actual === undefined || !targetTypeRefEquals(expected, actual);
    })) return refuseArm("Class-union incoming native parameters do not match the selected checked argument contracts.");
    const actualResult = instantiate(declaration, signature.returnType);
    if (actualResult === undefined) return refuseArm("Class-union result join is missing its exact instantiated native result carrier.");
    const nativeResult: CsharpSourceCallResult = Object.freeze({ nativeType: actualResult, selectedType: actualResult });
    const result = getCsharpTaskResultTargetType(actualResult) !== undefined && policy.ast.body(declaration) !== undefined
      ? completeCsharpSourceCallAdoption(policy, nativeResult) : nativeResult;
    const resultElement = getCsharpNullableElementTargetType(resultType);
    if (result === undefined || !targetTypeRefEquals(result.nativeType, actualResult))
      return refuseArm(`Class-union result completion is not exact: native='${targetTypeRefKey(actualResult)}', completed='${result === undefined ? "missing" : targetTypeRefKey(result.selectedType)}', result='${targetTypeRefKey(resultType)}'.`);
    if (!targetTypeRefEquals(resultType, result.selectedType) &&
      (resultElement === undefined || !targetTypeRefEquals(resultElement, result.selectedType)) &&
      getCsharpRuntimeUnionArms(resultElement ?? resultType, policy.typeDefinitions) === undefined)
      return refuseArm(`Class-union result join has no exact native carrier or selected union: native='${targetTypeRefKey(actualResult)}', completed='${targetTypeRefKey(result.selectedType)}', result='${targetTypeRefKey(resultType)}'.`);
    const conversion = selectCsharpConversion(policy, result.selectedType, resultType, "implicit");
    if (!csharpConversionIsApplicable(conversion, "implicit"))
      return refuseArm(`Class-union result conversion is not proven: native='${targetTypeRefKey(actualResult)}', completed='${targetTypeRefKey(result.selectedType)}', result='${targetTypeRefKey(resultType)}'. ${conversion.kind === "rejected" || conversion.kind === "ambiguous" ? conversion.reason : conversion.kind}`);
    return Object.freeze({ arm, declaration, targetName: selectedName.name, result, conversion });
  });
  return methods.some(method => method === undefined) ? reject(armFailure ?? "Each selected class-union arm must identify one method with the same exact native argument and result contract.") : {
    kind: "resolved", receiver: property.receiver.expression, receiverType, resultType,
    parameterTypes: Object.freeze(parameterTypes as TargetTypeRef[]),
    methods: Object.freeze(methods as NonNullable<typeof methods[number]>[]),
  };
}
