import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";

export interface CsharpNativeConstructionPublicationInput {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly selectedType: Type | undefined;
}

export interface CsharpNativeConstructionPublicationSource {
  readonly input: CsharpNativeConstructionPublicationInput;
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly type: Type | undefined;
  readonly presentTypes: readonly Type[];
}

export function formCsharpNativeConstructionPublicationSource(
  input: CsharpNativeConstructionPublicationInput,
): CsharpNativeConstructionPublicationSource {
  const type = input.selectedType;
  const presentTypes = type === undefined ? [] : input.queries.types.isUnion(type)
    ? input.queries.types.unionOrIntersectionTypes(type).filter(member => !input.queries.types.isNullish(member))
    : [type];
  return Object.freeze({ input, node: input.node, queries: input.queries, type,
    presentTypes: Object.freeze(presentTypes) });
}
