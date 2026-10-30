import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression, CsharpStatement } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import type { DestructuringPlannerState } from "../../bindings/binding-state.js";
import { getCsharpLocalBindingName } from "../../bindings/binding-state.js";
import { planCsharpFrameClosureReference } from "../../bindings/capture-closures.js";
import { failCsharpPlannerInvariant } from "../../diagnostics.js";
import { csharpTypeFromTargetTypeRef } from "../../types/render.js";

export function planCsharpLexicalFunctionValues(
  children: readonly Node[], _sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const statements: CsharpStatement[] = [];
  for (const statement of children) for (const selected of input.program.records.lexicalValues.get(statement) ?? []) {
    const { declaration, references } = selected;
    const type = csharpTypeFromTargetTypeRef(selected.carrier, input.scope.typeParameterNames);
    const functionName = input.program.source.ast.name(declaration);
    const methodName = functionName === undefined ? undefined : getCsharpLocalBindingName(functionName, input, state);
    if (type === undefined || methodName === undefined)
      failCsharpPlannerInvariant("An admitted lexical function requires its native delegate type and method name.", declaration);
    const closure = input.program.records.captureClosure.get(declaration);
    const expression = closure === undefined
      ? { kind: "IdentifierName" as const, name: methodName }
      : planCsharpFrameClosureReference(declaration, input, diagnostics, state)?.expression;
    if (expression === undefined) failCsharpPlannerInvariant("An admitted lexical function requires its native closure expression.", declaration);
    const initializer: CsharpExpression = closure === undefined ? { kind: "ObjectCreationExpression", type,
      arguments: [{ kind: "Argument", expression }] } : expression;
    const name = input.names.temporaryName(`__tsonic_function_value_${input.program.source.ast.pos(declaration)}`);
    const value: CsharpExpression = { kind: "AssignmentExpression", operatorToken: { kind: "QuestionQuestionEqualsToken" },
      left: { kind: "IdentifierName", name }, right: initializer };
    for (const reference of references) state.expressionOverrides.set(reference, value);
    statements.push({ kind: "LocalDeclarationStatement", type: { kind: "NullableType", inner: type }, name,
      initializer: { kind: "LiteralExpression", value: null } });
  }
  return Object.freeze(statements);
}
