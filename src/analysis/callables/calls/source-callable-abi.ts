import type { AstReader, Node } from "@tsonic/tsts";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import { AsParameterDeclaration, HasSourceKind, KindIdentifier } from "@tsonic/target-api/source";
import type { SourceCallSelection, SourceProgramFacts } from "@tsonic/target-api/source";
import { csharpSignatureParameters } from "./signature-parameters.js";
import { sourceCallSelection, sourceValueType } from "../../program/source-facts.js";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpNullableTargetType, getCsharpCallableValueSignature } from "../../../policy/types/index.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpProjectForwardingConstructor } from "../../../target-model/records/types/project-types.js";
import type { SourceCallableSourceContract, CsharpSourceCallableParameterContract, SourceCallableContract, CsharpSourceCallParameterContract, CsharpSourceCallableNativeSignature } from "../../../target-model/records/callables/source-callable-contract.js";
import { csharpDelegateSignatureHasSupportedPassingModes, getCsharpLambdaSignature } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/program/declarations.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpGenericProjectionIndex } from "../../../target-model/records/types/type-projections.js";
import type { CsharpSourceNameResolver } from "../../names/index.js";
import { csharpSourceTypeParameter } from "../../../source/extension/type-parameters.js";
import { selectCsharpSourceParameterVector } from "../../../policy/types/callables/parameter-vector.js";
import type { CsharpTargetOperationClassifications } from "../../../target-model/records/operations/operations.js";
import { completeCsharpContextualInputs } from "./contextual-inputs.js";
import type { CsharpConversionClassifications } from "../../../target-model/records/operations/conversions.js";
import { getCsharpRuntimeUnionArms } from "../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpCallableValueType } from "../../../policy/types/callables/value-type.js";
import { csharpConversionIsApplicable } from "../../../policy/conversions/applicability.js";
import type { CsharpCallableReturnSelection } from "../../../target-model/records/callables/callable-values.js";
import { sourceTypeDescriptorStructure } from "@tsonic/target-api/source";

export function selectCsharpSourceCallableGenericAbi(
  ast: AstReader,
  declaration: Node,
): Pick<CsharpSourceCallableNativeSignature, "methodTypeParameterIdentities" | "methodAllowsRefLikeTypeArguments"> | undefined {
  const parameters = ast.typeParameters(declaration).map(parameter =>
    parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, ast)?.identity);
  if (parameters.some(identity => identity === undefined || identity.length === 0) ||
      new Set(parameters).size !== parameters.length) return undefined;
  const identities: string[] = [];
  for (const identity of parameters) {
    if (identity === undefined) return undefined;
    identities.push(identity);
  }
  return Object.freeze({
    methodTypeParameterIdentities: Object.freeze(identities),
    methodAllowsRefLikeTypeArguments: Object.freeze(identities.map(() => false)),
  });
}

