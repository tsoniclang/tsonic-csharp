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
  CsharpParameter,
  CsharpStatement,
  CsharpSwitchLabel,
  CsharpSwitchSection,
  CsharpTypeDeclaration,
  CsharpTypeMember,
  CsharpTypeNode,
  CsharpTypeParameter,
} from "../roslyn/syntax.js";
import { csharpTypeRequiresUnsafe } from "./target-types.js";

export function compilationUnitRequiresUnsafe(unit: CsharpCompilationUnit): boolean {
  return unit.members.some(memberRequiresUnsafe);
}

function memberRequiresUnsafe(member: CsharpMember): boolean {
  return member.kind === "NamespaceDeclaration"
    ? member.members.some(typeDeclarationRequiresUnsafe)
    : typeDeclarationRequiresUnsafe(member);
}

function typeDeclarationRequiresUnsafe(declaration: CsharpTypeDeclaration): boolean {
  switch (declaration.kind) {
    case "ClassDeclaration":
      return optionalTypeRequiresUnsafe(declaration.baseType) ||
        (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters) ||
        declaration.members.some(typeMemberRequiresUnsafe);
    case "StructDeclaration":
      return (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters) ||
        declaration.members.some(typeMemberRequiresUnsafe);
    case "InterfaceDeclaration":
      return (declaration.interfaces ?? []).some(csharpTypeRequiresUnsafe) ||
        typeParametersRequireUnsafe(declaration.typeParameters) ||
        declaration.members.some(interfaceMemberRequiresUnsafe);
    case "EnumDeclaration":
      return declaration.members.some((member) => optionalExpressionRequiresUnsafe(member.value));
  }
}

