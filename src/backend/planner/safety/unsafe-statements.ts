import type {
  CsharpBlock,
  CsharpCatchClause,
  CsharpForInitializer,
  CsharpStatement,
  CsharpSwitchLabel,
  CsharpSwitchSection,
} from "../../target-ast/roslyn/index.js";
import {
  csharpTypeRequiresUnsafe,
} from "../types/target-types.js";
import {
  expressionRequiresUnsafe,
  expressionRequiresUnsafePermission,
  optionalExpressionRequiresUnsafe,
  optionalExpressionRequiresUnsafePermission,
} from "./unsafe-expressions.js";
import {
  optionalTypeRequiresUnsafe,
} from "./unsafe-type-members.js";

export function optionalBlockRequiresUnsafe(block: CsharpBlock | undefined): boolean {
  return block !== undefined && blockRequiresUnsafe(block);
}

export function blockRequiresUnsafe(block: CsharpBlock): boolean {
  return block.statements.some((statement) =>
    statementContainsUnsafe(statement, "context")
  );
}

export function blockRequiresUnsafePermission(block: CsharpBlock): boolean {
  return block.statements.some((statement) =>
    statementContainsUnsafe(statement, "permission")
  );
}

type CsharpUnsafeScanMode = "context" | "permission";

function statementContainsUnsafe(
  statement: CsharpStatement,
  mode: CsharpUnsafeScanMode,
): boolean {
  switch (statement.kind) {
    case "ReturnStatement":
      return optionalExpressionContainsUnsafe(statement.expression, mode);
    case "YieldReturnStatement":
      return expressionContainsUnsafe(statement.expression, mode);
    case "YieldBreakStatement":
      return false;
    case "ExpressionStatement":
      return expressionContainsUnsafe(statement.expression, mode);
    case "LocalDeclarationStatement":
      return (mode === "context" && csharpTypeRequiresUnsafe(statement.type)) ||
        optionalExpressionContainsUnsafe(statement.initializer, mode);
    case "Block":
      return blockContainsUnsafe(statement.body, mode);
    case "UnsafeStatement":
      return mode === "permission";
    case "ThrowStatement":
      return optionalExpressionContainsUnsafe(statement.expression, mode);
    case "LabeledStatement":
      return statementContainsUnsafe(statement.statement, mode);
    case "SwitchStatement":
      return expressionContainsUnsafe(statement.expression, mode) ||
        statement.sections.some((section) =>
          switchSectionContainsUnsafe(section, mode)
        );
    case "TryStatement":
      return blockContainsUnsafe(statement.tryBody, mode) ||
        optionalCatchContainsUnsafe(statement.catchClause, mode) ||
        optionalBlockContainsUnsafe(statement.finallyBody, mode);
    case "ForEachStatement":
      return (mode === "context" && csharpTypeRequiresUnsafe(
        statement.itemType,
      )) || expressionContainsUnsafe(statement.collection, mode) ||
        blockContainsUnsafe(statement.body, mode);
    case "LocalFunctionStatement":
      return (mode === "context" && (
        csharpTypeRequiresUnsafe(statement.returnType) ||
        statement.parameters.some((parameter) =>
          csharpTypeRequiresUnsafe(parameter.type)
        )
      )) || blockContainsUnsafe(statement.body, mode);
    case "IfStatement":
      return expressionContainsUnsafe(statement.condition, mode) ||
        blockContainsUnsafe(statement.thenBody, mode) ||
        optionalBlockContainsUnsafe(statement.elseBody, mode);
    case "WhileStatement":
      return expressionContainsUnsafe(statement.condition, mode) ||
        blockContainsUnsafe(statement.body, mode);
    case "DoStatement":
      return blockContainsUnsafe(statement.body, mode) ||
        expressionContainsUnsafe(statement.condition, mode);
    case "ForStatement":
      return optionalForInitializerContainsUnsafe(statement.initializer, mode) ||
        optionalExpressionContainsUnsafe(statement.condition, mode) ||
        optionalExpressionContainsUnsafe(statement.incrementor, mode) ||
        blockContainsUnsafe(statement.body, mode);
    case "GotoSwitchStatement":
      return switchLabelContainsUnsafe(statement.label, mode);
    case "BreakStatement":
    case "ContinueStatement":
    case "GotoStatement":
      return false;
  }
}

function blockContainsUnsafe(
  block: CsharpBlock,
  mode: CsharpUnsafeScanMode,
): boolean {
  return mode === "context"
    ? blockRequiresUnsafe(block)
    : blockRequiresUnsafePermission(block);
}

function optionalBlockContainsUnsafe(
  block: CsharpBlock | undefined,
  mode: CsharpUnsafeScanMode,
): boolean {
  return block !== undefined && blockContainsUnsafe(block, mode);
}

function expressionContainsUnsafe(
  expression: Parameters<typeof expressionRequiresUnsafe>[0],
  mode: CsharpUnsafeScanMode,
): boolean {
  return mode === "context"
    ? expressionRequiresUnsafe(expression, blockRequiresUnsafe)
    : expressionRequiresUnsafePermission(
        expression,
        blockRequiresUnsafePermission,
      );
}

function optionalExpressionContainsUnsafe(
  expression: Parameters<typeof optionalExpressionRequiresUnsafe>[0],
  mode: CsharpUnsafeScanMode,
): boolean {
  return mode === "context"
    ? optionalExpressionRequiresUnsafe(expression, blockRequiresUnsafe)
    : optionalExpressionRequiresUnsafePermission(
        expression,
        blockRequiresUnsafePermission,
      );
}

function switchSectionContainsUnsafe(
  section: CsharpSwitchSection,
  mode: CsharpUnsafeScanMode,
): boolean {
  return switchLabelContainsUnsafe(section.label, mode) ||
    section.statements.some((statement) =>
      statementContainsUnsafe(statement, mode)
    );
}

function switchLabelContainsUnsafe(
  label: CsharpSwitchLabel,
  mode: CsharpUnsafeScanMode,
): boolean {
  return label.kind === "CaseSwitchLabel" &&
    expressionContainsUnsafe(label.expression, mode);
}

function optionalCatchContainsUnsafe(
  catchClause: CsharpCatchClause | undefined,
  mode: CsharpUnsafeScanMode,
): boolean {
  return catchClause !== undefined &&
    ((mode === "context" && optionalTypeRequiresUnsafe(
      catchClause.variableType,
    )) || blockContainsUnsafe(catchClause.body, mode));
}

function optionalForInitializerContainsUnsafe(
  initializer: CsharpForInitializer | undefined,
  mode: CsharpUnsafeScanMode,
): boolean {
  if (initializer === undefined) {
    return false;
  }
  return initializer.kind === "Expression"
    ? expressionContainsUnsafe(initializer.expression, mode)
    : initializer.locals.some((local) =>
      (mode === "context" && csharpTypeRequiresUnsafe(local.type)) ||
        optionalExpressionContainsUnsafe(local.initializer, mode)
    );
}