export function selectCsharpSourceCallableAbi(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declarations: CsharpDeclarationClassifications,
  names: CsharpSourceNameResolver,
  declaration: Node,
  projections: CsharpGenericProjectionIndex,
  operations: Pick<CsharpTargetOperationClassifications, "selectedCall" | "selectedConstruction">,
  conversions: Pick<CsharpConversionClassifications, "conversion">,
  issues: TargetDiagnostic[],
  recordReturn: (declaration: Node, selection: CsharpCallableReturnSelection) => void,
): SourceCallableSourceContract | undefined {
  const signatureParameters = csharpSignatureParameters(policy.ast, declaration);
  if (signatureParameters === undefined) return undefined;
  const valueParameters = signatureParameters.map(parameter => parameter.declaration);
  const contextual = evidence.contextualType.get(declaration);
  let inputType = contextual?.targetType;
  // A callable passed as a call argument takes the selected parameter carrier of its argument correspondence.
  const argument = policy.facts.analyses.callArgument(declaration);
  if (argument !== undefined) {
    const bindingIndex = sourceCallSelection(policy.facts, argument.call).arguments.findIndex(entry => entry.argument === argument.argument);
    const operation = policy.ast.is.IsNewExpression(argument.call)
      ? operations.selectedConstruction.get(argument.call) : operations.selectedCall.get(argument.call);
    inputType = operation?.sourceArgumentParameterTypes?.[bindingIndex];
    if (inputType === undefined) return undefined;
  }
  const presentInput = getCsharpNullableElementTargetType(inputType) ?? inputType;
  const arms = presentInput === undefined ? undefined : getCsharpRuntimeUnionArms(presentInput, policy.typeDefinitions);
  let callableArms: readonly TargetTypeRef[] | undefined;
  if (arms !== undefined) {
    const callables = arms.filter(arm => {
      const signature = getCsharpLambdaSignature(arm);
      if (signature === undefined) return false;
      return valueParameters.every((parameterNode, index) => {
        const parameter = AsParameterDeclaration(policy.ast, parameterNode);
        return parameter !== undefined &&
          (parameter.DotDotDotToken !== undefined || signatureParameters[index]!.acceptsOmission ||
            index < signature.parameters.length || signature.restParameterIndex !== undefined && index >= signature.restParameterIndex);
      });
    });
    if (callables.length > 1) {
      callableArms = callables;
      inputType = undefined;
    } else inputType = callables[0];
  } else inputType = presentInput;
  const returnContract = declarations.returnContract.get(declaration);
  const generator = evidence.generatorTargetType.get(declaration);
  const representedReturn = policy.types.callableReturn(declaration);
  if (representedReturn.kind === "csharp-refused") issues.push(Object.freeze({ code: representedReturn.code, category: "error" as const,
    source: "tsonic-csharp", sourceNode: representedReturn.site, message: representedReturn.message }));
  const published = representedReturn.kind === "csharp-refused" ? undefined : representedReturn;
  const declared = returnContract?.kind === "resolved" ? returnContract.type : undefined;
  recordReturn(declaration, Object.freeze({ generator, published, returnContract: declared,
    returnContractKind: returnContract === undefined ? "absent" : returnContract.kind,
    returnContractReason: returnContract?.kind === "rejected" ? returnContract.reason : undefined }));
  const returnType = evidence.generator.get(declaration) === undefined ? published : generator;
  if (returnType === undefined) {
    return undefined;
  }
  const nativeParameters: CsharpSourceCallableParameterContract[] = [];
  for (const [index, parameterNode] of valueParameters.entries()) {
    const parameters = sourceParameterContracts(
      policy,
      declarations,
      names,
      parameterNode,
      index,
      signatureParameters[index]!.acceptsOmission,
    );
    if (parameters === undefined) {
      return undefined;
    }
    nativeParameters.push(...parameters);
  }
  const genericAbi = selectCsharpSourceCallableGenericAbi(policy.ast, declaration);
  if (genericAbi === undefined) return undefined;
  const owner = sourceCallableReceiverTypeOwner(policy, declaration);
  const contract: SourceCallableSourceContract = Object.freeze({
    kind: "source",
    sourceDeclaration: declaration,
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: Object.freeze(
      [...genericAbi.methodTypeParameterIdentities, ...projections.genericProjection.get(declaration).map(parameter => parameter.identity)],
    ),
    methodAllowsRefLikeTypeArguments: Object.freeze([
      ...genericAbi.methodAllowsRefLikeTypeArguments, ...projections.genericProjection.get(declaration).map(() => false),
    ]),
    ...(owner === undefined ? {} : { receiverTypeOwner: owner }) }),
    parameters: valueParameters,
    nativeParameters: Object.freeze(nativeParameters),
    returnType,
  });
  if (callableArms !== undefined) {
    const intrinsic = csharpCallableValueType(contract);
    const admitted = intrinsic === undefined ? [] : callableArms.filter(arm => {
      const conversion = conversions.conversion.get(intrinsic, arm, "implicit");
      return conversion !== undefined && csharpConversionIsApplicable(conversion, "implicit");
    });
    if (admitted.length !== 1) return undefined;
    inputType = admitted[0];
  }
  return completeCsharpContextualInputs(policy, inputType, conversions, contract, issues);
}

function sourceParameterContracts(
  policy: CsharpPolicyContext,
  declarations: CsharpDeclarationClassifications,
  names: CsharpSourceNameResolver,
  parameterNode: Node | undefined,
  parameterIndex: number,
  acceptsOmission: boolean | undefined,
): readonly CsharpSourceCallableParameterContract[] | undefined {
  if (parameterNode === undefined) {
    return undefined;
  }
  const parameter = AsParameterDeclaration(policy.ast, parameterNode);
  if (parameter === undefined) {
    return undefined;
  }
  if (parameter.DotDotDotToken === undefined && acceptsOmission === undefined) return undefined;
  const declaration = policy.ast.parent(parameterNode);
  if (declaration === undefined) return undefined;
  const published = { type: sourceValueType(policy.facts, parameterNode) };
  const represented = policy.types.represent(published.type, parameterNode, "storage");
  if (represented.kind === "csharp-refused") return undefined;
  const selectedType = represented;
  const questionToken = policy.ast.questionToken(parameterNode);
  const runtimeDefault = declarations.runtimeDefault.get(parameterNode);
  const incomingType: TargetTypeRef = runtimeDefault?.parameterType ??
    (questionToken === undefined ? selectedType : csharpNullableTargetType(selectedType));
  const native = policy.objectShapes.resolveNativeParameter(declaration, parameterNode, incomingType);
  if (native.kind === "rejected") return undefined;
  const targetType = native.type;
  const resolvedName = HasSourceKind(
      policy.ast,
      parameter.name,
      KindIdentifier,
    )
    ? names.resolve(parameter.name)
    : undefined;
  if (HasSourceKind(policy.ast, parameter.name, KindIdentifier) && resolvedName?.kind !== "resolved") return undefined;
  const name = resolvedName?.kind === "resolved"
    ? resolvedName.name
    : `__tsonic_param${parameterIndex}`;
  const targetParameter: CsharpTargetParameter = Object.freeze({
    name,
    type: targetType,
    passingMode: "by-value",
    ...(parameter.DotDotDotToken === undefined && (runtimeDefault?.acceptsOmission ?? acceptsOmission) === true
      ? { optional: true }
      : {}),
    ...(parameter.DotDotDotToken === undefined
      ? {}
      : { paramsArray: true }),
  });
  const descriptor = sourceTypeDescriptorStructure(published.type);
  const vector = selectCsharpSourceParameterVector(targetParameter,
    parameter.DotDotDotToken !== undefined && descriptor.kind === "tuple"
      ? descriptor.elements.map(element => ({ elementKind: element.kind })) : undefined);
  return vector === undefined ? undefined : Object.freeze(vector.map(targetParameter =>
    Object.freeze({ sourceParameter: parameterNode, targetParameter })));
}

