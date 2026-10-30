import { csharpRegExpReceiverHasNativeExecution } from "../../../operations/source-profiles/js/regexp-execution.js";
import type { Node, Type, SourceFile } from "@tsonic/tsts";
import type { CsharpProviderCallSelectionHost } from "../../../../policy/model/provider-calls.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpSourceProfileInputFacts, CsharpSourceProfileInputRequirements, CsharpCustomRegExpProtocol, CustomRegExpProtocolKind } from "../../../../target-model/records/program/source-profile-inputs.js";
import { csharpSourceHasNumericConstraint } from "../../../source-evidence/types/resolution/numeric-constraint-evidence.js";
import { isCsharpThrowableType } from "../../../project-types/throwable-types.js";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { analyzeCsharpCustomRegExpProtocol } from "../../../operations/source-profiles/js/regexp-protocol.js";
import { csharpExceptionTargetType } from "../../../../target-model/types/carriers/scalar-types.js";
import { namedTargetTypeImplicitlyAccepts } from "../../../../policy/conversions/carriers.js";
import { csharpSourceProfileDeclarationIdentity } from "../../../../policy/identities/selected-source.js";
import type { CsharpCallArgumentProjection } from "../../../../target-model/records/objects/members.js";
import { sourceExpressionValueInputs } from "@tsonic/target-api/source";
import { isCsharpAbsenceTargetType } from "../../../../target-model/types/carriers/runtime-carriers.js";
export function createCsharpSourceProfileInputs(
  host: CsharpProviderCallSelectionHost, file: SourceFile,
  sourceValues: readonly { readonly expression: Node; readonly type: Type }[],
  result: Type | undefined,
  selected: readonly { readonly explicitTypeNode?: Node; readonly selectedType: Type; readonly typeParameter?: Type }[] = [],
  requirements: CsharpSourceProfileInputRequirements = {},
  source?: ResolvedSourceCallInfo,
): CsharpSourceProfileInputFacts {
  const numberLikeTypes = new Set<Type>();
  const identicalTypes = new Map<Type, Set<Type>>();
  const nativeRegExpReceivers = new Set<Node>();
  const sourceTypes = host.semantics(file).types;
  const values = new Map<Node, Map<Type, TargetTypeRef | undefined>>();
  const types = new Map<Type, TargetTypeRef | undefined>();
  const nodes = new Map<Node, TargetTypeRef | undefined>();
  const numericArguments = new Set<Node>();
  const throwableCarriers = new Set<TargetTypeRef>();
  const objectShapes = new Map<Node, CsharpObjectShapeFact | undefined>();
  for (const value of sourceValues) {
    if (requirements.errorCause === true && value.expression === source?.sourceArguments[1]?.expression &&
      host.ast.is.IsObjectLiteralExpression(value.expression)) continue;
    if (sourceTypes.isNumberLike(value.type)) numberLikeTypes.add(value.type);
    if (requirements.sourceTypeRelations === true) {
      const identical = new Set<Type>();
      for (const argument of selected) {
        if (sourceTypes.relationship(value.type, argument.selectedType) === "identical") identical.add(argument.selectedType);
      }
      identicalTypes.set(value.type, identical);
    }
    if (requirements.regexpExecution === true && csharpRegExpReceiverHasNativeExecution(value.expression, { host, sourceFile: file })) nativeRegExpReceivers.add(value.expression);
    let selectedTypes = values.get(value.expression);
    if (selectedTypes === undefined) { selectedTypes = new Map(); values.set(value.expression, selectedTypes); }
    if (!selectedTypes.has(value.type)) selectedTypes.set(value.type, host.types.resolveSelectedValue(value.expression, value.type, file));
    const carrier = selectedTypes.get(value.type);
    const numeric = getCsharpNullableElementTargetType(carrier) ?? carrier;
    if (numeric?.kind === "type-parameter" && csharpSourceHasNumericConstraint(value.expression, numeric, file, host)) {
      numericArguments.add(value.expression);
    }
    if (carrier !== undefined && isCsharpThrowableType(host, carrier)) throwableCarriers.add(carrier);
    if (!types.has(value.type)) types.set(value.type, host.types.resolveType(value.type, file));
    if (!nodes.has(value.expression)) nodes.set(value.expression, host.types.resolveNode(value.expression, file)?.type);
    if (host.ast.is.IsSpreadElement(value.expression)) {
      const operand = host.ast.as.AsSpreadElement(value.expression)?.Expression;
      if (operand !== undefined && !nodes.has(operand)) nodes.set(operand, host.types.resolveNode(operand, file)?.type);
    }
    if (requirements.objectShapes === true && !objectShapes.has(value.expression)) objectShapes.set(value.expression,
      host.objectShapes?.resolveNode(value.expression, file) ?? host.objectShapes?.resolveTarget(carrier));
  }
  const typeArguments = selected.map(argument => {
    if (argument.typeParameter !== undefined && !types.has(argument.typeParameter)) {
      types.set(argument.typeParameter, host.types.resolveType(argument.typeParameter, file));
    }
    return Object.freeze({ node: argument.explicitTypeNode, type: argument.selectedType,
      carrier: host.types.resolveSelectedType(argument.explicitTypeNode, argument.selectedType, file) });
  });
  const resultType = host.types.resolveType(result, file);
  if (result !== undefined) types.set(result, resultType);
  const callTypeArguments = source === undefined ? undefined : host.types.resolveSourceCallTypeArguments(source, file);
  const parameters = source === undefined ? [] : source.sourceSelectedSignatureParameters.map((_parameter, index) =>
    requirements.errorCause === true && index === 1 ? undefined : host.types.resolveSourceCallParameter(source, index, file));
  const regexp = new Map<number, Map<CustomRegExpProtocolKind, CsharpCustomRegExpProtocol>>();
  const inputs: CsharpSourceProfileInputFacts = Object.freeze({
    errorCause: requirements.errorCause === true && source !== undefined && source.sourceArguments[1] !== undefined
      ? selectCsharpErrorCauseArgument(host, file, source) : Object.freeze({ kind: "not-applicable" as const }),
    values, numberLikeTypes, identicalTypes, nativeRegExpReceivers, types: Object.freeze({ get: (type: Type | undefined) => type === undefined ? undefined : types.get(type) }),
    nodes: Object.freeze({ get: (node: Node | undefined) => node === undefined ? undefined : nodes.get(node) }),
    selectedType: Object.freeze({ get: (node: Node | undefined, type: Type | undefined) =>
      typeArguments.find(argument => argument.node === node && argument.type === type)?.carrier }),
    typeArguments: Object.freeze(typeArguments), resultType, numericArguments, throwableCarriers,
    objectShape: Object.freeze({ get: (node: Node | undefined) => node === undefined ? undefined : objectShapes.get(node) }),
    callTypeArguments, parameters: Object.freeze(parameters),
    regexpProtocol: Object.freeze({ get: (index: number, kind: CustomRegExpProtocolKind) => regexp.get(index)?.get(kind) }),
  });
  if (source !== undefined && requirements.regexpProtocol === true) {
    for (const [index] of source.sourceArguments.entries()) {
      const selected = new Map<CustomRegExpProtocolKind, CsharpCustomRegExpProtocol>();
      for (const kind of ["match", "match-all", "replace", "search", "split"] as const) {
        const protocol = analyzeCsharpCustomRegExpProtocol({ host, source, sourceFile: file, inputs }, index, kind);
        if (protocol !== undefined) selected.set(kind, protocol);
      }
      regexp.set(index, selected);
    }
  }
  return inputs;
}