function typeMemberRequiresUnsafe(member: CsharpTypeMember): boolean {
  switch (member.kind) {
    case "ConstructorDeclaration":
      return constructorRequiresUnsafe(member);
    case "MethodDeclaration":
      return csharpTypeRequiresUnsafe(member.returnType) ||
        typeParametersRequireUnsafe(member.typeParameters) ||
        member.parameters.some(parameterRequiresUnsafe) ||
        blockRequiresUnsafe(member.body);
    case "FieldDeclaration":
      return csharpTypeRequiresUnsafe(member.type) || optionalExpressionRequiresUnsafe(member.initializer);
    case "PropertyDeclaration":
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
    case "MethodDeclaration":
      return csharpTypeRequiresUnsafe(member.returnType) ||
        typeParametersRequireUnsafe(member.typeParameters) ||
        member.parameters.some(parameterRequiresUnsafe);
    case "PropertyDeclaration":
      return csharpTypeRequiresUnsafe(member.type);
    case "IndexerDeclaration":
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
    case "ReturnStatement":
      return optionalExpressionRequiresUnsafe(statement.expression);
    case "ExpressionStatement":
      return expressionRequiresUnsafe(statement.expression);
    case "LocalDeclarationStatement":
      return csharpTypeRequiresUnsafe(statement.type) || optionalExpressionRequiresUnsafe(statement.initializer);
    case "Block":
      return blockRequiresUnsafe(statement.body);
    case "ThrowStatement":
      return expressionRequiresUnsafe(statement.expression);
    case "LabeledStatement":
      return statementRequiresUnsafe(statement.statement);
    case "SwitchStatement":
      return expressionRequiresUnsafe(statement.expression) || statement.sections.some(switchSectionRequiresUnsafe);
    case "TryStatement":
      return blockRequiresUnsafe(statement.tryBody) ||
        optionalCatchRequiresUnsafe(statement.catchClause) ||
        optionalBlockRequiresUnsafe(statement.finallyBody);
    case "ForEachStatement":
      return csharpTypeRequiresUnsafe(statement.itemType) ||
        expressionRequiresUnsafe(statement.collection) ||
        blockRequiresUnsafe(statement.body);
    case "IfStatement":
      return expressionRequiresUnsafe(statement.condition) ||
        blockRequiresUnsafe(statement.thenBody) ||
        optionalBlockRequiresUnsafe(statement.elseBody);
    case "WhileStatement":
      return expressionRequiresUnsafe(statement.condition) || blockRequiresUnsafe(statement.body);
    case "DoStatement":
      return blockRequiresUnsafe(statement.body) || expressionRequiresUnsafe(statement.condition);
    case "ForStatement":
      return optionalForInitializerRequiresUnsafe(statement.initializer) ||
        optionalExpressionRequiresUnsafe(statement.condition) ||
        optionalExpressionRequiresUnsafe(statement.incrementor) ||
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
  return label.kind === "CaseSwitchLabel" && expressionRequiresUnsafe(label.expression);
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
    ? expressionRequiresUnsafe(initializer.expression)
    : initializer.locals.some((local) => csharpTypeRequiresUnsafe(local.type) || optionalExpressionRequiresUnsafe(local.initializer));
}

function optionalExpressionRequiresUnsafe(expression: CsharpExpression | undefined): boolean {
  return expression !== undefined && expressionRequiresUnsafe(expression);
}

function expressionRequiresUnsafe(expression: CsharpExpression): boolean {
  switch (expression.kind) {
    case "ArrayType":
    case "FunctionPointerType":
    case "IdentifierName":
    case "InvalidType":
    case "NullableType":
    case "PointerType":
    case "PredefinedType":
    case "QualifiedName":
    case "TupleType":
      return csharpTypeRequiresUnsafe(expression);
    case "ParenthesizedExpression":
    case "AwaitExpression":
      return expressionRequiresUnsafe(expression.expression);
    case "InvocationExpression":
      return expressionRequiresUnsafe(expression.callee) || expression.arguments.some(argumentRequiresUnsafe);
    case "ObjectCreationExpression":
      return csharpTypeRequiresUnsafe(expression.type) ||
        (expression.arguments ?? []).some(argumentRequiresUnsafe) ||
        (expression.assignments ?? []).some((assignment) => expressionRequiresUnsafe(assignment.expression));
    case "SimpleMemberAccessExpression":
    case "ConditionalAccessExpression":
      return expressionRequiresUnsafe(expression.receiver);
    case "ElementAccessExpression":
    case "ConditionalElementAccessExpression":
      return expressionRequiresUnsafe(expression.receiver) || expressionRequiresUnsafe(expression.argument);
    case "BinaryExpression":
      return expressionRequiresUnsafe(expression.left) || expressionRequiresUnsafe(expression.right);
    case "IsPatternExpression":
      return expressionRequiresUnsafe(expression.expression) || csharpTypeRequiresUnsafe(expression.type);
    case "PrefixUnaryExpression":
      return expressionRequiresUnsafe(expression.operand);
    case "PostfixUnaryExpression":
      return expressionRequiresUnsafe(expression.operand);
    case "ConditionalExpression":
      return expressionRequiresUnsafe(expression.condition) ||
        expressionRequiresUnsafe(expression.whenTrue) ||
        expressionRequiresUnsafe(expression.whenFalse);
    case "ArrayCreationExpression":
      return optionalTypeRequiresUnsafe(expression.elementType) || expression.elements.some(expressionRequiresUnsafe);
    case "TupleExpression":
      return expression.elements.some(expressionRequiresUnsafe);
    case "DefaultExpression":
      return csharpTypeRequiresUnsafe(expression.type);
    case "LambdaExpression":
      return expression.parameters.some(lambdaParameterRequiresUnsafe) ||
        (Array.isArray((expression.body as { readonly statements?: unknown }).statements)
          ? blockRequiresUnsafe(expression.body as CsharpBlock)
          : expressionRequiresUnsafe(expression.body as CsharpExpression));
    case "InterpolatedStringExpression":
      return expression.parts.some((part) => part.kind === "Interpolation" && expressionRequiresUnsafe(part.expression));
    case "InvalidExpression":
    case "LiteralExpression":
    case "CharacterLiteralExpression":
      return false;
  }
}

function argumentRequiresUnsafe(argument: CsharpArgument): boolean {
  return expressionRequiresUnsafe(argument.expression);
}
