import type { AstReader, Node, SourceFile } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";
import { bindCsharpSourceStorageContext, formCsharpSourceStorageComponentContext,
  type CsharpSourceStorageContextSource } from "./source-storage-projection.js";

export interface CsharpTupleNodeElementSource {
  readonly index: number;
  readonly node: Node | undefined;
  readonly sourceFile: SourceFile;
  readonly storage: CsharpSourceStorageContextSource;
  readonly state: CsharpTypeResolutionState;
  readonly rest: boolean;
}

export type CsharpTupleTypeNodeSource = {
  readonly node: Node;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "not-tuple" }
  | { readonly kind: "tuple"; readonly syntaxElements: readonly (Node | undefined)[];
      readonly elements: readonly CsharpTupleNodeElementSource[]; readonly restIndexes: readonly number[] }
);

function elementIsRest(ast: AstReader, element: Node | undefined): boolean {
  if (element === undefined) return false;
  if (ast.is.IsRestTypeNode(element)) return true;
  return ast.is.IsNamedTupleMember(element) && ast.as.AsNamedTupleMember(element)?.DotDotDotToken !== undefined;
}

export function formCsharpTupleTypeNodeSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  node: Node,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpTupleTypeNodeSource {
  if (!host.ast.is.IsTupleTypeNode(node)) return Object.freeze({ kind: "not-tuple", node, queries, state });
  const syntaxElements = host.ast.elements(node);
  for (let index = 0; index < syntaxElements.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(syntaxElements, index)) return failTargetAnalysisInvariant("tsonic-csharp",
      "Tuple Source requires the exact dense syntax element vector.", node);
  }
  const elements = Object.freeze(syntaxElements.map((element, index) => {
    const storage = formCsharpSourceStorageComponentContext(host, state.sourceStorageSubject, { kind: "tuple-element", index });
    return Object.freeze({ index, node: element, sourceFile: queries.sourceFile, storage,
      state: Object.freeze(nextState(bindCsharpSourceStorageContext(storage, state))), rest: elementIsRest(host.ast, element) });
  }));
  return Object.freeze({ kind: "tuple", node, queries, state, syntaxElements, elements,
    restIndexes: Object.freeze(elements.flatMap(element => element.rest ? [element.index] : [])),
  });
}

export function assertCsharpTupleTypeNodeSource(source: CsharpTupleTypeNodeSource): void {
  if (source === undefined || source.node === undefined || source.queries === undefined || source.state === undefined ||
      source.kind !== "not-tuple" && source.kind !== "tuple") {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A tuple-type node requires its exact ordered syntax and bound Source children.", source?.node);
  }
  if (source.kind === "not-tuple") return;
  if (source.syntaxElements === undefined || source.elements === undefined || source.restIndexes === undefined ||
      source.syntaxElements.length !== source.elements.length) {
    return failTargetAnalysisInvariant("tsonic-csharp",
      "A tuple-type node requires its exact ordered syntax and bound Source children.", source.node);
  }
  let restCount = 0;
  for (let index = 0; index < source.syntaxElements.length; index += 1) {
    const element = source.elements[index];
    if (!Object.prototype.hasOwnProperty.call(source.syntaxElements, index) || element === undefined || element.storage === undefined ||
        element.state === undefined || element.index !== index || element.node !== source.syntaxElements[index] ||
        element.sourceFile !== source.queries.sourceFile || element.storage.inputSubject !== source.state.sourceStorageSubject ||
        element.state.depth !== source.state.depth + 1 || element.state.sourceStorageSubject !== element.storage.subject ||
        element.state.sourceBindings !== source.state.sourceBindings || element.state.sourceStorageBindings !== source.state.sourceStorageBindings ||
        element.state.rejectNativeResolution !== source.state.rejectNativeResolution || typeof element.rest !== "boolean" ||
        element.rest && source.restIndexes[restCount++] !== index) {
      return failTargetAnalysisInvariant("tsonic-csharp",
        "A tuple-type node requires its exact ordered syntax and bound Source children.", source.node);
    }
  }
  if (restCount !== source.restIndexes.length) return failTargetAnalysisInvariant("tsonic-csharp",
    "A tuple-type node requires its exact ordered syntax and bound Source children.", source.node);
}