function selectCsharpErrorCauseArgument(host: CsharpProviderCallSelectionHost, file: SourceFile,
  source: ResolvedSourceCallInfo): CsharpSourceProfileInputFacts["errorCause"] {
  const unresolved = (reason: string) => Object.freeze({ kind: "unresolved" as const, reason });
  const argument = source.sourceArguments[1];
  const parameter = source.sourceSelectedSignatureParameters[1];
  if (argument === undefined || parameter?.selectedType === undefined) return unresolved("An Error cause requires its checked options signature slot.");
  const queries = host.semantics(file);
  const selectedType = queries.types.nonNullableType(parameter.selectedType) ?? parameter.selectedType;
  const members = queries.types.propertyInfos(selectedType).filter(member => member.name === "cause");
  const member = members.length === 1 ? members[0] : undefined;
  const declarations = member === undefined ? [] : queries.declarations.symbolDeclarations(member.symbol);
  const declaration = declarations.length === 1 ? declarations[0] : undefined;
  const identity = declaration === undefined ? undefined : csharpSourceProfileDeclarationIdentity(host.ast, queries, host.sourceFacts, declaration);
  if (declaration === undefined || identity?.declaringName !== "ErrorOptions" || identity.name !== "cause")
    return unresolved("An Error cause requires the original selected ErrorOptions.cause declaration.");
  const native = host.providers.publishNativeIdentities(csharpExceptionTargetType());
  if (native.kind !== "resolved") return unresolved("An Error cause requires its exact native Exception relation.");
  const target = csharpNullableTargetType(native.value);
  const values: CsharpCallArgumentProjection["values"][number][] = [];
  let resultIndex: number | undefined;
  if (host.ast.is.IsObjectLiteralExpression(argument.expression)) {
    const inputs = sourceExpressionValueInputs(host.ast, argument.expression);
    if (inputs === undefined) return unresolved("Error options require their exact checked member evaluation order.");
    for (const entry of inputs) {
      if (entry.slot.kind !== "member") return unresolved("Error options require an exact native member projection.");
      const property = host.ast.children(argument.expression)[entry.slot.index];
      const name = property === undefined ? undefined : host.ast.name(property);
      const key = name === undefined ? undefined : queries.propertyNames.get(name);
      const text = name !== undefined && (host.ast.is.IsIdentifier(name) || host.ast.is.IsStringLiteral(name)) ? host.ast.text(name)
        : key?.kind === "resolved" ? key.name : undefined;
      if (property === undefined || text === undefined || host.ast.is.IsSpreadAssignment(property))
        return unresolved("Error options require their selected native field and complete source evaluation evidence.");
      if (name !== undefined && host.ast.is.IsComputedPropertyName(name)) {
        const key = host.ast.as.AsComputedPropertyName(name)?.Expression;
        const type = key === undefined ? undefined : host.types.resolveNode(key, file)?.type;
        if (key === undefined || type === undefined) return unresolved("An Error options key requires its checked native evaluation carrier.");
        values.push(Object.freeze({ expression: key, type, optional: false }));
      }
      const type = host.types.resolveNode(entry.expression, file)?.type;
      if (type === undefined) return unresolved("An Error options member requires its checked native expression carrier.");
      if (text === "cause") resultIndex = values.length;
      values.push(Object.freeze({ expression: entry.expression, type, optional: false }));
    }
  } else if (!queries.types.isNullish(argument.type)) {
    const type = host.types.resolveSelectedValue(argument.expression, argument.type, file);
    const shape = host.objectShapes?.resolveNode(argument.expression, file) ?? host.objectShapes?.resolveTarget(type);
    const actualType = queries.types.nonNullableType(argument.type) ?? argument.type;
    const actualMembers = queries.types.propertyInfos(actualType).filter(member => member.name === "cause");
    const actualDeclarations = actualMembers.length === 1 ? queries.declarations.symbolDeclarations(actualMembers[0]!.symbol) : [];
    const fields = shape?.members.filter(field => field.sourceDeclarations?.some(source => actualDeclarations.includes(source))) ?? [];
    const field = fields.length === 1 ? fields[0] : undefined;
    if (type === undefined || shape === undefined || actualMembers.length > 1 || actualMembers.length === 1 &&
      (actualDeclarations.length === 0 || field === undefined || field.memberKind !== "property"))
      return unresolved("An Error options read requires its exact checked native cause-member correspondence.");
    values.push(Object.freeze({ expression: argument.expression, type, member: field,
      optional: getCsharpNullableElementTargetType(type) !== undefined }));
    if (field !== undefined) resultIndex = 0;
  } else {
    const type = host.types.resolveNode(argument.expression, file)?.type;
    if (type === undefined) return unresolved("An absent Error options argument requires its exact native absence carrier.");
    values.push(Object.freeze({ expression: argument.expression, type, optional: false }));
  }
  const result = resultIndex === undefined ? undefined : values[resultIndex];
  const carrier = result?.member?.type ?? result?.type;
  const present = getCsharpNullableElementTargetType(carrier) ?? carrier;
  if (present !== undefined && !namedTargetTypeImplicitlyAccepts(host, present, native.value, new Set()) &&
    !isCsharpAbsenceTargetType(present)) return unresolved("The selected Error cause must have a proven native Exception reference relation.");
  return Object.freeze({ kind: "resolved", projection: Object.freeze({ source: argument.expression, declaration,
    values: Object.freeze(values), resultIndex, target }) });
}
