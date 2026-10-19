import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import { getCsharpLocalBindingName } from "../../bindings/binding-state.js";
import { planCsharpFrameClosureReference } from "../../bindings/capture-closures.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";

export function planCsharpLexicalFunctionValues(
  children: readonly Node[], sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
): ReadonlyMap<Node, readonly CsharpStatement[]> {
  const statements = new Map<Node, CsharpStatement[]>();
  for (const statement of children) for (const selected of input.program.records.lexicalValues.get(statement) ?? []) {
    const { declaration, references } = selected;
    const type = csharpTypeFromTargetTypeRef(selected.carrier, input.scope.typeParameterNames);
    const functionName = input.program.source.ast.name(declaration);
    const methodName = functionName === undefined ? undefined : getCsharpLocalBindingName(functionName, input, state);
    if (type === undefined || methodName === undefined)
      failCsharpPlannerInvariant("An admitted lexical function requires its native delegate type and method name.", declaration);
    const expression = input.program.records.captureClosure.get(declaration) === undefined
      ? { kind: "IdentifierName" as const, name: methodName }
      : planCsharpFrameClosureReference(declaration, input, diagnostics, state);
    if (expression === undefined) failCsharpPlannerInvariant("An admitted lexical function requires its native closure expression.", declaration);
    const initializer: CsharpExpression = { kind: "ObjectCreationExpression", type,
      arguments: [{ kind: "Argument", expression }] };
    if (selected.storage.kind === "inline") {
      state.expressionOverrides.set(selected.storage.reference, initializer);
      continue;
    }
    const { name } = selected.storage;
    for (const reference of references) state.expressionOverrides.set(reference, { kind: "IdentifierName", name });
    const scheduled = statements.get(statement) ?? [];
    scheduled.push({ kind: "LocalDeclarationStatement", type, name,
      initializer });
    statements.set(statement, scheduled);
  }
  return statements;
}
