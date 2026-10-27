import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import { AsParameterDeclaration, HasSourceKind, KindIdentifier, sourceCallableValueParameters } from "@tsonic/target-api/source";
import type { SourceFileSemantics, SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpNullableTargetType, getCsharpCallableValueSignature } from "../../../policy/types/index.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpProjectForwardingConstructor } from "../../../target-model/records/types/project-types.js";
import type { SourceCallableSourceContract, CsharpSourceCallableParameterContract, SourceCallableContract, CsharpSourceCallParameterContract } from "../../../target-model/records/callables/source-callable-contract.js";
import type { ResolvedSourceCallInfo } from "../../../target-model/records/calls/source-calls.js";
import { csharpDelegateSignatureHasSupportedPassingModes } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/program/declarations.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpGenericProjectionIndex } from "../../../target-model/records/types/type-projections.js";
import type { CsharpSourceNameResolver } from "../../names/index.js";
import { csharpSourceTypeParameter } from "../../../source/extension/type-parameters.js";
import { csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";

export function selectCsharpSourceCallableAbi(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declarations: CsharpDeclarationClassifications,
  names: CsharpSourceNameResolver,
  declaration: Node,
  sourceFile: SourceFile,
  projections: CsharpGenericProjectionIndex,
  contextualInputs: readonly (TargetTypeRef | undefined)[] | undefined,
): SourceCallableSourceContract | undefined {
  const checked = policy.semantics(sourceFile).types.declarationSignatureInfo(declaration);
  const valueParameters = sourceCallableValueParameters(policy.ast, declaration, policy.semantics(sourceFile));
  if (checked === undefined || valueParameters === undefined) return undefined;
  const accessor = policy.ast.is.IsGetAccessorDeclaration(declaration) || policy.ast.is.IsSetAccessorDeclaration(declaration);
  const returnContract = declarations.returnContract.get(declaration);
  const returnType = policy.ast.is.IsSetAccessorDeclaration(declaration) ? csharpVoidTargetType() : evidence.generatorTargetType.get(declaration) ??
    (returnContract?.kind === "resolved" ? returnContract.type : undefined) ??
    getCsharpCallableValueSignature(evidence.contextualTargetType.get(declaration))
      ?.returnType ??
    constructorReturnType(policy, declaration, sourceFile) ??
    (accessor || policy.ast.body(declaration) === undefined ? policy.types.resolveType(checked.returnType, sourceFile) : undefined);
  if (returnType === undefined) {
    return undefined;
  }
  const nativeParameters: CsharpSourceCallableParameterContract[] = [];
  for (const [index, parameterNode] of valueParameters.entries()) {
    const parameters = sourceParameterContracts(
      policy,
      evidence,
      declarations,
      names,
      parameterNode,
      index,
      contextualInputs?.[index],
      checked.parameters.find(parameter => parameter.declaration === parameterNode)?.acceptsOmission,
    );
    if (parameters === undefined) {
      return undefined;
    }
    nativeParameters.push(...parameters);
  }
  const methodTypeParameterIdentities = policy.ast.typeParameters(declaration).map(
    (parameter) => parameter === undefined ? undefined : csharpSourceTypeParameter(parameter, policy.ast)?.identity,
  );
  if (
    methodTypeParameterIdentities.some((name) =>
      name === undefined || name.length === 0
    ) ||
    new Set(methodTypeParameterIdentities).size !== methodTypeParameterIdentities.length
  ) {
    return undefined;
  }
  const owner = sourceCallableReceiverTypeOwner(policy, declaration);
  return Object.freeze({
    kind: "source",
    sourceDeclaration: declaration,
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: Object.freeze(
      [...methodTypeParameterIdentities as string[], ...projections.genericProjection.get(declaration).map(parameter => parameter.identity)],
    ),
    methodAllowsRefLikeTypeArguments: Object.freeze([
      ...methodTypeParameterIdentities.map(() => false), ...projections.genericProjection.get(declaration).map(() => false),
    ]),
    ...(owner === undefined ? {} : { receiverTypeOwner: owner }) }),
    parameters: valueParameters,
    nativeParameters: Object.freeze(nativeParameters),
    returnType,
  });
}

