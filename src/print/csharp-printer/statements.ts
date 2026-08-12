import type {
  CsharpForInitializer,
  CsharpLocalDeclaration,
  CsharpStatement,
  CsharpSwitchSection,
} from "../../backend/roslyn/syntax.js";
import type { CsharpPrintContext } from "./context.js";
import { failUnsupportedCsharpSyntax } from "./fail-closed.js";
import { indentLines } from "./format.js";

export function printCsharpStatement(
  statement: CsharpStatement,
  context: CsharpPrintContext,
): string {
  switch (statement.kind) {
    case "ReturnStatement":
      return statement.expression === undefined ? "return;" : `return ${context.printExpression(statement.expression)};`;
    case "YieldReturnStatement":
      return `yield return ${context.printExpression(statement.expression)};`;
    case "YieldBreakStatement":
      return "yield break;";
    case "ExpressionStatement":
      return `${context.printExpression(statement.expression)};`;
    case "LocalDeclarationStatement":
      return `${printCsharpLocalDeclaration(statement, context)};`;
    case "Block":
      return ["{", ...indentLines(context.printStatements(statement.body.statements)), "}"].join("\n");
    case "UnsafeStatement":
      return ["unsafe", "{", ...indentLines(context.printStatements(statement.body.statements)), "}"].join("\n");
    case "BreakStatement":
      return "break;";
    case "ContinueStatement":
      return "continue;";
    case "GotoStatement":
      return `goto ${statement.label};`;
    case "GotoSwitchStatement":
      return statement.label.kind === "DefaultSwitchLabel"
        ? "goto default;"
        : `goto case ${context.printExpression(statement.label.expression)};`;
    case "ThrowStatement":
      return statement.expression === undefined
        ? "throw;"
        : `throw ${context.printExpression(statement.expression)};`;
    case "LabeledStatement":
      return [`${statement.name}:`, ...indentLines(context.printStatement(statement.statement).split("\n"))].join("\n");
    case "SwitchStatement":
      return [
        `switch (${context.printExpression(statement.expression)})`,
        "{",
        ...indentLines(statement.sections.flatMap((section) => printCsharpSwitchSection(section, context))),
        "}",
      ].join("\n");
    case "TryStatement":
      return [
        "try",
        "{",
        ...indentLines(context.printStatements(statement.tryBody.statements)),
        "}",
        ...(statement.catchClause === undefined
          ? []
          : [
              statement.catchClause.variableName === undefined
                ? "catch"
                : `catch (${context.printType(statement.catchClause.variableType)} ${statement.catchClause.variableName})`,
              "{",
              ...indentLines(context.printStatements(statement.catchClause.body.statements)),
              "}",
            ]),
        ...(statement.finallyBody === undefined
          ? []
          : ["finally", "{", ...indentLines(context.printStatements(statement.finallyBody.statements)), "}"]),
      ].join("\n");
    case "ForEachStatement":
      return [
        `${statement.await === true ? "await " : ""}foreach (${context.printType(statement.itemType)} ${statement.itemName} in ${context.printExpression(statement.collection)})`,
        "{",
        ...indentLines(context.printStatements(statement.body.statements)),
        "}",
      ].join("\n");
    case "LocalFunctionStatement":
      return [
        `${statement.async === true ? "async " : ""}${context.printType(statement.returnType)} ${statement.name}(${statement.parameters.map(context.printParameter).join(", ")})`,
        "{",
        ...indentLines(context.printStatements(statement.body.statements)),
        "}",
      ].join("\n");
    case "IfStatement":
      return [
        `if (${context.printExpression(statement.condition)})`,
        "{",
        ...indentLines(context.printStatements(statement.thenBody.statements)),
        "}",
        ...(statement.elseBody === undefined
          ? []
          : ["else", "{", ...indentLines(context.printStatements(statement.elseBody.statements)), "}"]),
      ].join("\n");
    case "WhileStatement":
      return [
        `while (${context.printExpression(statement.condition)})`,
        "{",
        ...indentLines(context.printStatements(statement.body.statements)),
        "}",
      ].join("\n");
    case "DoStatement":
      return [
        "do",
        "{",
        ...indentLines(context.printStatements(statement.body.statements)),
        "}",
        `while (${context.printExpression(statement.condition)});`,
      ].join("\n");
    case "ForStatement":
      return [
        `for (${printCsharpForInitializer(statement.initializer, context)}; ${statement.condition === undefined ? "" : context.printExpression(statement.condition)}; ${statement.incrementor === undefined ? "" : context.printExpression(statement.incrementor)})`,
        "{",
        ...indentLines(context.printStatements(statement.body.statements)),
        "}",
      ].join("\n");
  }
  return failUnsupportedCsharpSyntax(statement, "statement");
}

export function printCsharpStatements(
  statements: readonly CsharpStatement[],
  context: CsharpPrintContext,
): string[] {
  return statements.flatMap((statement) => context.printStatement(statement).split("\n"));
}

function printCsharpSwitchSection(
  section: CsharpSwitchSection,
  context: CsharpPrintContext,
): string[] {
  const label = section.label.kind === "DefaultSwitchLabel"
    ? "default:"
    : `case ${context.printExpression(section.label.expression)}:`;
  return [label, ...indentLines(context.printStatements(section.statements))];
}

function printCsharpLocalDeclaration(
  local: Pick<CsharpLocalDeclaration, "name" | "type" | "initializer">,
  context: CsharpPrintContext,
): string {
  return local.initializer === undefined
    ? `${context.printType(local.type)} ${local.name}`
    : `${context.printType(local.type)} ${local.name} = ${context.printExpression(local.initializer)}`;
}

function printCsharpForInitializer(
  initializer: CsharpForInitializer | undefined,
  context: CsharpPrintContext,
): string {
  if (initializer === undefined) {
    return "";
  }
  switch (initializer.kind) {
    case "Expression":
      return context.printExpression(initializer.expression);
    case "VariableDeclaration": {
      const first = initializer.locals[0];
      if (first === undefined) {
        return "";
      }
      return `${context.printType(first.type)} ${initializer.locals.map((local) => printCsharpLocalDeclarator(local, context)).join(", ")}`;
    }
  }
  return failUnsupportedCsharpSyntax(initializer, "for initializer");
}

function printCsharpLocalDeclarator(local: CsharpLocalDeclaration, context: CsharpPrintContext): string {
  return local.initializer === undefined
    ? local.name
    : `${local.name} = ${context.printExpression(local.initializer)}`;
}
