import type { Node, Type, SourceFile } from "@tsonic/tsts";
import type { CsharpProviderCallSelectionHost } from "../../policy/model/provider-calls.js";
import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpSourceProfileInputFacts } from "../../target-model/records/source-profile-inputs.js";
export function createCsharpSourceProfileInputs(
  host: CsharpProviderCallSelectionHost, file: SourceFile,
  sourceValues: readonly { readonly expression: Node; readonly type: Type }[],
  result: Type | undefined,
  selected: readonly { readonly explicitTypeNode?: Node; readonly selectedType: Type }[] = [],
): CsharpSourceProfileInputFacts {
  const values = new Map<Node, Map<Type, TargetTypeRef | undefined>>();
  const types = new Map<Type, TargetTypeRef | undefined>();
  const nodes = new Map<Node, TargetTypeRef | undefined>();
  for (const value of sourceValues) {
    let selectedTypes = values.get(value.expression);
    if (selectedTypes === undefined) { selectedTypes = new Map(); values.set(value.expression, selectedTypes); }
    if (!selectedTypes.has(value.type)) selectedTypes.set(value.type, host.types.resolveSelectedValue(value.expression, value.type, file));
    if (!types.has(value.type)) types.set(value.type, host.types.resolveType(value.type, file));
    if (!nodes.has(value.expression)) nodes.set(value.expression, host.types.resolveNode(value.expression, file));
    if (host.ast.is.IsSpreadElement(value.expression)) {
      const operand = host.ast.as.AsSpreadElement(value.expression)?.Expression;
      if (operand !== undefined && !nodes.has(operand)) nodes.set(operand, host.types.resolveNode(operand, file));
    }
  }
  const typeArguments = selected.map(argument => Object.freeze({
    node: argument.explicitTypeNode, type: argument.selectedType,
    carrier: host.types.resolveSelectedType(argument.explicitTypeNode, argument.selectedType, file),
  }));
  const resultType = host.types.resolveType(result, file);
  if (result !== undefined) types.set(result, resultType);
  return Object.freeze({ values, types, nodes, typeArguments: Object.freeze(typeArguments), resultType });
}
