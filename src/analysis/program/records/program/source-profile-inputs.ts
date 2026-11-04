import { csharpRegExpReceiverHasNativeExecution } from "../../../operations/source-profiles/js/regexp-execution.js";
import type { Node, Type, SourceFile } from "@tsonic/tsts";
import { sourceCallArgumentCorrespondences, sourceExpressionValueInputs } from "@tsonic/target-api/source";
import type { CsharpProviderCallSelectionHost } from "../../../../policy/model/provider-calls.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../../target-model/types/model.js";
import type { ResolvedSourceCallInfo } from "../../../../target-model/records/calls/source-calls.js";
import type { CsharpSourceProfileInputFacts, CsharpSourceProfileInputRequirements, CsharpCustomRegExpProtocol, CustomRegExpProtocolKind } from "../../../../target-model/records/program/source-profile-inputs.js";
import { csharpSourceHasNumericConstraint } from "../../../source-evidence/types/resolution/numeric-constraint-evidence.js";
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
export function createCsharpSourceProfileInputs(
  host: CsharpProviderCallSelectionHost, file: SourceFile,
  sourceValues: readonly { readonly expression: Node; readonly type: Type }[],
  result: Node,
  selected: readonly { readonly explicitTypeNode?: Node; readonly selectedType: Type; readonly typeParameter?: Type }[] = [],
  requirements: CsharpSourceProfileInputRequirements = {},
  source?: ResolvedSourceCallInfo,
): CsharpSourceProfileInputFacts {
  const numberLikeTypes = new Set<Type>();
  const identicalTypes = new Map<Type, Set<Type>>();
  const nativeRegExpReceivers = new Set<Node>();
  const sourceTypes = host.semantics(file).types;
  const values = new Map<Node, TargetTypeRef | undefined>();
  const results = new Map<Node, TargetTypeRef | undefined>();
  const nodes = new Map<Node, TargetTypeRef | undefined>();
  const numericArguments = new Set<Node>();
  const throwableCarriers = new Set<TargetTypeRef>();
  const objectShapes = new Map<Node, CsharpObjectShapeFact | undefined>();
  for (const value of sourceValues) {
    if (sourceTypes.isNumberLike(value.type)) numberLikeTypes.add(value.type);
    if (requirements.sourceTypeRelations === true) {
      const identical = new Set<Type>();
      for (const argument of selected) {
        if (sourceTypes.relationship(value.type, argument.selectedType) === "identical") identical.add(argument.selectedType);
      }
      identicalTypes.set(value.type, identical);
    }
    if (requirements.regexpExecution === true && csharpRegExpReceiverHasNativeExecution(value.expression, { host, sourceFile: file })) nativeRegExpReceivers.add(value.expression);
    if (!values.has(value.expression)) values.set(value.expression,
      host.types.resolveSelectedValue(value.expression, value.type, file));
    const carrier = values.get(value.expression);
    const numeric = getCsharpNullableElementTargetType(carrier) ?? carrier;
    if (numeric?.kind === "type-parameter" && csharpSourceHasNumericConstraint(value.expression, numeric, file, host)) {
      numericArguments.add(value.expression);
    }
    if (carrier !== undefined && isCsharpThrowableType(host, carrier)) throwableCarriers.add(carrier);
    if (!nodes.has(value.expression)) nodes.set(value.expression, host.types.resolveNode(value.expression, file)?.sourceResult?.selectedType);
    if (host.ast.is.IsSpreadElement(value.expression)) {
      const operand = host.ast.as.AsSpreadElement(value.expression)?.Expression;
      if (operand !== undefined && !nodes.has(operand)) nodes.set(operand, host.types.resolveNode(operand, file)?.sourceResult?.selectedType);
    }
    if (requirements.objectShapes === true && !objectShapes.has(value.expression)) objectShapes.set(value.expression,
      host.objectShapes?.resolveNode(value.expression, file) ?? host.objectShapes?.resolveTarget(carrier));
  }
  const callTypeArguments = source === undefined ? undefined : host.types.resolveSourceCallTypeArguments(source, file);
  const typeArguments = selected.map((argument, index) => {
    return Object.freeze({ source: argument, node: argument.explicitTypeNode, type: argument.selectedType,
      parameter: argument.typeParameter === undefined ? undefined : host.types.resolveType(argument.typeParameter, file),
      carrier: source === undefined
        ? host.types.resolveSelectedType(argument.explicitTypeNode, argument.selectedType, file)
        : callTypeArguments?.[index] });
  });
  const resultAccess = source === undefined ? host.semantics(file).operations.propertyAccess(result) ??
    host.semantics(file).operations.elementAccess(result) : undefined;
  results.set(result, source === undefined ? resultAccess === undefined ? undefined
    : host.types.resolveSelectedResult(result, resultAccess.selectedDeclaration,
      resultAccess.sourceReadType ?? resultAccess.sourceWriteType, file)
    : host.types.resolveSourceCallResult(source, file, undefined)?.selectedType);
  const correspondence = source === undefined ? undefined : sourceCallArgumentCorrespondences({ ast: host.ast,
    semantics: host.semantics(file) }, source);
  const parameters = source === undefined ? [] : source.sourceSelectedSignatureParameters.map((parameter, index) => {
    const declared = host.types.resolveSourceCallParameter(source, index, file, "declared");
    const present = getCsharpNullableElementTargetType(declared) ?? declared;
    const arms = getCsharpRuntimeUnionArms(present, host.typeDefinitions);
    if (arms === undefined) return declared;
    const bindings = correspondence?.filter(row => row.parameter === parameter);
    if (bindings === undefined) return undefined;
    if (bindings.length === 0) return declared;
    const binding = bindings.length === 1 ? bindings[0] : undefined;
    const argument = binding?.argument;
    if (binding === undefined || argument === undefined || binding.binding.sourceForm !== "value" ||
        !sourceValues.some(value => value.expression === argument.expression && value.type === argument.type)) return undefined;
    if (sourceTypes.callable(argument.type) === undefined) return declared;
    const callable = arms.map(arm => getCsharpNullableElementTargetType(arm) ?? arm)
      .filter(arm => getCsharpDelegateSignature(arm) !== undefined);
    return callable.length === 1 ? callable[0] : undefined;
  });
  const regexp = new Map<number, Map<CustomRegExpProtocolKind, CsharpCustomRegExpProtocol>>();
  const inputs: CsharpSourceProfileInputFacts = Object.freeze({
    errorCause: source !== undefined && requirements.errorCause === true && source.sourceArguments[1] !== undefined
      ? analyzeCsharpErrorCauseArgument(host, file, source) : undefined,
    values, numberLikeTypes, identicalTypes, nativeRegExpReceivers,
    results: Object.freeze({ get: (node: Node | undefined) => node === undefined ? undefined : results.get(node) }),
    nodes: Object.freeze({ get: (node: Node | undefined) => node === undefined ? undefined : nodes.get(node) }),
    typeArgument: Object.freeze({ get: (source: import("../../../../target-model/records/program/source-profile-inputs.js").CsharpSourceProfileTypeArgumentSource) =>
      typeArguments.find(argument => argument.source === source)?.carrier }),
    typeArguments: Object.freeze(typeArguments), numericArguments, throwableCarriers,
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

function analyzeCsharpErrorCauseArgument(
  host: CsharpProviderCallSelectionHost,
  file: SourceFile,
  source: ResolvedSourceCallInfo,
): CsharpSourceProfileInputFacts["errorCause"] {
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
  const identity = csharpSourceProfileDeclarationIdentity(host.ast, queries, host.sourceFacts, declaration);
  if (declaration === undefined || identity?.kind !== "member" || identity.declaringName !== "ErrorOptions" || identity.name !== "cause") {
    return unresolved("An Error cause requires the original selected ErrorOptions.cause declaration.");
  }
  const native = host.providers.publishNativeIdentities(csharpExceptionTargetType());
  if (native.kind !== "resolved") return unresolved("An Error cause requires its exact native Exception relation.");
  const target = csharpNullableTargetType(native.value);
  const values: CsharpCallArgumentProjection["values"][number][] = [];
  let resultIndex: number | undefined;
  if (host.ast.is.IsObjectLiteralExpression(argument.expression)) {
    const properties = host.ast.properties(argument.expression);
    if (properties.some(property => property === undefined ||
      !host.ast.is.IsPropertyAssignment(property) && !host.ast.is.IsShorthandPropertyAssignment(property))) {
      return unresolved("Error options require the checked direct member values, including every evaluated cause read.");
    }
    const inputs = sourceExpressionValueInputs(host.ast, argument.expression);
    if (inputs === undefined) return unresolved("Error options require their exact checked member evaluation order.");
    for (const entry of inputs) {
      if (entry.slot.kind !== "member") return unresolved("Error options require an exact native member projection.");
      const property = properties[entry.slot.index];
      const name = property === undefined ? undefined : host.ast.name(property);
      const selectedKey = name === undefined ? undefined : queries.propertyNames.get(name);
      const text = name !== undefined && (host.ast.is.IsIdentifier(name) || host.ast.is.IsStringLiteral(name)) ? host.ast.text(name)
        : selectedKey?.kind === "resolved" ? selectedKey.name : undefined;
      if (property === undefined || text === undefined) return unresolved("Error options require their selected native field and complete source evaluation evidence.");
      if (name !== undefined && host.ast.is.IsComputedPropertyName(name)) {
        const key = host.ast.as.AsComputedPropertyName(name)?.Expression;
        const type = key === undefined ? undefined : host.types.resolveNode(key, file)?.sourceResult?.selectedType;
        if (key === undefined || type === undefined) return unresolved("An Error options key requires its checked native evaluation carrier.");
        values.push(Object.freeze({ expression: key, type, optional: false }));
      }
      const type = host.types.resolveNode(entry.expression, file)?.sourceResult?.selectedType;
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
      (actualDeclarations.length === 0 || field === undefined || field.memberKind !== "property")) {
      return unresolved("An Error options read requires its exact checked native cause-member correspondence.");
    }
    values.push(Object.freeze({ expression: argument.expression, type, member: field,
      optional: getCsharpNullableElementTargetType(type) !== undefined }));
    if (field !== undefined) resultIndex = 0;
  } else {
    const type = host.types.resolveNode(argument.expression, file)?.sourceResult?.selectedType;
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
