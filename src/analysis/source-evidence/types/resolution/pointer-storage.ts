import type { Node } from "@tsonic/tsts";
import type { SourceStorageBindings, SourceStorageProducer } from "@tsonic/target-api/analysis";
import { sourceEnclosingCallable } from "@tsonic/target-api/source";
import type { CsharpPointerStoragePointeeSelection } from "../../../../target-model/records/storage/pointer-storage.js";
import { csharpRuntimeLocationPointee } from "../../../../target-model/types/carriers/runtime-carriers.js";
import { getCsharpNullableElementTargetType } from "../../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../../target-model/types/equality.js";
import { bindCsharpSourceDeclarationArguments } from "./generic-arguments.js";
import type { CsharpTypeResolutionScope } from "./scope.js";
import { maximumTypeResolutionDepth, type CsharpTypeResolutionState } from "./model.js";
import { nextState } from "./state.js";

function pointerStorageStates(
  scope: CsharpTypeResolutionScope,
  node: Node,
  bindings: SourceStorageBindings,
  state: CsharpTypeResolutionState,
): readonly CsharpTypeResolutionState[] | undefined {
  if (state.depth > maximumTypeResolutionDepth) return undefined;
  const { host } = scope;
  const owner = sourceEnclosingCallable(node, host.ast);
  if (owner === undefined) return [{ ...state, sourceStorageBindings: bindings }];
  const selected = host.sourceStorage.boundActivationsFor(owner, bindings);
  if (selected.kind === "unresolved") return undefined;
  const inputs = selected.activations.map(activation => {
    if (activation.kind === "declaration") return Object.freeze({ kind: "declaration" as const, activation });
    const queries = host.semanticsFor(activation.invocation);
    const call = queries.operations.call(activation.invocation);
    return Object.freeze({ kind: "invocation" as const, activation, queries, call,
      callableSource: call === undefined ? undefined : host.representations.sourceCallableSource(call, queries.sourceFile),
    });
  });
  const states: CsharpTypeResolutionState[] = [];
  for (const input of inputs) {
    if (input.kind === "declaration") {
      states.push({ ...state, sourceStorageBindings: input.activation.bindings });
      continue;
    }
    const { activation, queries, call, callableSource } = input;
    const callerStates = pointerStorageStates(scope, activation.invocation, activation.callerBindings, nextState(state));
    if (callerStates === undefined) return undefined;
    if (call === undefined || callableSource === undefined) return undefined;
    const callable = host.representations.completeSourceCallable(callableSource, "checked");
    for (const callerState of callerStates) {
      const vector = scope.resolveSourceCallInstantiation(call, queries.sourceFile, nextState(callerState),
        callable?.nativeSignature.methodTypeParameterIdentities, callable);
      if (vector === undefined) return undefined;
      const bound = bindCsharpSourceDeclarationArguments(scope, activation.declaration,
        vector.arguments.slice(0, vector.sourceArguments.length), vector.sourceArguments, callerState);
      if (bound === undefined) return undefined;
      states.push({ ...bound, sourceStorageBindings: activation.bindings });
    }
  }
  return states;
}

export function resolveCsharpPointerStoragePointee(
  scope: CsharpTypeResolutionScope,
  storage: SourceStorageProducer,
  state: CsharpTypeResolutionState,
): CsharpPointerStoragePointeeSelection {
  const states = pointerStorageStates(scope, storage.subject.node, storage.bindings, state);
  if (states === undefined || states.length === 0) return {
    kind: "unresolved", reason: "The pointer producer has no complete canonical native activation bindings.",
  };
  const pointees = states.map(bound => {
    const context = { ...nextState(bound), sourceStorageSubject: storage.subject };
    const carrier = storage.subject.projection.length === 0
      ? scope.resolveSelectedValueWithState(storage.subject.node, storage.type, storage.sourceFile, context)
      : scope.resolveTypeWithState(storage.type, storage.sourceFile, context);
    return csharpRuntimeLocationPointee(getCsharpNullableElementTargetType(carrier) ?? carrier);
  });
  const first = pointees[0];
  if (first === undefined || pointees.some(pointee => pointee === undefined || !targetTypeRefEquals(pointee, first))) return {
    kind: "unresolved", reason: "The pointer producer does not have one exact native pointee carrier in every activation.",
  };
  return Object.freeze({ kind: "resolved", type: first });
}
