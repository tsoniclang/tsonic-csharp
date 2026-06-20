import type {
  CsharpArgument,
  CsharpBlock,
  CsharpCatchClause,
  CsharpCompilationUnit,
  CsharpConstructorDeclaration,
  CsharpExpression,
  CsharpForInitializer,
  CsharpInterfaceMember,
  CsharpLambdaParameter,
  CsharpMember,
  CsharpModifier,
  CsharpParameter,
  CsharpStatement,
  CsharpSwitchLabel,
  CsharpSwitchSection,
  CsharpTypeDeclaration,
  CsharpTypeMember,
  CsharpTypeNode,
  CsharpTypeParameter,
} from "../ast/csharp-ast.js";
import { csharpTypeRequiresUnsafe } from "./target-types.js";

export function compilationUnitRequiresUnsafe(unit: CsharpCompilationUnit): boolean {
  return unit.members.some(memberRequiresUnsafe);
}

export function markCompilationUnitUnsafe(unit: CsharpCompilationUnit): CsharpCompilationUnit {
  return {
    ...unit,
    members: unit.members.map(markMemberUnsafe),
  };
}

function markMemberUnsafe(member: CsharpMember): CsharpMember {
  if (member.kind === "namespace") {
    return {
      ...member,
      members: member.members.map(markTypeDeclarationUnsafe),
    };
  }
  return markTypeDeclarationUnsafe(member);
}

function markTypeDeclarationUnsafe(declaration: CsharpTypeDeclaration): CsharpTypeDeclaration {
  if (declaration.kind === "enum") {
    return declaration;
  }
  return {
    ...declaration,
    modifiers: withUnsafeModifier(declaration.modifiers),
  };
}

function withUnsafeModifier(modifiers: readonly CsharpModifier[]): readonly CsharpModifier[] {
  if (modifiers.includes("unsafe")) {
    return modifiers;
  }
  const access = modifiers.filter((modifier) => modifier === "public" || modifier === "internal" || modifier === "private");
  const rest = modifiers.filter((modifier) => modifier !== "public" && modifier !== "internal" && modifier !== "private");
  return [...access, "unsafe", ...rest];
}

function memberRequiresUnsafe(member: CsharpMember): boolean {
  return member.kind === "namespace"
    ? member.members.some(typeDeclarationRequiresUnsafe)
    : typeDeclarationRequiresUnsafe(member);
}

function typeDeclarationRequiresUnsafe(declaration: CsharpTypeDeclaration): boolean {
  switch (declaration.kind) {
    case "class":
      return optionalTypeRequiresUnsafe(declaration.baseType) ||
        (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters) ||
        declaration.members.some(typeMemberRequiresUnsafe);
    case "struct":
      return (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters) ||
        declaration.members.some(typeMemberRequiresUnsafe);
    case "interface":
      return (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters) ||
        declaration.members.some(interfaceMemberRequiresUnsafe);
    case "enum":
      return declaration.members.some((member) => optionalExpressionRequiresUnsafe(member.value));
  }
}

function typeMemberRequiresUnsafe(member: CsharpTypeMember): boolean {
  switch (member.kind) {
    case "constructor":
      return constructorRequiresUnsafe(member);
    case "method":
      return csharpTypeRequiresUnsafe(member.returnType) ||
        typeParametersRequireUnsafe(member.typeParameters) ||
        member.parameters.some(parameterRequiresUnsafe) ||
        blockRequiresUnsafe(member.body);
    case "field":
      return csharpTypeRequiresUnsafe(member.type) || optionalExpressionRequiresUnsafe(member.initializer);
    case "property":
      return csharpTypeRequiresUnsafe(member.type) ||
        optionalBlockRequiresUnsafe(member.getter) ||
        optionalBlockRequiresUnsafe(member.setter);
  }
}

function constructorRequiresUnsafe(member: CsharpConstructorDeclaration): boolean {
  return member.parameters.some(parameterRequiresUnsafe) ||
    (member.baseArguments ?? []).some(argumentRequiresUnsafe) ||
    blockRequiresUnsafe(member.body);
}

function interfaceMemberRequiresUnsafe(member: CsharpInterfaceMember): boolean {
  switch (member.kind) {
    case "interface-method":
      return csharpTypeRequiresUnsafe(member.returnType) ||
        typeParametersRequireUnsafe(member.typeParameters) ||
        member.parameters.some(parameterRequiresUnsafe);
    case "interface-property":
      return csharpTypeRequiresUnsafe(member.type);
    case "interface-indexer":
      return csharpTypeRequiresUnsafe(member.keyType) || csharpTypeRequiresUnsafe(member.valueType);
  }
}

function typeParametersRequireUnsafe(typeParameters: readonly CsharpTypeParameter[] | undefined): boolean {
  return (typeParameters ?? []).some((typeParameter) => (typeParameter.constraints ?? []).some(csharpTypeRequiresUnsafe));
}

function parameterRequiresUnsafe(parameter: CsharpParameter): boolean {
  return csharpTypeRequiresUnsafe(parameter.type) || optionalExpressionRequiresUnsafe(parameter.defaultValue);
}

function lambdaParameterRequiresUnsafe(parameter: CsharpLambdaParameter): boolean {
  return optionalTypeRequiresUnsafe(parameter.type);
}

function optionalTypeRequiresUnsafe(type: CsharpTypeNode | undefined): boolean {
  return type !== undefined && csharpTypeRequiresUnsafe(type);
}

function optionalBlockRequiresUnsafe(block: CsharpBlock | undefined): boolean {
  return block !== undefined && blockRequiresUnsafe(block);
}

function blockRequiresUnsafe(block: CsharpBlock): boolean {
  return block.statements.some(statementRequiresUnsafe);
}

