import {
  AsVariableDeclaration,
  AsVariableDeclarationList,
  AsVariableStatement,
  HasSourceKind,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  NodeFlagsConst,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpStatement,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../roslyn/syntax.js";
import { planLocalDeclaration, planLocalDeclarationStatements } from "./locals.js";
import { planStatements } from "./statements.js";
import { planValueTypeDeclaration } from "./value-types.js";
import type { DestructuringPlannerState } from "./bindings.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";

export function planTopLevelVariableStatement(
  statement: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  namespaceMembers: CsharpTypeDeclaration[],
  moduleMembers: CsharpTypeMember[],
  topLevelStatements: CsharpStatement[],
  state: DestructuringPlannerState,
  _executableTopLevelSourceFile: boolean,
): void {
  const declarationList = AsVariableStatement(statement)!.DeclarationList;
  const variableDeclarationList = AsVariableDeclarationList(declarationList)!;
  const declarations = variableDeclarationList.Declarations?.Nodes ?? [];
  const isConst = (variableDeclarationList.Flags & NodeFlagsConst) !== 0;
  if (declarations.length === 0) {
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
    const variable = AsVariableDeclaration(declaration)!;
    const destructured = isBindingPattern(variable.name, input)
      ? planLocalDeclarationStatements(declaration, sourceFile, input, diagnostics, state)
      : undefined;
    if (destructured !== undefined) {
      moduleMembers.push(...topLevelBindingFields(destructured, isConst, diagnostics, declaration));
      continue;
    }
    const field = planLocalDeclaration(declaration, sourceFile, input, diagnostics, state);
    moduleMembers.push({
      kind: "FieldDeclaration",
      name: field.name,
      type: field.type,
      modifiers: isConst ? ["public", "static", "readonly"] : ["public", "static"],
      ...(field.initializer === undefined ? {} : { initializer: field.initializer }),
    });
  }
}

function topLevelBindingFields(
  statements: readonly CsharpStatement[],
  isConst: boolean,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
): readonly CsharpTypeMember[] {
  const fields: CsharpTypeMember[] = [];
  for (const statement of statements) {
    if (statement.kind !== "LocalDeclarationStatement") {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticNode, "Top-level destructuring requires field-initializable binding projections."));
      continue;
    }
    const synthetic = statement.name.startsWith("__tsonic_destructure");
    fields.push({
      kind: "FieldDeclaration",
      name: statement.name,
      type: statement.type,
      modifiers: [
        synthetic ? "private" : "public",
        "static",
        ...(isConst ? ["readonly" as const] : []),
      ],
      ...(statement.initializer === undefined ? {} : { initializer: statement.initializer }),
    });
  }
  return fields;
}

function isBindingPattern(node: Node | undefined, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, node, KindObjectBindingPattern) ||
    HasSourceKind(input.ast, node, KindArrayBindingPattern);
}
