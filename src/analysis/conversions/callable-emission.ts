import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import { createHash } from "node:crypto";
import type { CsharpConversionSelection } from "../../target-model/conversions/selection.js";
import type { CsharpObjectShapeFact, CsharpObjectShapeMemberFact, TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpDelegateContractProducer } from "../program/records/callables/callable-conversions.js";
import { getCsharpCallableValueSignature, getCsharpDelegateSignature } from "../../target-model/types/carriers/delegates.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { getCsharpNullableElementTargetType } from "../../target-model/types/carriers/nullable.js";
import { isCsharpVoidTargetType } from "../../target-model/types/identity.js";
import type { AstReader, Node } from "@tsonic/tsts";
import type { CsharpCaptureStorage } from "../../target-model/records/callables/capture-storage.js";
import type { CsharpConversionIssue } from "../../target-model/records/operations/conversions.js";
import { selectCsharpTypeEmission } from "../../policy/types/resolution/type-emission.js";
import type { CsharpDelegateContractRecords, CsharpNativeDelegateExtraction } from "../../target-model/records/callables/callable-conversions.js";
import { scopedTargetTypeRefKey, targetTypeRefEquals } from "../../target-model/types/equality.js";
import { csharpSourceMemberKeyParts } from "../../target-model/types/source-member-keys.js";
import { inferCsharpTargetTypeParameterBindings, substituteTargetTypeParameters } from "../../policy/types/resolution/substitution.js";
import { csharpDelegateSignaturesMatchNativeBinding } from "../../target-model/types/carriers/delegates.js";
import type { CsharpObjectShapeClassifications } from "../../target-model/records/objects/object-shapes.js";
import { csharpFreeTypeParameterIdentities, visitCsharpTargetTypeParameters } from "../../target-model/types/generic-references.js";
import { objectShapeMethodInvocationName } from "../../target-model/names/object-members.js";

export function admitCsharpDelegateEmission(producer: CsharpDelegateContractProducer,
  source: TargetTypeRef, target: TargetTypeRef, selected: CsharpConversionSelection,
  objectShapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">): void {
  if (selected.kind === "nullable-map") { admitCsharpDelegateEmission(producer, selected.sourceElement, selected.targetElement, selected.conversion, objectShapes); return; }
  if (selected.kind === "provider-argument-adapter") {
    admitCsharpDelegateEmission(producer, source, selected.adapter.inputType, selected.sourceToInput, objectShapes);
    admitCsharpDelegateEmission(producer, selected.adapter.resultType, target, selected.resultToTarget, objectShapes);
    return;
  }
  if (selected.kind !== "delegate-adapter" || producer.records.delegateContract.get(source, target) !== undefined) return;
  producer.requireOpen();
  const sourceMethod = getCsharpMethodValue(source);
  const sourceSignature = sourceMethod !== undefined && sourceMethod.typeParameters.length !== 0
    ? getCsharpDelegateSignature(selected.instantiation?.contract) : getCsharpCallableValueSignature(source);
  const targetSignature = getCsharpDelegateSignature(target);
  if (sourceSignature === undefined || targetSignature === undefined)
    failTargetAnalysisInvariant("tsonic-csharp", "An admitted delegate conversion requires its exact native source and destination signatures.");
  const targetCarrier = getCsharpNullableElementTargetType(target) ?? target;
  const methodTypeArguments = Object.freeze([...(selected.instantiation?.typeArguments ?? [])]);
  const nativeExtraction = sourceMethod === undefined || selected.strategy !== "native-binding" ? undefined
    : admitCsharpNativeDelegateExtraction(sourceMethod, sourceSignature, targetCarrier, methodTypeArguments, objectShapes);
  producer.publish(source, target, { sourceSignature, targetSignature, targetCarrier, nativeExtraction,
    ...(selected.instantiation === undefined ? {} : { methodTypeArguments: selected.instantiation.typeArguments }),
    sourceVoid: isCsharpVoidTargetType(sourceSignature.returnType), targetVoid: isCsharpVoidTargetType(targetSignature.returnType) });
  for (const [index, conversion] of selected.parameterConversions.entries()) {
    const input = targetSignature.parameters[index];
    const output = sourceSignature.parameters[index];
    if (input !== undefined && output !== undefined) admitCsharpDelegateEmission(producer, input, output, conversion, objectShapes);
  }
  if (selected.returnConversion.kind !== "void-return")
    admitCsharpDelegateEmission(producer, sourceSignature.returnType, targetSignature.returnType, selected.returnConversion, objectShapes);
}

