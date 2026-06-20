import { AsVariableDeclaration } from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type { CsharpLocalDeclaration, CsharpStatement } from "../roslyn/syntax.js";
import { getCsharpTypeForNode } from "./csharp-types.js";
import { planExpressionWithExpectedType } from "./expressions.js";
import { planIdentifierName } from "./names.js";
import { planVariableBindingStatements } from "./bindings.js";
import type { DestructuringPlannerState } from "./bindings.js";

export function planLocalDeclaration(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpLocalDeclaration {
  const variable = AsVariableDeclaration(declarationNode)!;
  const typeSubject = variable.Type ?? variable.Initializer ?? variable.name;
  const type = getCsharpTypeForNode(typeSubject, sourceFile, input, undefined, diagnostics);
  return {
    kind: "VariableDeclarator",
    name: planIdentifierName(variable.name, "LocalDeclarationStatement", input, diagnostics, "Local binding name"),
    type,
    ...(variable.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(variable.Initializer, sourceFile, input, diagnostics, type, variable.Type ?? variable.name) }
      : {}),
  };
}

export function planLocalDeclarationStatements(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
): readonly CsharpStatement[] {
  const variable = AsVariableDeclaration(declarationNode)!;
  const destructured = planVariableBindingStatements(variable.name, variable.Initializer, sourceFile, input, diagnostics, state);
  if (destructured !== undefined) {
    return destructured;
  }
  const local = planLocalDeclaration(declarationNode, sourceFile, input, diagnostics);
  return [{
    kind: "LocalDeclarationStatement",
    name: local.name,
    type: local.type,
    ...(local.initializer === undefined ? {} : { initializer: local.initializer }),
  }];
}
