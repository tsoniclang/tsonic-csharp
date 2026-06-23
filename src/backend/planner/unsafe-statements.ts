import type {
  CsharpBlock,
  CsharpCatchClause,
  CsharpForInitializer,
  CsharpStatement,
  CsharpSwitchLabel,
  CsharpSwitchSection,
} from "../roslyn/syntax.js";
import {
  csharpTypeRequiresUnsafe,
} from "./target-types.js";
import {
  expressionRequiresUnsafe,
  optionalExpressionRequiresUnsafe,
} from "./unsafe-expressions.js";
import {
  optionalTypeRequiresUnsafe,
} from "./unsafe-type-members.js";

export function optionalBlockRequiresUnsafe(block: CsharpBlock | undefined): boolean {
  return block !== undefined && blockRequiresUnsafe(block);
}

export function blockRequiresUnsafe(block: CsharpBlock): boolean {
  return block.statements.some(statementRequiresUnsafe);
}

function statementRequiresUnsafe(statement: CsharpStatement): boolean {
  switch (statement.kind) {
    case "ReturnStatement":
      return optionalExpressionRequiresUnsafe(statement.expression, blockRequiresUnsafe);
    case "ExpressionStatement":
      return expressionRequiresUnsafe(statement.expression, blockRequiresUnsafe);
    case "LocalDeclarationStatement":
      return csharpTypeRequiresUnsafe(statement.type) ||
        optionalExpressionRequiresUnsafe(statement.initializer, blockRequiresUnsafe);
    case "Block":
      return blockRequiresUnsafe(statement.body);
    case "ThrowStatement":
      return expressionRequiresUnsafe(statement.expression, blockRequiresUnsafe);
    case "LabeledStatement":
      return statementRequiresUnsafe(statement.statement);
    case "SwitchStatement":
      return expressionRequiresUnsafe(statement.expression, blockRequiresUnsafe) ||
        statement.sections.some(switchSectionRequiresUnsafe);
    case "TryStatement":
      return blockRequiresUnsafe(statement.tryBody) ||
        optionalCatchRequiresUnsafe(statement.catchClause) ||
        optionalBlockRequiresUnsafe(statement.finallyBody);
    case "ForEachStatement":
      return csharpTypeRequiresUnsafe(statement.itemType) ||
        expressionRequiresUnsafe(statement.collection, blockRequiresUnsafe) ||
        blockRequiresUnsafe(statement.body);
    case "IfStatement":
      return expressionRequiresUnsafe(statement.condition, blockRequiresUnsafe) ||
        blockRequiresUnsafe(statement.thenBody) ||
        optionalBlockRequiresUnsafe(statement.elseBody);
    case "WhileStatement":
      return expressionRequiresUnsafe(statement.condition, blockRequiresUnsafe) || blockRequiresUnsafe(statement.body);
    case "DoStatement":
      return blockRequiresUnsafe(statement.body) || expressionRequiresUnsafe(statement.condition, blockRequiresUnsafe);
    case "ForStatement":
      return optionalForInitializerRequiresUnsafe(statement.initializer) ||
        optionalExpressionRequiresUnsafe(statement.condition, blockRequiresUnsafe) ||
        optionalExpressionRequiresUnsafe(statement.incrementor, blockRequiresUnsafe) ||
        blockRequiresUnsafe(statement.body);
    case "GotoSwitchStatement":
      return switchLabelRequiresUnsafe(statement.label);
    case "BreakStatement":
    case "ContinueStatement":
    case "GotoStatement":
      return false;
  }
}

function switchSectionRequiresUnsafe(section: CsharpSwitchSection): boolean {
  return switchLabelRequiresUnsafe(section.label) || section.statements.some(statementRequiresUnsafe);
}

function switchLabelRequiresUnsafe(label: CsharpSwitchLabel): boolean {
  return label.kind === "CaseSwitchLabel" && expressionRequiresUnsafe(label.expression, blockRequiresUnsafe);
}

function optionalCatchRequiresUnsafe(catchClause: CsharpCatchClause | undefined): boolean {
  return catchClause !== undefined &&
    (optionalTypeRequiresUnsafe(catchClause.variableType) || blockRequiresUnsafe(catchClause.body));
}

function optionalForInitializerRequiresUnsafe(initializer: CsharpForInitializer | undefined): boolean {
  if (initializer === undefined) {
    return false;
  }
  return initializer.kind === "Expression"
    ? expressionRequiresUnsafe(initializer.expression, blockRequiresUnsafe)
    : initializer.locals.some((local) =>
      csharpTypeRequiresUnsafe(local.type) || optionalExpressionRequiresUnsafe(local.initializer, blockRequiresUnsafe)
    );
}
