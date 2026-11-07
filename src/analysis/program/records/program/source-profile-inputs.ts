// Target inputs of one source-profile selection, from published facts only (nextgen C-2542, R2, I2, I6).
// Value, result and type-argument carriers are the one representation of Host descriptors; argument correspondence
// and parameters come from the Host call selection; type arguments from the Host instantiation.
import { csharpRegExpReceiverHasNativeExecution } from "../../../operations/source-profiles/js/regexp-execution.js";
import type { Node } from "@tsonic/tsts";
import type { SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpProviderCallSelectionHost } from "../../../../policy/model/provider-calls.js";
import type { CsharpRepresentation } from "../../../../representation/index.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import type {
  CsharpCustomRegExpProtocol,
  CsharpSourceProfileCallSource,
  CsharpSourceProfileInputFacts,
  CsharpSourceProfileInputRequirements,
  CsharpSourceProfileValue,
  CustomRegExpProtocolKind,
} from "../../../../target-model/records/program/source-profile-inputs.js";
import { isCsharpThrowableType } from "../../../project-types/throwable-types.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { getCsharpRuntimeUnionArms } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpDelegateSignature } from "../../../../target-model/types/carriers/delegates.js";
import { analyzeCsharpCustomRegExpProtocol } from "../../../operations/source-profiles/js/regexp-protocol.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../../policy/identities/selected-source.js";
import { csharpExceptionTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { isCsharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { namedTargetTypeImplicitlyAccepts } from "../../../../policy/conversions/carriers.js";
import type { CsharpCallArgumentProjection } from "../../../../target-model/records/objects/members.js";

/** A represented carrier; a .NET refusal has no carrier here and the selecting policy reports its own refusal. */
function carrier(representation: CsharpRepresentation): TargetTypeRef | undefined {
  return representation.kind === "csharp-refused" ? undefined : representation;
}

/** A C# type-parameter carrier constrained to INumber<T> of itself (its represented constraints; .NET only). */
function hasNumericConstraint(carrier: Extract<TargetTypeRef, { readonly kind: "type-parameter" }>): boolean {
  const constraints = carrier.csharpConstraints;
  return constraints?.kind === "resolved" && constraints.constraints.some(constraint =>
    constraint.kind === "type" && constraint.type.kind === "target-named" &&
    constraint.type.id === "System.Numerics.INumber`1" &&
    constraint.type.typeArguments?.[0]?.kind === "type-parameter" &&
    constraint.type.typeArguments[0].identity === carrier.identity);
}

/** A callable descriptor: a callable or a shape with call signatures (Host descriptor, never re-derived). */
function isCallableDescriptor(type: SourceTypeDescriptor): boolean {
  return type.kind === "callable" ? type.calls.length > 0 : type.kind === "shape" && type.calls.length > 0;
}

export function createCsharpSourceProfileInputs(
  host: CsharpProviderCallSelectionHost,
  sourceValues: readonly CsharpSourceProfileValue[],
  result: Node,
  requirements: CsharpSourceProfileInputRequirements = {},
  call?: CsharpSourceProfileCallSource,
): CsharpSourceProfileInputFacts {
  const nativeRegExpReceivers = new Set<Node>();
  const values = new Map<Node, TargetTypeRef | undefined>();
  const numericArguments = new Set<Node>();
  const throwableCarriers = new Set<TargetTypeRef>();
  const objectShapes = new Map<Node, CsharpObjectShapeFact | undefined>();
  const valueOf = (node: Node): TargetTypeRef | undefined => {
    if (!values.has(node)) values.set(node, carrier(host.types.value(node)));
    return values.get(node);
  };
  for (const value of sourceValues) {
    if (requirements.regexpExecution === true &&
      csharpRegExpReceiverHasNativeExecution(value.expression, { host })) nativeRegExpReceivers.add(value.expression);
    // A spread argument carries its operand's published type; both the spread element and its operand are inputs.
    const operand = host.ast.is.IsSpreadElement(value.expression) ? host.ast.as.AsSpreadElement(value.expression)?.Expression : undefined;
    if (operand !== undefined && !values.has(value.expression)) {
      values.set(value.expression, carrier(host.types.represent(value.type, value.expression, "value")));
      valueOf(operand);
    }
    const valueCarrier = valueOf(value.expression);
    const numeric = getCsharpNullableElementTargetType(valueCarrier) ?? valueCarrier;
    if (numeric?.kind === "type-parameter" && hasNumericConstraint(numeric)) {
      numericArguments.add(value.expression);
    }
    if (valueCarrier !== undefined && isCsharpThrowableType(host, valueCarrier)) throwableCarriers.add(valueCarrier);
    if (requirements.objectShapes === true && !objectShapes.has(value.expression)) objectShapes.set(value.expression,
      host.objectShapes?.resolveNode(value.expression) ?? host.objectShapes?.resolveTarget(valueCarrier));
  }
  const instantiation = call === undefined ? undefined : host.types.instantiation(call.call);
  const typeArguments = call === undefined ? [] : call.typeArguments.map((source, index) => Object.freeze({
    source,
    carrier: instantiation === undefined ? undefined : carrier(instantiation.method[index]!),
    parameter: carrier(host.types.represent({ kind: "declared", declaration: source.binder, typeArguments: [] },
      call.call, "type-argument")),
  }));
  const callTypeArguments = typeArguments.every(argument => argument.carrier !== undefined)
    ? Object.freeze(typeArguments.map(argument => argument.carrier!)) : undefined;
  const results = new Map<Node, TargetTypeRef | undefined>([[result, call === undefined
    ? carrier(host.types.value(result))
    : carrier(host.types.represent(call.selection.result, call.call, "value"))]]);
  const parameters = call === undefined ? [] : call.parameters.map((parameter, index) => {
    const declared = carrier(host.types.represent(parameter.type, call.call, "storage"));
    const present = getCsharpNullableElementTargetType(declared) ?? declared;
    const arms = getCsharpRuntimeUnionArms(present, host.typeDefinitions);
    if (arms === undefined) return declared;
    const bindings = call.bindings.filter(binding => binding.parameterIndex === index);
    if (bindings.length === 0) return declared;
    const binding = bindings.length === 1 ? bindings[0] : undefined;
    const argument = binding === undefined || binding.form !== "value" ? undefined
      : call.arguments.find(value => value.expression === binding.argument);
    if (argument === undefined) return undefined;
    if (!isCallableDescriptor(argument.type)) return declared;
    const callable = arms.map(arm => getCsharpNullableElementTargetType(arm) ?? arm)
      .filter(arm => getCsharpDelegateSignature(arm) !== undefined);
    return callable.length === 1 ? callable[0] : undefined;
  });
  const regexp = new Map<number, Map<CustomRegExpProtocolKind, CsharpCustomRegExpProtocol>>();
  const inputs: CsharpSourceProfileInputFacts = Object.freeze({
    errorCause: call !== undefined && requirements.errorCause === true && call.arguments[1] !== undefined
      ? analyzeCsharpErrorCauseArgument(host, call) : undefined,
    nativeRegExpReceivers,
    values: Object.freeze({ get: (node: Node | undefined) => node === undefined ? undefined : valueOf(node) }),
    results: Object.freeze({ get: (node: Node | undefined) => node === undefined ? undefined : results.get(node) }),
    typeArgument: Object.freeze({ get: (source: CsharpSourceProfileCallSource["typeArguments"][number]) =>
      typeArguments.find(argument => argument.source === source)?.carrier }),
    typeArguments: Object.freeze(typeArguments), numericArguments, throwableCarriers,
    objectShape: Object.freeze({ get: (node: Node | undefined) => node === undefined ? undefined : objectShapes.get(node) }),
    callTypeArguments, parameters: Object.freeze(parameters),
    regexpProtocol: Object.freeze({ get: (index: number, kind: CustomRegExpProtocolKind) => regexp.get(index)?.get(kind) }),
  });
  if (call !== undefined && requirements.regexpProtocol === true) {
    for (const [index] of call.arguments.entries()) {
      const selected = new Map<CustomRegExpProtocolKind, CsharpCustomRegExpProtocol>();
      for (const kind of ["match", "match-all", "replace", "search", "split"] as const) {
        const protocol = analyzeCsharpCustomRegExpProtocol({ host, source: call, inputs }, index, kind);
        if (protocol !== undefined) selected.set(kind, protocol);
      }
      regexp.set(index, selected);
    }
  }
  return inputs;
}

/**
 * `new Error(message, options)`: the `cause` member of the options value, located through Host facts (the selected
 * ErrorOptions.cause declaration, the object-literal element correspondence, the argument's published members),
 * projected to System.Exception.
 */
function analyzeCsharpErrorCauseArgument(
  host: CsharpProviderCallSelectionHost,
  call: CsharpSourceProfileCallSource,
): CsharpSourceProfileInputFacts["errorCause"] {
  const unresolved = (reason: string) => Object.freeze({ kind: "unresolved" as const, reason });
  const argument = call.arguments[1];
  const parameter = call.parameters[1];
  if (argument === undefined || parameter === undefined) return unresolved("An Error cause requires its selected options signature slot.");
  const optionsType = parameter.type.kind === "optional" ? parameter.type.value : parameter.type;
  const member = host.facts.objects.member(optionsType, { kind: "string", value: "cause" });
  const declaration = member?.declarations.length === 1 ? member.declarations[0] : undefined;
  const identity = csharpSourceProfileDeclarationIdentity(host.ast, host.facts, host.sourceFacts, declaration);
  if (declaration === undefined || identity?.kind !== "member" || identity.declaringName !== "ErrorOptions" || identity.name !== "cause") {
    return unresolved("An Error cause requires the original selected ErrorOptions.cause declaration.");
  }
  const native = host.providers.publishNativeIdentities(csharpExceptionTargetType());
  if (native.kind !== "resolved") return unresolved("An Error cause requires its exact native Exception relation.");
  const target = csharpNullableTargetType(native.value);
  const values: CsharpCallArgumentProjection["values"][number][] = [];
  let resultIndex: number | undefined;
  const absent = argument.type.kind === "intrinsic" && (argument.type.intrinsic === "absence" || argument.type.intrinsic === "void");
  if (host.ast.is.IsObjectLiteralExpression(argument.expression)) {
    const properties = host.ast.properties(argument.expression);
    if (properties.some(property => property === undefined ||
      !host.ast.is.IsPropertyAssignment(property) && !host.ast.is.IsShorthandPropertyAssignment(property))) {
      return unresolved("Error options require the direct member values, including every evaluated cause read.");
    }
    // Authored order is evaluation order for property assignments; a computed key evaluates before its value.
    for (const property of properties as readonly Node[]) {
      const element = host.facts.selections.objectLiteralElement(property);
      const name = host.ast.name(property);
      if (element === undefined || name === undefined) {
        return unresolved("Error options require their selected native field and complete source evaluation evidence.");
      }
      if (host.ast.is.IsComputedPropertyName(name)) {
        const key = host.ast.as.AsComputedPropertyName(name)?.Expression;
        const type = key === undefined ? undefined : carrier(host.types.value(key));
        if (key === undefined || type === undefined) return unresolved("An Error options key requires its native evaluation carrier.");
        values.push(Object.freeze({ expression: key, type, optional: false }));
      }
      const valueExpression = host.ast.is.IsPropertyAssignment(property)
        ? host.ast.as.AsPropertyAssignment(property)?.Initializer : name;
      const type = valueExpression === undefined ? undefined : carrier(host.types.value(valueExpression));
      if (valueExpression === undefined || type === undefined) return unresolved("An Error options member requires its native expression carrier.");
      if (element.destination?.declarations.includes(declaration) === true) resultIndex = values.length;
      values.push(Object.freeze({ expression: valueExpression, type, optional: false }));
    }
  } else if (!absent) {
    const type = carrier(host.types.value(argument.expression));
    const shape = host.objectShapes?.resolveNode(argument.expression) ?? host.objectShapes?.resolveTarget(type);
    const present = argument.type.kind === "optional" ? argument.type.value : argument.type;
    const actual = host.facts.objects.member(present, { kind: "string", value: "cause" });
    const actualDeclarations = actual?.declarations ?? [];
    const fields = shape?.members.filter(field => field.sourceDeclarations?.some(source => actualDeclarations.includes(source))) ?? [];
    const field = fields.length === 1 ? fields[0] : undefined;
    if (type === undefined || shape === undefined || actual !== undefined &&
      (actualDeclarations.length === 0 || field === undefined || field.memberKind !== "property")) {
      return unresolved("An Error options read requires its exact native cause-member correspondence.");
    }
    values.push(Object.freeze({ expression: argument.expression, type, member: field,
      optional: getCsharpNullableElementTargetType(type) !== undefined }));
    if (field !== undefined) resultIndex = 0;
  } else {
    const type = carrier(host.types.value(argument.expression));
    if (type === undefined) return unresolved("An absent Error options argument requires its exact native absence carrier.");
    values.push(Object.freeze({ expression: argument.expression, type, optional: false }));
  }
  const result = resultIndex === undefined ? undefined : values[resultIndex];
  const resultCarrier = result?.member?.type ?? result?.type;
  const present = getCsharpNullableElementTargetType(resultCarrier) ?? resultCarrier;
  if (present !== undefined && !namedTargetTypeImplicitlyAccepts(host, present, native.value, new Set()) &&
    !isCsharpAbsenceTargetType(present)) return unresolved("The selected Error cause must have a proven native Exception reference relation.");
  return Object.freeze({ kind: "resolved", projection: Object.freeze({ source: argument.expression, declaration,
    values: Object.freeze(values), resultIndex, target }) });
}
