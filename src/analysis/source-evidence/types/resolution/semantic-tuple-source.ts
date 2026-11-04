import type { SourceFile, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import type { CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";
import { bindCsharpSourceStorageContext, formCsharpSourceStorageComponentContext,
  type CsharpSourceStorageContextSource } from "./source-storage-projection.js";

export interface CsharpSemanticTupleElementSource {
  readonly index: number;
  readonly type: Type;
  readonly sourceFile: SourceFile;
  readonly storage: CsharpSourceStorageContextSource;
  readonly state: CsharpTypeResolutionState;
}

export type CsharpSemanticTupleSource = {
  readonly type: Type;
  readonly sourceFile: SourceFile;
  readonly queries: SourceFileSemantics;
  readonly state: CsharpTypeResolutionState;
} & (
  | { readonly kind: "not-tuple" }
  | { readonly kind: "unavailable"; readonly rawElements: readonly (Type | undefined)[] }
  | { readonly kind: "tuple"; readonly rawElements: readonly (Type | undefined)[];
      readonly elements: readonly CsharpSemanticTupleElementSource[] }
);

function completeElementVector(elements: readonly (Type | undefined)[]): boolean {
  for (let index = 0; index < elements.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(elements, index) || elements[index] === undefined) return false;
  }
  return true;
}

export function formCsharpSemanticTupleSource(
  { host }: Pick<CsharpTypeResolutionScope, "host">,
  type: Type,
  sourceFile: SourceFile,
  queries: SourceFileSemantics,
  state: CsharpTypeResolutionState,
): CsharpSemanticTupleSource {
  if (!queries.types.isTuple(type)) return Object.freeze({ kind: "not-tuple", type, sourceFile, queries, state });
  const rawElements = queries.types.tupleElementTypes(type);
  if (!completeElementVector(rawElements)) return Object.freeze({ kind: "unavailable", type, sourceFile, queries, state, rawElements });
  return Object.freeze({ kind: "tuple", type, sourceFile, queries, state, rawElements,
    elements: Object.freeze(rawElements.map((element, index) => {
      const storage = formCsharpSourceStorageComponentContext(host, state.sourceStorageSubject, { kind: "tuple-element", index });
      return Object.freeze({ index, type: element, sourceFile, storage,
        state: Object.freeze(nextState(bindCsharpSourceStorageContext(storage, state))) });
    })),
  });
}

export function assertCsharpSemanticTupleSource(source: CsharpSemanticTupleSource): void {
  if (source === undefined || source.type === undefined || source.sourceFile === undefined ||
      source.queries === undefined || source.state === undefined ||
      source.kind !== "not-tuple" && source.kind !== "unavailable" && source.kind !== "tuple") {
    return failTargetAnalysisInvariant("tsonic-csharp", "A semantic tuple requires its exact checked elements and bound Source states.");
  }
  if (source.kind === "not-tuple") return;
  if (source.rawElements === undefined || source.kind === "unavailable" && completeElementVector(source.rawElements) ||
      source.kind === "tuple" && (!completeElementVector(source.rawElements) || source.elements === undefined ||
        source.elements.length !== source.rawElements.length)) {
    return failTargetAnalysisInvariant("tsonic-csharp", "A semantic tuple requires its exact checked elements and bound Source states.");
  }
  if (source.kind === "unavailable") return;
  for (let index = 0; index < source.rawElements.length; index += 1) {
    const element = source.elements[index];
    if (element === undefined || element.type !== source.rawElements[index] || element.index !== index ||
        element.sourceFile !== source.sourceFile || element.storage === undefined || element.state === undefined ||
        element.storage.inputSubject !== source.state.sourceStorageSubject ||
        element.state.depth !== source.state.depth + 1 || element.state.sourceStorageSubject !== element.storage.subject ||
        element.state.sourceStorageBindings !== source.state.sourceStorageBindings ||
        element.state.sourceBindings !== source.state.sourceBindings ||
        element.state.rejectNativeResolution !== source.state.rejectNativeResolution) {
      return failTargetAnalysisInvariant("tsonic-csharp", "A semantic tuple requires its exact checked elements and bound Source states.");
    }
  }
}

export function resolveFormedCsharpSemanticTupleElements(
  scope: Pick<CsharpTypeResolutionScope, "resolveTypeWithState">,
  source: CsharpSemanticTupleSource,
): readonly TargetTypeRef[] | undefined {
  assertCsharpSemanticTupleSource(source);
  if (source.kind !== "tuple") return undefined;
  const elements = source.elements.map(element => scope.resolveTypeWithState(element.type, element.sourceFile, element.state));
  return elements.some(element => element === undefined) ? undefined : elements as readonly TargetTypeRef[];
}
