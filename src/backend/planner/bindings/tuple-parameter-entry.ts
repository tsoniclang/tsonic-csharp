import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpCallableParameterEmission } from "../../../target-model/records/parameter-emission.js";
import type { CsharpExpression, CsharpStatement, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { CsharpEntryBinding } from "./binding-patterns.js";
import { allocateSyntheticParameter, declareCsharpLocalBindingName } from "./binding-state.js";
import { planParameterBindingPrelude } from "./planning.js";
import { planCsharpParameterStorageDeclaration } from "./typed-location-identities.js";
import { planCsharpParameterCapture } from "./capture-storage.js";
import { csharpTupleExpression, csharpTupleType } from "../types/tuples.js";
import { csharpTypeFromTargetTypeRefWithObjectShapeDeclarations } from "../types/target-type-object-shapes.js";
import { applyCsharpConversionSelection } from "../expressions/conversions.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpTupleParameterEntry(node: Node, emission: CsharpCallableParameterEmission,
  parameters: readonly { readonly name: string; readonly type: CsharpTypeNode }[], sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[], state: DestructuringPlannerState):
  { readonly prelude: readonly CsharpStatement[]; readonly entryBindings: readonly CsharpEntryBinding[] } {
  const binding = input.program.source.ast.name(node);
  const type = csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(input, emission.carrier, diagnostics, node);
  const entry = input.program.records.lambdaParameterEntry.get(node);
  if (binding === undefined || type === undefined || emission.incoming.kind !== "tuple" ||
      parameters.length !== emission.incoming.parameters.length || entry === undefined || entry.kind === "default")
    failCsharpPlannerInvariant("An admitted tuple-rest entry requires its exact native slots and source storage.", node);
  const name = emission.binding === "identifier" ? declareCsharpLocalBindingName(binding, input, state)
    : allocateSyntheticParameter(state);
  const tuple = csharpTupleExpression(parameters.map(parameter => ({ kind: "IdentifierName", name: parameter.name })),
    csharpTupleType(parameters.map(parameter => parameter.type)));
  const initializer: CsharpExpression | undefined = entry.kind === "conversion"
    ? applyCsharpConversionSelection(node, sourceFile, input, diagnostics, entry.source, entry.target, entry.conversion, tuple)
    : tuple;
  if (initializer === undefined) failCsharpPlannerInvariant("An admitted tuple-rest entry requires its exact source conversion.", node);
  const prelude: CsharpStatement[] = [{ kind: "LocalDeclarationStatement", name, type, initializer }];
  const entryBindings: CsharpEntryBinding[] = [];
  if (emission.binding === "pattern") {
    prelude.push(...planParameterBindingPrelude(binding, name, sourceFile, input, diagnostics, state, value => entryBindings.push(value)));
  } else {
    const identity = planCsharpParameterStorageDeclaration(node, input, state, diagnostics);
    if (identity !== undefined) { prelude.push(identity); entryBindings.push(identity); }
    const capture = planCsharpParameterCapture(node, input, state);
    if (capture !== undefined) prelude.push(capture);
    if (capture === undefined && input.program.records.nativeBacking.get(node) === undefined) entryBindings.push({ name, type });
  }
  return { prelude, entryBindings };
}
