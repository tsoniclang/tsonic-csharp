import {
  AsVariableDeclarationList,
  AsVariableStatement,
  HasSyntacticModifier,
  ModifierFlagsExport,
  NodeFlagsConst,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpStatement,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../roslyn/syntax.js";
import { planLocalDeclaration } from "./locals.js";
import { planStatements } from "./statements.js";
import { planValueTypeDeclaration } from "./value-types.js";
import type { DestructuringPlannerState } from "./bindings.js";

export function planTopLevelVariableStatement(
  statement: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  namespaceMembers: CsharpTypeDeclaration[],
  moduleMembers: CsharpTypeMember[],
  topLevelStatements: CsharpStatement[],
  state: DestructuringPlannerState,
  executableTopLevelSourceFile: boolean,
): void {
  const declarationList = AsVariableStatement(statement)!.DeclarationList;
  const variableDeclarationList = AsVariableDeclarationList(declarationList)!;
  const declarations = variableDeclarationList.Declarations?.Nodes ?? [];
  const isConst = (variableDeclarationList.Flags & NodeFlagsConst) !== 0;
  const isExported = HasSyntacticModifier(statement, ModifierFlagsExport);
  if (declarations.length === 0) {
    topLevelStatements.push(...planStatements(statement, sourceFile, input, diagnostics, state));
    return;
  }
  if (executableTopLevelSourceFile && !isExported) {
    topLevelStatements.push(...planStatements(statement, sourceFile, input, diagnostics, state));
    return;
  }
  for (const declaration of declarations) {
    if (declaration === undefined) {
      continue;
    }
    const valueType = input.facts.getStructFact(declaration);
    if (valueType !== undefined) {
      namespaceMembers.push(planValueTypeDeclaration(declaration, valueType, sourceFile, input, diagnostics));
      continue;
    }
    const field = planLocalDeclaration(declaration, sourceFile, input, diagnostics);
    moduleMembers.push({
      kind: "FieldDeclaration",
      name: field.name,
      type: field.type,
      modifiers: isConst ? ["public", "static", "readonly"] : ["public", "static"],
      ...(field.initializer === undefined ? {} : { initializer: field.initializer }),
    });
  }
}