function sourceParameterContracts(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceEvidenceIndex,
  declarations: CsharpDeclarationClassifications,
  names: CsharpSourceNameResolver,
  parameterNode: Node | undefined,
  parameterIndex: number,
  contextualInput: TargetTypeRef | undefined,
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
  const typeSubject = parameter.Type ?? parameter.name;
  const selectedType = contextualInput ?? (typeSubject === undefined
    ? undefined
    : evidence.nodeTargetType.get(typeSubject));
  if (selectedType === undefined) {
    return undefined;
  }
  const questionToken = policy.ast.questionToken(parameterNode);
  const runtimeDefault = declarations.runtimeDefault.get(parameterNode);
  const incomingType: TargetTypeRef = runtimeDefault?.parameterType ??
    (questionToken === undefined ? selectedType : csharpNullableTargetType(selectedType));
  const declaration = policy.ast.parent(parameterNode);
  if (declaration === undefined) return undefined;
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
  if (parameter.DotDotDotToken !== undefined && targetType.kind === "tuple") {
    const types = policy.semanticsFor(parameterNode).types;
    const sourceType = types.expressionType(parameterNode);
    const elements = sourceType === undefined ? undefined : types.tupleElementInfos(sourceType);
    if (elements === undefined || elements.length !== targetType.elements.length) return undefined;
    return Object.freeze(targetType.elements.map((type, index) => Object.freeze({ sourceParameter: parameterNode,
      targetParameter: Object.freeze({ name: `${name}${index}`, type, passingMode: "by-value" as const,
        ...(elements[index]!.elementKind === "optional" ? { optional: true } : {}),
        ...(elements[index]!.elementKind === "rest" || elements[index]!.elementKind === "variadic" ? { paramsArray: true } : {}),
      }),
    })));
  }
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
  return Object.freeze([Object.freeze({ sourceParameter: parameterNode, targetParameter })]);
}

function constructorReturnType(
  policy: CsharpPolicyContext,
  declaration: Node,
  sourceFile: SourceFile,
): TargetTypeRef | undefined {
  if (!policy.ast.is.IsConstructorDeclaration(declaration)) {
    return undefined;
  }
  const parent = policy.ast.parent(declaration);
  return parent === undefined
    ? undefined
    : policy.types.resolveType(policy.semantics(sourceFile).declarations.declaredType(parent), sourceFile);
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
        sourceParameter: parameter.parameterDeclaration,
        targetParameter: constructor.targetMember.parameters[index]!,
      }),
    )),
    returnType: declaringType,
  };
  return constructor.source.declaration === undefined
    ? Object.freeze({ ...common, kind: "native" })
    : Object.freeze({ ...common, kind: "source", sourceDeclaration: constructor.source.declaration,
        parameters: Object.freeze(constructor.source.parameters.map(parameter => parameter.parameterDeclaration)) });
}

export function selectCsharpSourceCallableValueAbi(input: {
  readonly ast: AstReader;
  readonly navigation: Pick<SourceProgramNavigation, "isProjectDeclaration">;
  readonly semantics: SourceFileSemantics;
  readonly source: ResolvedSourceCallInfo;
  readonly carrier: TargetTypeRef;
}): SourceCallableContract | undefined {
  const { ast, navigation, semantics, source, carrier } = input;
  const signature = getCsharpCallableValueSignature(carrier);
  const declaration = semantics.declarations.signatureDeclaration(source.selectedSignature);
  const slots = semantics.operations.callParameterSlots(source);
  if (signature === undefined || slots === undefined ||
      !csharpDelegateSignatureHasSupportedPassingModes(signature) ||
      signature.parameters.length !== slots.length) return undefined;
  const nativeParameters: CsharpSourceCallParameterContract[] = [];
  const optionalParameters = new Set(signature.optionalParameterIndexes ?? []);
  for (const [index, type] of signature.parameters.entries()) {
    const slot = slots[index];
    const parameter = slot === undefined ? undefined : source.sourceSelectedSignatureParameters.find(parameter =>
      parameter.parameterIndex === slot.sourceParameterIndex);
    if (parameter === undefined || slot === undefined ||
        optionalParameters.has(index) !== (slot.form === "optional") ||
        (signature.restParameterIndex === index) !== (slot.form === "rest")) return undefined;
    nativeParameters.push(Object.freeze({
      ...(parameter.parameterDeclaration === undefined ? {} : { sourceParameter: parameter.parameterDeclaration }),
      targetParameter: Object.freeze({ name: slot.sourceParameterName, type, passingMode: signature.parameterPassingModes[index]!,
        optional: optionalParameters.has(index), paramsArray: signature.restParameterIndex === index }),
    }));
  }
  const common = {
    nativeSignature: Object.freeze({ methodTypeParameterIdentities: getCsharpMethodValue(carrier)?.typeParameters ?? Object.freeze([]),
      methodAllowsRefLikeTypeArguments: getCsharpMethodValue(carrier)?.allowsRefLikeTypeArguments ?? Object.freeze([]) }),
    returnType: signature.returnType,
  };
  if (declaration === undefined || !navigation.isProjectDeclaration(declaration)) {
    return Object.freeze({ ...common, kind: "native", nativeParameters: Object.freeze(nativeParameters),
      ...(declaration === undefined ? {} : { sourceDeclaration: declaration }) });
  }
  const parameters = sourceCallableValueParameters(ast, declaration, semantics,
    { kind: "selected-invocation", signature: source.selectedSignature });
  if (parameters === undefined) return undefined;
  const sourceNativeParameters: CsharpSourceCallableParameterContract[] = [];
  for (const parameter of nativeParameters) {
    if (parameter.sourceParameter === undefined) return undefined;
    sourceNativeParameters.push(Object.freeze({ sourceParameter: parameter.sourceParameter, targetParameter: parameter.targetParameter }));
  }
  return Object.freeze({ ...common, kind: "source", sourceDeclaration: declaration,
    parameters, nativeParameters: Object.freeze(sourceNativeParameters) });
}
