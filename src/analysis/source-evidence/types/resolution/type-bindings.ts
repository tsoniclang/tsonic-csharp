import type { AstReader, Node, Type } from "@tsonic/tsts";
import { substituteSourceTypeDescriptor, type SourceFileSemantics, type SourceTypeDescriptor } from "@tsonic/target-api/source";
import type { CsharpTypeResolutionState, CsharpSourceTypeBinding } from "./model.js";
import { csharpSourceTypeParameter } from "../../../../source/extension/type-parameters.js";

export function csharpSourceTemplateState(
  parameters: readonly (Node | undefined)[],
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState {
  const declarations = new Set(parameters);
  return { ...state, sourceBindings: new Map(
    [...state.sourceBindings ?? []].filter(([node]) => !declarations.has(node)),
  ) };
}

export function csharpBoundSourceType(
  type: Type, queries: SourceFileSemantics, state: CsharpTypeResolutionState,
): CsharpSourceTypeBinding | undefined {
  if (state.sourceBindings === undefined) return undefined;
  const symbol = queries.declarations.typeSymbol(type);
  if (symbol === undefined) return undefined;
  const declarations = queries.declarations.symbolDeclarations(symbol);
  const matches = declarations.flatMap(declaration => {
    const binding = state.sourceBindings!.get(declaration);
    return binding === undefined ? [] : [binding];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function csharpSourceBindings(
  parameters: readonly Node[], sources: readonly Type[],
  targets: readonly import("../../../../target-model/types/model.js").TargetTypeRef[],
  descriptors: readonly (SourceTypeDescriptor | undefined)[],
  state: CsharpTypeResolutionState,
): CsharpTypeResolutionState | undefined {
  if (parameters.length !== sources.length || parameters.length !== targets.length ||
    parameters.length !== descriptors.length || new Set(parameters).size !== parameters.length) return undefined;
  const bindings = new Map(state.sourceBindings);
  for (const [index, parameter] of parameters.entries()) {
    bindings.set(parameter, { sourceType: sources[index]!, targetType: targets[index]!, descriptor: descriptors[index] });
  }
  return { ...state, sourceBindings: bindings };
}

export function substituteCsharpPublishedSourceType(
  ast: AstReader, descriptor: SourceTypeDescriptor, state: CsharpTypeResolutionState,
): SourceTypeDescriptor | undefined {
  if (state.sourceBindings === undefined || state.sourceBindings.size === 0) return descriptor;
  const bindings = new Map<Node, SourceTypeDescriptor>();
  const parameters = new Map<string, Node>();
  for (const [declaration, binding] of state.sourceBindings) {
    const parameter = csharpSourceTypeParameter(declaration, ast);
    if (parameter === undefined || parameters.has(parameter.identity)) return undefined;
    parameters.set(parameter.identity, declaration);
    if (binding.descriptor !== undefined) bindings.set(declaration, binding.descriptor);
  }
  for (const reference of csharpPublishedSourceReferences([descriptor])) {
    if (reference.typeArguments.length !== 0 || !ast.is.IsTypeParameterDeclaration(reference.declaration)) continue;
    const parameter = csharpSourceTypeParameter(reference.declaration, ast);
    if (parameter === undefined) return undefined;
    const bound = parameters.get(parameter.identity);
    if (bound !== undefined && (bound !== reference.declaration || !bindings.has(bound))) return undefined;
  }
  return bindings.size === 0 ? descriptor : substituteSourceTypeDescriptor(ast, descriptor, bindings);
}

export function csharpPublishedSourceReferences(
  roots: readonly SourceTypeDescriptor[],
): readonly Extract<SourceTypeDescriptor, { readonly kind: "declared" }>[] {
  const pending = [...roots];
  const visited = new Set<SourceTypeDescriptor>();
  const references: Extract<SourceTypeDescriptor, { readonly kind: "declared" }>[] = [];
  for (let index = 0; index < pending.length; index += 1) {
    const descriptor = pending[index]!;
    if (visited.has(descriptor)) continue;
    visited.add(descriptor);
    switch (descriptor.kind) {
      case "declared":
        references.push(descriptor);
        pending.push(...descriptor.typeArguments);
        if (descriptor.definition !== undefined) pending.push(descriptor.definition);
        break;
      case "union": pending.push(...descriptor.types); break;
      case "array": pending.push(descriptor.element); break;
      case "optional": pending.push(descriptor.value); break;
      case "tuple": pending.push(...descriptor.elements.map(element => element.type)); break;
      case "shape":
        pending.push(...descriptor.members.map(member => member.type),
          ...descriptor.indexes.flatMap(selected => [selected.key, selected.value]));
        pending.push(...[...descriptor.calls, ...descriptor.constructs].flatMap(signature =>
          [...signature.parameters.map(parameter => parameter.type), signature.result]));
        break;
      case "callable":
        pending.push(...[...descriptor.calls, ...descriptor.constructs].flatMap(signature =>
          [...signature.parameters.map(parameter => parameter.type), signature.result]));
        break;
    }
  }
  return references;
}