function sourceCallableReceiverTypeOwner(
  policy: CsharpPolicyContext,
  declaration: Node,
): Node | undefined {
  if (policy.ast.hasModifierKind(declaration, "static")) return undefined;
  const parent = policy.ast.parent(declaration);
  return parent !== undefined &&
      (
        policy.ast.is.IsClassDeclaration(parent) ||
        policy.ast.is.IsClassExpression(parent) ||
        policy.ast.is.IsInterfaceDeclaration(parent)
      )
    ? parent
    : undefined;
}

export function selectCsharpProjectConstructorAbi(
  constructor: CsharpProjectForwardingConstructor,
): SourceCallableContract | undefined {
  const declaringType = constructor.targetMember.declaringType;
  if (
    declaringType === undefined ||
    constructor.source.parameters.length !==
      constructor.targetMember.parameters.length
  ) {
    return undefined;
  }
  const common = {
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: Object.freeze([]),
    methodAllowsRefLikeTypeArguments: Object.freeze([]),
    receiverTypeOwner: constructor.definition.declaration }),
    nativeParameters: Object.freeze(constructor.source.parameters.map(
      (parameter, index) => Object.freeze({
        sourceParameter: parameter.declaration ?? failTargetAnalysisInvariant("tsonic-csharp",
          "A forwarded project constructor parameter requires its declaration.", constructor.definition.declaration),
        targetParameter: constructor.targetMember.parameters[index]!,
      }),
    )),
    returnType: declaringType,
  };
  return constructor.source.declaration === undefined
    ? Object.freeze({ ...common, kind: "native" })
    : Object.freeze({ ...common, kind: "source", sourceDeclaration: constructor.source.declaration,
        parameters: Object.freeze(constructor.source.parameters.map(parameter => parameter.declaration ?? failTargetAnalysisInvariant(
          "tsonic-csharp", "A forwarded project constructor parameter requires its declaration.", constructor.definition.declaration))) });
}

export function selectCsharpSourceCallableValueAbi(input: {
  readonly ast: AstReader;
  readonly facts: SourceProgramFacts;
  readonly source: SourceCallSelection;
  readonly carrier: TargetTypeRef;
}): SourceCallableContract | undefined {
  const { ast, facts, source, carrier } = input;
  const signature = getCsharpCallableValueSignature(carrier);
  const declaration = source.signature;
  const slots = csharpSignatureParameters(ast, declaration);
  if (signature === undefined || slots === undefined ||
      !csharpDelegateSignatureHasSupportedPassingModes(signature) ||
      signature.parameters.length !== slots.length) return undefined;
  const nativeParameters: CsharpSourceCallParameterContract[] = [];
  const optionalParameters = new Set(signature.optionalParameterIndexes ?? []);
  for (const [index, type] of signature.parameters.entries()) {
    const slot = slots[index];
    if (slot === undefined ||
        optionalParameters.has(index) !== (slot.form === "optional") ||
        (signature.restParameterIndex === index) !== (slot.form === "rest")) return undefined;
    nativeParameters.push(Object.freeze({
      sourceParameter: slot.declaration,
      targetParameter: Object.freeze({ name: slot.name ?? `__tsonic_param${index}`, type, passingMode: signature.parameterPassingModes[index]!,
        optional: optionalParameters.has(index), paramsArray: signature.restParameterIndex === index }),
    }));
  }
  const common = {
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: getCsharpMethodValue(carrier)?.typeParameters ?? Object.freeze([]),
      methodAllowsRefLikeTypeArguments: getCsharpMethodValue(carrier)?.allowsRefLikeTypeArguments ?? Object.freeze([]) }),
    returnType: signature.returnType,
  };
  if (!facts.navigation.identity.isProjectDeclaration(declaration)) {
    return Object.freeze({ ...common, kind: "native", nativeParameters: Object.freeze(nativeParameters), sourceDeclaration: declaration });
  }
  const parameters = slots.map(slot => slot.declaration);
  const sourceNativeParameters: CsharpSourceCallableParameterContract[] = [];
  for (const parameter of nativeParameters) {
    if (parameter.sourceParameter === undefined) return undefined;
    sourceNativeParameters.push(Object.freeze({ sourceParameter: parameter.sourceParameter, targetParameter: parameter.targetParameter }));
  }
  return Object.freeze({ ...common, kind: "source", sourceDeclaration: declaration,
    parameters, nativeParameters: Object.freeze(sourceNativeParameters) });
}
