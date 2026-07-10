import {
  AsVariableDeclaration,
  AsVariableStatement,
  HasSourceKind,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpExpression,
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
  const declarations = declarationList === undefined
    ? []
    : input.ast.children(declarationList)
      .filter((declaration): declaration is Node => declaration !== undefined && input.ast.is.IsVariableDeclaration(declaration));
  const isConst = declarationList !== undefined && input.ast.hasModifierKind(declarationList, "const");
  if (declarations.length === 0) {
    topLevelStatements.push(...planStatements(statement, sourceFile, input, diagnostics, state));
    return;
  }
  for (const declaration of declarations) {
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
      const planned = topLevelBindingFields(destructured, isConst, diagnostics, declaration);
      moduleMembers.push(...planned.fields);
      topLevelStatements.push(...planned.statements);
      continue;
    }
    const field = planLocalDeclaration(declaration, sourceFile, input, diagnostics, state);
    moduleMembers.push({
      kind: "FieldDeclaration",
      name: field.name,
      type: field.type,
      modifiers: isConst ? ["public", "static", "readonly"] : ["public", "static"],
    });
    if (field.initializer !== undefined) {
      topLevelStatements.push(topLevelFieldAssignment(field.name, field.initializer));
    }
  }
}

interface TopLevelBindingPlan {
  readonly fields: readonly CsharpTypeMember[];
  readonly statements: readonly CsharpStatement[];
}

function topLevelBindingFields(
  statements: readonly CsharpStatement[],
  isConst: boolean,
  diagnostics: TargetDiagnostic[],
  diagnosticNode: Node,
): TopLevelBindingPlan {
  const fields: CsharpTypeMember[] = [];
  const initializers: CsharpStatement[] = [];
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
    });
    if (statement.initializer !== undefined) {
      initializers.push(topLevelFieldAssignment(statement.name, statement.initializer));
    }
  }
  return {
    fields,
    statements: initializers,
  };
}

function topLevelFieldAssignment(
  name: string,
  initializer: CsharpExpression,
): CsharpStatement {
  return {
    kind: "ExpressionStatement",
    expression: {
      kind: "AssignmentExpression",
      left: { kind: "IdentifierName", name },
      operatorToken: { kind: "EqualsToken" },
      right: initializer,
    },
  };
}

function isBindingPattern(node: Node | undefined, input: TargetCompileInput): boolean {
  return HasSourceKind(input.ast, node, KindObjectBindingPattern) ||
    HasSourceKind(input.ast, node, KindArrayBindingPattern);
}
