import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import { AsParameterDeclaration, HasSourceKind, KindIdentifier, isSourceCallableBodyBoundary, sourceCallableValueParameters } from "@tsonic/target-api/source";
import type { SourceFileSemantics, SourceProgramNavigation } from "@tsonic/target-api/source";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import { csharpNullableTargetType, getCsharpCallableValueSignature, getCsharpNullableElementTargetType, csharpCarrierAdmitsSourceAbsence,
  targetTypeRefEquals } from "../../../policy/types/index.js";
import type { CsharpTargetParameter, TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpProjectForwardingConstructor } from "../../../target-model/records/types/project-types.js";
import type { SourceCallableSourceContract, CsharpSourceCallableParameterContract, CsharpSourceParameterClassifications,
  CsharpSourceParameterPublication, SourceCallableContract, CsharpSourceCallParameterContract } from "../../../target-model/records/callables/source-callable-contract.js";
import type { ResolvedSourceCallInfo } from "../../../target-model/records/calls/source-calls.js";
import { csharpDelegateSignatureHasSupportedPassingModes } from "../../../target-model/types/carriers/delegates.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type { CsharpDeclarationClassifications } from "../../../target-model/records/program/declarations.js";
import type { CsharpSourceEvidenceIndex } from "../../../target-model/records/program/source-evidence.js";
import type { CsharpGenericProjectionIndex } from "../../../target-model/records/types/type-projections.js";
import type { CsharpSourceNameResolver } from "../../names/index.js";
import { csharpSourceTypeParameter } from "../../../source/extension/type-parameters.js";
import { csharpVoidTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { selectCsharpSourceParameterVector } from "../../../policy/types/callables/parameter-vector.js";
import { csharpExceptionTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { classifyCsharpSourceProfileType } from "../../../policy/identities/source-types.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetSourceProgram } from "@tsonic/target-api/source";
import type { SourceErrorDeclarationQueries } from "@tsonic/target-api/analysis";
import type { CsharpSourceParameterDeclarationEvidence } from "../../source-evidence/analyze.js";
import { selectCsharpParameterDefaultContext } from "../../declarations/parameter-default-context.js";
import { csharpRuntimeParameterDefault } from "../../../policy/types/storage/parameter-defaults.js";
import { selectCsharpDefaultValueContract } from "../../../policy/types/objects/binding-projection.js";
import type { CsharpDefaultParameterContract } from "../../../target-model/records/program/declarations.js";

export function createCsharpSourceParameterProducer(
  source: TargetSourceProgram,
  policy: CsharpPolicyContext,
  names: CsharpSourceNameResolver,
  declarations: CsharpSourceParameterDeclarationEvidence,
  errors: SourceErrorDeclarationQueries,
) {
  const registered = new Map<Node, { readonly declaration: Node; readonly index: number; readonly type: import("@tsonic/tsts").Type;
    readonly acceptsOmission: boolean; readonly baseException: boolean }>();
  const published = new Map<Node, CsharpSourceParameterPublication>();
  const active = new Set<Node>();
  let closed = false;
  for (const declaration of source.navigation.nodes) {
    if (!source.navigation.isProjectDeclaration(declaration)) continue;
    if (!isSourceCallableBodyBoundary(policy.ast, declaration) && !policy.ast.is.IsMethodSignatureDeclaration(declaration) &&
        !policy.ast.is.IsCallSignatureDeclaration(declaration) && !policy.ast.is.IsConstructSignatureDeclaration(declaration) &&
        !policy.ast.is.IsFunctionTypeNode(declaration) && !policy.ast.is.IsConstructorTypeNode(declaration)) continue;
    const queries = source.semantics.forNode(declaration);
    const signature = queries.types.declarationSignatureInfo(declaration);
    if (signature === undefined) continue;
    const parameters = sourceCallableValueParameters(policy.ast, declaration, queries, { kind: "declaration" });
    if (parameters === undefined) continue;
    for (const [index, parameter] of parameters.entries()) {
      const checked = signature.parameters.find(slot => slot.declaration === parameter);
      const type = checked?.type;
      const present = type === undefined ? undefined : queries.types.nonNullableType(type);
      const identity = present === undefined ? undefined : classifyCsharpSourceProfileType(present, queries, policy.ast);
      if (identity?.kind !== "error") continue;
      if (checked === undefined || type === undefined) failTargetAnalysisInvariant("tsonic-csharp",
        "A source Error parameter requires its original checked declaration signature slot.", parameter);
      registered.set(parameter, { declaration, index, type, acceptsOmission: checked.acceptsOmission,
        baseException: identity.baseException });
    }
  }
  const records: CsharpSourceParameterClassifications = Object.freeze({ get(parameter: Node) {
    const cached = published.get(parameter);
    if (cached !== undefined) return cached;
    const registration = registered.get(parameter);
    if (registration === undefined) return undefined;
    if (closed || active.has(parameter)) return failTargetAnalysisInvariant("tsonic-csharp",
      "A native Error parameter requires one completed declaration-owned input before body resolution.", parameter);
    active.add(parameter);
    try {
      const queries = source.semantics.forNode(parameter);
      const selected = policy.types.resolveSelectedType(policy.ast.typeNode(parameter), registration.type, queries.sourceFile);
      const requirement = errors.parameterFor(parameter);
      if (selected === undefined || requirement.kind !== "resolved") return failTargetAnalysisInvariant("tsonic-csharp",
        requirement.kind === "unresolved" ? requirement.reason : "The checked Error parameter has no native declaration contract.", parameter);
      const implementation = policy.ast.body(registration.declaration) !== undefined ? undefined
        : source.navigation.callableImplementation(registration.declaration);
      const implementationDeclaration = implementation?.kind === "resolved" ? implementation.implementation.declaration : undefined;
      const implementationParameter = implementationDeclaration === undefined || implementationDeclaration === registration.declaration
        ? undefined : sourceCallableValueParameters(policy.ast, implementationDeclaration, source.semantics.forNode(implementationDeclaration))?.[registration.index];
      const implementationRegistration = implementationParameter === undefined ? undefined : registered.get(implementationParameter);
      const implementationInput = implementationParameter !== undefined && registration.baseException &&
        implementationRegistration?.baseException === true && queries.types.isIdentical(registration.type, implementationRegistration.type)
        ? records.get(implementationParameter) : undefined;
      const context = selectCsharpParameterDefaultContext(policy, declarations, registration.declaration);
      const contextualInput = context === undefined || context.restParameterIndex !== undefined && registration.index >= context.restParameterIndex
        ? undefined : context.parameters[registration.index];
      const exception = registration.baseException && requirement.value.access === "read-only" && contextualInput === undefined
        ? policy.providers.publishNativeIdentities(csharpExceptionTargetType()) : undefined;
      if (exception !== undefined && exception.kind !== "resolved") return failTargetAnalysisInvariant("tsonic-csharp",
        "A readonly Error parameter requires its exact native Exception metadata owner.", parameter);
      const declared = contextualInput ?? implementationInput?.bodyType ?? (exception?.kind === "resolved" ? exception.value : selected);
      const nullable = getCsharpNullableElementTargetType(selected) !== undefined || policy.ast.questionToken(parameter) !== undefined;
      const valueType = nullable && getCsharpNullableElementTargetType(declared) === undefined ? csharpNullableTargetType(declared) : declared;
      const runtimeDefault = selectCsharpSourceParameterDefault(policy, declarations, parameter, valueType);
      const incoming = runtimeDefault?.parameterType ?? valueType;
      const bodyType = runtimeDefault?.valueType ?? incoming;
      const contracts = sourceParameterEntries(policy, names, parameter, registration.index, incoming,
        runtimeDefault?.acceptsOmission ?? registration.acceptsOmission);
      if (contracts === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
        "A checked Error parameter requires its complete native name and scalar input contract.", parameter);
      const result = Object.freeze({ nativeParameters: contracts, bodyType,
        ...(runtimeDefault === undefined ? {} : { runtimeDefault }) });
      published.set(parameter, result);
      return result;
    } finally { active.delete(parameter); }
  } });
  return Object.freeze({ records, seal(): void {
    if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Native source parameters publish once before body evidence.");
    for (const parameter of registered.keys()) records.get(parameter);
    closed = true;
  } });
}

export function selectCsharpSourceParameterDefault(
  policy: CsharpPolicyContext,
  evidence: CsharpSourceParameterDeclarationEvidence,
  node: Node,
  selected: TargetTypeRef,
): CsharpDefaultParameterContract | undefined {
  const parameter = policy.ast.as.AsParameterDeclaration(node);
  if (parameter?.Initializer === undefined) return undefined;
  const owner = policy.ast.parent(node);
  const signature = owner === undefined ? undefined : selectCsharpParameterDefaultContext(policy, evidence, owner);
  const parameters = owner === undefined ? undefined : sourceCallableValueParameters(policy.ast, owner, policy.semanticsFor(owner));
  const index = parameters?.indexOf(node) ?? -1;
  const incoming = index < 0 || signature?.restParameterIndex !== undefined && index >= signature.restParameterIndex
    ? undefined : signature?.parameters[index];
  const value = incoming === undefined ? undefined : getCsharpNullableElementTargetType(incoming);
  const source = evidence.expressionType.get(parameter.Initializer);
  const queries = policy.semanticsFor(node);
  const members = source === undefined ? [] : queries.types.isUnion(source) ? queries.types.unionOrIntersectionTypes(source) : [source];
  const presentInitializer = members.length > 0 && members.every(member =>
    member !== undefined && !queries.types.isNullish(member) && !queries.types.isAny(member) && !queries.types.isUnknown(member));
  const presentOnly = incoming !== undefined && !csharpCarrierAdmitsSourceAbsence(incoming) &&
    signature?.optionalParameterIndexes?.includes(index) !== true;
  const contextualDefault = incoming === undefined ? undefined : presentOnly
    ? Object.freeze({ kind: "present" as const, valueType: incoming, parameterType: incoming })
    : csharpRuntimeParameterDefault(incoming, incoming);
  const runtimeDefault = incoming === undefined ? csharpRuntimeParameterDefault(selected)
    : contextualDefault === undefined ? undefined : Object.freeze({ ...contextualDefault,
      valueType: parameter.Type === undefined && value !== undefined && presentInitializer ? value : selected });
  if (runtimeDefault === undefined) return undefined;
  const slot = owner === undefined ? undefined : queries.types.declarationSignatureInfo(owner)
    ?.parameters.find(parameter => parameter.declaration === node);
  if (slot === undefined) return failTargetAnalysisInvariant("tsonic-csharp",
    "A native parameter default requires its exact checked declaration slot.", node);
  const native = selectCsharpDefaultValueContract(runtimeDefault.parameterType, runtimeDefault.valueType, false);
  const absentInitializer = source !== undefined && queries.types.isNullish(source) &&
    (policy.ast.kindName(parameter.Initializer) === "KindNullKeyword" ||
      policy.ast.is.IsIdentifier(parameter.Initializer) && policy.navigation.sourceReferenceFor(parameter.Initializer) === undefined);
  return Object.freeze({ ...runtimeDefault, acceptsOmission: presentOnly ? false : slot.acceptsOmission, native,
    passthrough: (presentOnly || (native.kind === "value" || absentInitializer) && !native.normalize) &&
      targetTypeRefEquals(native.source, native.target) });
}

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
    getCsharpCallableValueSignature(evidence.contextualType.get(declaration)?.targetType)
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
  const published = evidence.sourceParameters.get(parameterNode);
  if (published !== undefined) return published.nativeParameters;
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
  const targetType: TargetTypeRef = runtimeDefault?.parameterType ??
    (questionToken === undefined ? selectedType : csharpNullableTargetType(selectedType));
  return sourceParameterEntries(policy, names, parameterNode, parameterIndex, targetType,
    runtimeDefault?.acceptsOmission ?? acceptsOmission);
}

function sourceParameterEntries(
  policy: CsharpPolicyContext,
  names: CsharpSourceNameResolver,
  parameterNode: Node,
  parameterIndex: number,
  targetType: TargetTypeRef,
  acceptsOmission: boolean | undefined,
): readonly CsharpSourceCallableParameterContract[] | undefined {
  const parameter = AsParameterDeclaration(policy.ast, parameterNode);
  if (parameter === undefined) return undefined;
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
    ...(parameter.DotDotDotToken === undefined && acceptsOmission === true
      ? { optional: true }
      : {}),
    ...(parameter.DotDotDotToken === undefined
      ? {}
      : { paramsArray: true }),
  });
  const types = policy.semanticsFor(parameterNode).types;
  const sourceType = parameter.DotDotDotToken !== undefined && targetType.kind === "tuple"
    ? types.expressionType(parameterNode) : undefined;
  const vector = selectCsharpSourceParameterVector(targetParameter,
    sourceType === undefined ? undefined : types.tupleElementInfos(sourceType));
  return vector === undefined ? undefined : Object.freeze(vector.map(targetParameter =>
    Object.freeze({ sourceParameter: parameterNode, targetParameter })));
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
