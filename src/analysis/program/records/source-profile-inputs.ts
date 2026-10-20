import { csharpRegExpReceiverHasNativeExecution } from "../../source-profiles/js/regexp-execution.js";
import type { Node, Type, SourceFile } from "@tsonic/tsts";
import type { CsharpProviderCallSelectionHost } from "../../../policy/model/provider-calls.js";
import type { CsharpObjectShapeFact, TargetTypeRef } from "../../../target-model/types/model.js";
import type { ResolvedSourceCallInfo } from "../../../target-model/records/source-calls.js";
import type { CsharpSourceProfileInputFacts, CsharpSourceProfileInputRequirements, CsharpCustomRegExpProtocol, CustomRegExpProtocolKind } from "../../../target-model/records/source-profile-inputs.js";
import { csharpSourceHasNumericConstraint } from "../../constraints/numeric-evidence.js";
import { isCsharpThrowableType } from "../../project-types/throwable-types.js";
import { getCsharpNullableElementTargetType } from "../../../target-model/types/carriers/nullable.js";
import { analyzeCsharpCustomRegExpProtocol } from "../../source-profiles/js/regexp-protocol.js";
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
    if (!nodes.has(value.expression)) nodes.set(value.expression, host.types.resolveNode(value.expression, file));
    if (host.ast.is.IsSpreadElement(value.expression)) {
      const operand = host.ast.as.AsSpreadElement(value.expression)?.Expression;
      if (operand !== undefined && !nodes.has(operand)) nodes.set(operand, host.types.resolveNode(operand, file));
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
    host.types.resolveSourceCallParameter(source, index, file));
  const regexp = new Map<number, Map<CustomRegExpProtocolKind, CsharpCustomRegExpProtocol>>();
  const inputs: CsharpSourceProfileInputFacts = Object.freeze({
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