function admitCsharpNativeDelegateExtraction(source: NonNullable<ReturnType<typeof getCsharpMethodValue>>,
  sourceSignature: CsharpNativeDelegateExtraction["sourceSignature"], targetCarrier: TargetTypeRef, methodTypeArguments: readonly TargetTypeRef[],
  objectShapes: Pick<CsharpObjectShapeClassifications, "resolveTarget">): CsharpNativeDelegateExtraction {
  const shape = objectShapes.resolveTarget(source.owner);
  const template = shape?.declarationTemplate ?? shape;
  const owner = template?.targetType ?? source.owner;
  if (template === undefined && source.owner.kind === "target-named" && (source.owner.typeArguments?.length ?? 0) !== 0)
    failTargetAnalysisInvariant("tsonic-csharp", "A generic native extraction requires its exact checked owner declaration template.");
  const parameters = new Map<string, Extract<TargetTypeRef, { readonly kind: "type-parameter" }>>();
  visitCsharpTargetTypeParameters(owner, parameter => parameters.set(parameter.identity, parameter));
  const bindings = inferCsharpTargetTypeParameterBindings(owner, source.owner, new Set(parameters.keys()));
  if (bindings === undefined || [...parameters.keys()].some(identity => !bindings.has(identity)))
    failTargetAnalysisInvariant("tsonic-csharp", "A native extraction requires its exact selected owner argument bindings.");
  const reverse = new Map<string, TargetTypeRef>();
  const ambiguous = new Set<string>();
  for (const [identity, argument] of bindings) {
    if (argument.kind !== "type-parameter" || ambiguous.has(argument.identity)) continue;
    const parameter = parameters.get(identity)!;
    const previous = reverse.get(argument.identity);
    if (previous !== undefined && !targetTypeRefEquals(previous, parameter)) {
      reverse.delete(argument.identity);
      ambiguous.add(argument.identity);
    } else reverse.set(argument.identity, parameter);
  }
  const members = template?.members.filter(member => member.memberKind === "method" &&
    (member.targetName === source.method || objectShapeMethodInvocationName(member) === source.method));
  if (members !== undefined && members.length !== 1)
    failTargetAnalysisInvariant("tsonic-csharp", "A native extraction requires one exact declared owner member.");
  const member = members?.[0];
  const methodParameters = member === undefined ? source.typeParameters : (member.typeParameters ?? []).map(parameter => parameter.identity);
  if (methodParameters.length !== methodTypeArguments.length)
    failTargetAnalysisInvariant("tsonic-csharp", "A native extraction requires its exact closed method invocation arguments.");
  const invocationArguments = Object.freeze(methodTypeArguments.map(argument => substituteTargetTypeParameters(argument, reverse)));
  const invocation = substituteTargetTypeParameters(member?.type ?? source.contract,
    new Map(methodParameters.map((identity, index) => [identity, invocationArguments[index]!])));
  const selectedInvocation = substituteTargetTypeParameters(invocation, bindings);
  const destination = targetTypeRefEquals(selectedInvocation, targetCarrier) ? invocation
    : substituteTargetTypeParameters(targetCarrier, reverse);
  const signature = getCsharpDelegateSignature(invocation);
  const selectedSignature = getCsharpDelegateSignature(selectedInvocation);
  const targetSignature = getCsharpDelegateSignature(destination);
  if (signature === undefined || selectedSignature === undefined || targetSignature === undefined ||
    !csharpDelegateSignaturesMatchNativeBinding(selectedSignature, sourceSignature) ||
    !targetTypeRefEquals(substituteTargetTypeParameters(destination, bindings), targetCarrier) ||
    !csharpDelegateSignaturesMatchNativeBinding(signature, targetSignature) ||
    [...csharpFreeTypeParameterIdentities([invocation, destination, ...invocationArguments])].some(identity => !parameters.has(identity)))
    failTargetAnalysisInvariant("tsonic-csharp", "A native extraction requires its destination and invocation in the actual native owner's declaration scope.");
  const scoped = new Map([...parameters.keys()].map((identity, index) => [identity, index]));
  const name = `__tsonic_native_delegate_${createHash("sha256").update(JSON.stringify([source.identity,
    invocationArguments.map(argument => scopedTargetTypeRefKey(argument, scoped)), scopedTargetTypeRefKey(destination, scoped)])).digest("hex")}`;
  return Object.freeze({ memberIdentity: source.identity, owner, method: source.method, name, valueName: `${name}Value`,
    targetCarrier: destination, sourceSignature: signature, methodTypeArguments: invocationArguments });
}

export function csharpNativeDelegateExtractionsForOwner(owner: TargetTypeRef,
  records: CsharpDelegateContractRecords["delegateContract"]): readonly CsharpNativeDelegateExtraction[] {
  const values = new Map<string, CsharpNativeDelegateExtraction>();
  for (const extraction of records.nativeExtractions()) {
    const parameters = csharpFreeTypeParameterIdentities([extraction.owner]);
    const bindings = inferCsharpTargetTypeParameterBindings(extraction.owner, owner, parameters);
    if (bindings === undefined) continue;
    if ([...parameters].some(identity => !bindings.has(identity)) ||
      !targetTypeRefEquals(substituteTargetTypeParameters(extraction.owner, bindings), owner))
      failTargetAnalysisInvariant("tsonic-csharp", "A native getter requires the complete bindings of its exact owning declaration.");
    values.set(extraction.name, Object.freeze({ ...extraction, owner,
      targetCarrier: substituteTargetTypeParameters(extraction.targetCarrier, bindings),
      sourceSignature: Object.freeze({ ...extraction.sourceSignature,
        parameters: Object.freeze(extraction.sourceSignature.parameters.map(parameter => substituteTargetTypeParameters(parameter, bindings))),
        returnType: substituteTargetTypeParameters(extraction.sourceSignature.returnType, bindings) }),
      methodTypeArguments: Object.freeze(extraction.methodTypeArguments.map(argument => substituteTargetTypeParameters(argument, bindings))) }));
  }
  return Object.freeze([...values.values()]);
}