function statementRequiresUnsafe(statement: CsharpStatement): boolean {
  switch (statement.kind) {
    case "return":
      return optionalExpressionRequiresUnsafe(statement.expression);
    case "expression":
      return expressionRequiresUnsafe(statement.expression);
    case "local":
      return csharpTypeRequiresUnsafe(statement.type) || optionalExpressionRequiresUnsafe(statement.initializer);
    case "block":
      return blockRequiresUnsafe(statement.body);
    case "throw":
      return expressionRequiresUnsafe(statement.expression);
    case "label":
      return statementRequiresUnsafe(statement.statement);
    case "switch":
      return expressionRequiresUnsafe(statement.expression) || statement.sections.some(switchSectionRequiresUnsafe);
    case "try":
      return blockRequiresUnsafe(statement.tryBody) ||
        optionalCatchRequiresUnsafe(statement.catchClause) ||
        optionalBlockRequiresUnsafe(statement.finallyBody);
    case "foreach":
      return csharpTypeRequiresUnsafe(statement.itemType) ||
        expressionRequiresUnsafe(statement.collection) ||
        blockRequiresUnsafe(statement.body);
    case "if":
      return expressionRequiresUnsafe(statement.condition) ||
        blockRequiresUnsafe(statement.thenBody) ||
        optionalBlockRequiresUnsafe(statement.elseBody);
    case "while":
      return expressionRequiresUnsafe(statement.condition) || blockRequiresUnsafe(statement.body);
    case "do":
      return blockRequiresUnsafe(statement.body) || expressionRequiresUnsafe(statement.condition);
    case "for":
      return optionalForInitializerRequiresUnsafe(statement.initializer) ||
        optionalExpressionRequiresUnsafe(statement.condition) ||
        optionalExpressionRequiresUnsafe(statement.incrementor) ||
        blockRequiresUnsafe(statement.body);
    case "goto-switch":
      return switchLabelRequiresUnsafe(statement.label);
    case "break":
    case "continue":
    case "goto":
      return false;
  }
}

function switchSectionRequiresUnsafe(section: CsharpSwitchSection): boolean {
  return switchLabelRequiresUnsafe(section.label) || section.statements.some(statementRequiresUnsafe);
}

function switchLabelRequiresUnsafe(label: CsharpSwitchLabel): boolean {
  return label.kind === "case" && expressionRequiresUnsafe(label.expression);
}

function optionalCatchRequiresUnsafe(catchClause: CsharpCatchClause | undefined): boolean {
  return catchClause !== undefined &&
    (optionalTypeRequiresUnsafe(catchClause.variableType) || blockRequiresUnsafe(catchClause.body));
}

function optionalForInitializerRequiresUnsafe(initializer: CsharpForInitializer | undefined): boolean {
  if (initializer === undefined) {
    return false;
  }
  return initializer.kind === "expression"
    ? expressionRequiresUnsafe(initializer.expression)
    : initializer.locals.some((local) => csharpTypeRequiresUnsafe(local.type) || optionalExpressionRequiresUnsafe(local.initializer));
}

function optionalExpressionRequiresUnsafe(expression: CsharpExpression | undefined): boolean {
  return expression !== undefined && expressionRequiresUnsafe(expression);
}

function expressionRequiresUnsafe(expression: CsharpExpression): boolean {
  switch (expression.kind) {
    case "type":
      return csharpTypeRequiresUnsafe(expression.type);
    case "parenthesized":
    case "await":
      return expressionRequiresUnsafe(expression.expression);
    case "call":
      return expressionRequiresUnsafe(expression.callee) || expression.arguments.some(argumentRequiresUnsafe);
    case "new":
      return csharpTypeRequiresUnsafe(expression.type) || expression.arguments.some(argumentRequiresUnsafe);
    case "objectInitializer":
      return csharpTypeRequiresUnsafe(expression.type) ||
        expression.assignments.some((assignment) => expressionRequiresUnsafe(assignment.expression));
    case "member":
    case "optionalMember":
      return expressionRequiresUnsafe(expression.receiver);
    case "element":
    case "optionalElement":
      return expressionRequiresUnsafe(expression.receiver) || expressionRequiresUnsafe(expression.argument);
    case "binary":
      return expressionRequiresUnsafe(expression.left) || expressionRequiresUnsafe(expression.right);
    case "isType":
      return expressionRequiresUnsafe(expression.expression) || csharpTypeRequiresUnsafe(expression.type);
    case "prefixUnary":
      return expressionRequiresUnsafe(expression.operand);
    case "postfixUnary":
      return expressionRequiresUnsafe(expression.operand);
    case "conditional":
      return expressionRequiresUnsafe(expression.condition) ||
        expressionRequiresUnsafe(expression.whenTrue) ||
        expressionRequiresUnsafe(expression.whenFalse);
    case "array":
      return optionalTypeRequiresUnsafe(expression.elementType) || expression.elements.some(expressionRequiresUnsafe);
    case "tuple":
      return expression.elements.some(expressionRequiresUnsafe);
    case "default":
      return csharpTypeRequiresUnsafe(expression.type);
    case "lambda":
      return expression.parameters.some(lambdaParameterRequiresUnsafe) ||
        (Array.isArray((expression.body as { readonly statements?: unknown }).statements)
          ? blockRequiresUnsafe(expression.body as CsharpBlock)
          : expressionRequiresUnsafe(expression.body as CsharpExpression));
    case "interpolatedString":
      return expression.parts.some((part) => part.kind === "expression" && expressionRequiresUnsafe(part.expression));
    case "identifier":
    case "invalid":
    case "literal":
    case "charLiteral":
      return false;
  }
}

function argumentRequiresUnsafe(argument: CsharpArgument): boolean {
  return expressionRequiresUnsafe(argument.expression);
}