export function selectCsharpNativeDelegateExtractions(shape: CsharpObjectShapeFact,
  member: CsharpObjectShapeMemberFact, records: CsharpDelegateContractRecords["delegateContract"]): readonly CsharpNativeDelegateExtraction[] {
  if (member.memberKind !== "method") return Object.freeze([]);
  const identity = JSON.stringify(csharpSourceMemberKeyParts(member.sourceKey));
  const values = new Map<string, CsharpNativeDelegateExtraction>();
  for (const extraction of [...csharpNativeDelegateExtractionsForOwner(shape.targetType, records),
    ...(member.methodValueContract === undefined ? [] : csharpNativeDelegateExtractionsForOwner(member.methodValueContract, records))]) {
    if (extraction.memberIdentity !== identity) continue;
    const parameters = member.typeParameters ?? [];
    if (parameters.length !== extraction.methodTypeArguments.length)
      failTargetAnalysisInvariant("tsonic-csharp", "A native delegate extraction requires its exact selected method quantifiers.");
    const signature = getCsharpDelegateSignature(substituteTargetTypeParameters(member.type,
      new Map(parameters.map((parameter, index) => [parameter.identity, extraction.methodTypeArguments[index]!]))));
    if (signature === undefined || !csharpDelegateSignaturesMatchNativeBinding(signature, extraction.sourceSignature))
      failTargetAnalysisInvariant("tsonic-csharp", "A native delegate extraction requires its exact original member invocation signature.");
    if (shape.members.some(candidate => candidate.targetName === extraction.name || candidate.targetName === extraction.valueName))
      failTargetAnalysisInvariant("tsonic-csharp", "A native delegate extraction must not collide with an authored member.");
    values.set(extraction.name, extraction);
  }
  return Object.freeze([...values.values()]);
}

export function csharpCallableNativeDelegateExtractions(type: TargetTypeRef,
  records: CsharpDelegateContractRecords["delegateContract"]): readonly CsharpNativeDelegateExtraction[] {
  const selected = getCsharpMethodValue(type);
  if (selected === undefined) return Object.freeze([]);
  const values = new Map(csharpNativeDelegateExtractionsForOwner(selected.owner, records).filter(extraction => extraction.memberIdentity === selected.identity &&
    extraction.method === selected.method)
    .map(extraction => [extraction.name, extraction]));
  return Object.freeze([...values.values()]);
}

export function admitCsharpDelegateOperand(ast: AstReader, captures: CsharpCaptureStorage, producer: CsharpDelegateContractProducer,
  node: Node, source: TargetTypeRef, target: TargetTypeRef, selection: CsharpConversionSelection): readonly CsharpConversionIssue[] {
  if (selection.kind !== "delegate-adapter") return [];
  const contract = producer.records.delegateContract.get(source, target)
    ?? failTargetAnalysisInvariant("tsonic-csharp", "An admitted delegate operand requires its exact native conversion contract.", node);
  const refuse = (message: string): readonly CsharpConversionIssue[] => [{ node, code: "CSHARP_UNSUPPORTED_AST", message }];
  if (!selectCsharpTypeEmission({ carrier: source }) || !selectCsharpTypeEmission({ carrier: contract.targetCarrier }))
    return refuse("C# delegate adaptation requires exact renderable source and target signatures.");
  if (contract.targetSignature.parameters.some(carrier => !selectCsharpTypeEmission({ carrier })))
    return refuse("C# delegate adaptation requires renderable exact target parameter types.");
  const lambda = (ast.is.IsArrowFunction(node) || ast.is.IsFunctionExpression(node)) && captures.captureClosure.get(node) === undefined &&
    captures.lambdaCreation.get(node).kind === "inline";
  if (lambda && selection.strategy === "native-binding" && (contract.sourceSignature.returnPassing !== undefined ||
    contract.sourceSignature.parameterPassingModes.some(mode => mode !== "by-value")))
    return refuse("A by-reference native delegate binding requires an exact native method group or delegate value.");
  if (lambda && (!selectCsharpTypeEmission({ carrier: contract.sourceSignature.returnType }) ||
    contract.sourceSignature.parameters.some(carrier => !selectCsharpTypeEmission({ carrier }))))
    return refuse("An adapted lambda requires its exact native function parameters and return type.");
  return [];
}
