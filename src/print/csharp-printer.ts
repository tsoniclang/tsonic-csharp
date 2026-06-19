import type {
  CsharpArgument,
  CsharpAttribute,
  CsharpCompilationUnit,
  CsharpExpression,
  CsharpEnumMember,
  CsharpForInitializer,
  CsharpInterpolatedStringPart,
  CsharpInterfaceMember,
  CsharpLambdaParameter,
  CsharpLocalDeclaration,
  CsharpMethodDeclaration,
  CsharpObjectInitializerAssignment,
  CsharpParameter,
  CsharpPropertyDeclaration,
  CsharpStatement,
  CsharpConstructorDeclaration,
  CsharpSwitchSection,
  CsharpTypeParameter,
  CsharpTypeDeclaration,
  CsharpTypeMember,
  CsharpTypeNode,
} from "../backend/ast/csharp-ast.js";

export function printCsharpCompilationUnit(unit: CsharpCompilationUnit): string {
  const lines: string[] = [];
  for (const using of unit.usings) {
    lines.push(`using ${using.namespace};`);
  }
  if (unit.usings.length > 0 && unit.members.length > 0) {
    lines.push("");
  }
  for (const member of unit.members) {
    switch (member.kind) {
      case "namespace":
        lines.push(`namespace ${member.name}`);
        lines.push("{");
        lines.push(...indentLines(member.members.flatMap((declaration) => printTypeDeclarationLines(declaration))));
        lines.push("}");
        break;
      case "class":
      case "struct":
      case "interface":
      case "enum":
        lines.push(...printTypeDeclarationLines(member));
        break;
    }
  }
  return `${lines.join("\n")}\n`;
}

function printTypeDeclarationLines(declaration: CsharpTypeDeclaration): string[] {
  const modifiers = declaration.modifiers.length === 0 ? "" : `${declaration.modifiers.join(" ")} `;
  if (declaration.kind === "enum") {
    return [
      ...printCsharpAttributes(declaration.attributes),
      `${modifiers}enum ${declaration.name}`,
      "{",
      ...indentLines(declaration.members.map(printEnumMemberLine)),
      "}",
    ];
  }
  const typeParameters = printTypeParameters(declaration.typeParameters);
  const constraintLines = printTypeParameterConstraintLines(declaration.typeParameters);
  const bases = [
    ...(declaration.kind === "class" && declaration.baseType !== undefined ? [declaration.baseType] : []),
    ...(declaration.interfaces ?? []),
  ];
  const baseList = bases.length === 0 ? "" : ` : ${bases.map(printCsharpType).join(", ")}`;
  if (declaration.kind === "interface") {
    return [
      ...printCsharpAttributes(declaration.attributes),
      `${modifiers}interface ${declaration.name}${typeParameters}${baseList}`,
      ...constraintLines,
      "{",
      ...indentLines(declaration.members.flatMap(printInterfaceMemberLines)),
      "}",
    ];
  }
  return [
    ...printCsharpAttributes(declaration.attributes),
    `${modifiers}${declaration.kind} ${declaration.name}${typeParameters}${baseList}`,
    ...constraintLines,
    "{",
    ...indentLines(declaration.members.flatMap(printTypeMemberLines)),
    "}",
  ];
}

function printEnumMemberLine(member: CsharpEnumMember, index: number, members: readonly CsharpEnumMember[]): string {
  const value = member.value === undefined ? "" : ` = ${printCsharpExpression(member.value)}`;
  const suffix = index === members.length - 1 ? "" : ",";
  return `${member.name}${value}${suffix}`;
}

function printInterfaceMemberLines(member: CsharpInterfaceMember): string[] {
  switch (member.kind) {
    case "interface-method": {
      const typeParameters = printTypeParameters(member.typeParameters);
      const constraints = printTypeParameterConstraintSuffix(member.typeParameters);
      const parameters = member.parameters.map(printCsharpParameter).join(", ");
      return [
        ...printCsharpAttributes(member.attributes),
        `${printCsharpType(member.returnType)} ${member.name}${typeParameters}(${parameters})${constraints};`,
      ];
    }
    case "interface-property":
      return [
        ...printCsharpAttributes(member.attributes),
        `${printCsharpType(member.type)} ${member.name} { get; }`,
      ];
    case "interface-indexer":
      return [
        ...printCsharpAttributes(member.attributes),
        `${printCsharpType(member.valueType)} this[${printCsharpType(member.keyType)} ${member.keyName}] { get; }`,
      ];
  }
}

function printTypeMemberLines(member: CsharpTypeMember): string[] {
  switch (member.kind) {
    case "field": {
      const modifiers = member.modifiers.length === 0 ? "" : `${member.modifiers.join(" ")} `;
      const initializer = member.initializer === undefined ? "" : ` = ${printCsharpExpression(member.initializer)}`;
      return [
        ...printCsharpAttributes(member.attributes),
        `${modifiers}${printCsharpType(member.type)} ${member.name}${initializer};`,
      ];
    }
    case "constructor":
      return printConstructorLines(member);
    case "method":
      return printMethodLines(member);
    case "property":
      return printPropertyLines(member);
  }
}

function printConstructorLines(constructor: CsharpConstructorDeclaration): string[] {
  const modifiers = constructor.modifiers.length === 0 ? "" : `${constructor.modifiers.join(" ")} `;
  const parameters = constructor.parameters.map(printCsharpParameter).join(", ");
  const baseInitializer = constructor.baseArguments === undefined
    ? ""
    : ` : base(${constructor.baseArguments.map(printCsharpArgument).join(", ")})`;
  return [
    ...printCsharpAttributes(constructor.attributes),
    `${modifiers}${constructor.name}(${parameters})${baseInitializer}`,
    "{",
    ...indentLines(printCsharpStatements(constructor.body.statements)),
    "}",
  ];
}

function printMethodLines(method: CsharpMethodDeclaration): string[] {
  const modifiers = method.modifiers.length === 0 ? "" : `${method.modifiers.join(" ")} `;
  const typeParameters = printTypeParameters(method.typeParameters);
  const constraintLines = printTypeParameterConstraintLines(method.typeParameters);
  const parameters = method.parameters.map(printCsharpParameter).join(", ");
  return [
    ...printCsharpAttributes(method.attributes),
    `${modifiers}${printCsharpType(method.returnType)} ${method.name}${typeParameters}(${parameters})`,
    ...constraintLines,
    "{",
    ...indentLines(printCsharpStatements(method.body.statements)),
    "}",
  ];
}

function printPropertyLines(property: CsharpPropertyDeclaration): string[] {
  const modifiers = property.modifiers.length === 0 ? "" : `${property.modifiers.join(" ")} `;
  return [
    ...printCsharpAttributes(property.attributes),
    `${modifiers}${printCsharpType(property.type)} ${property.name}`,
    "{",
    ...(property.getter === undefined
      ? []
      : indentLines([
          "get",
          "{",
          ...indentLines(printCsharpStatements(property.getter.statements)),
          "}",
        ])),
    ...(property.setter === undefined
      ? []
      : indentLines([
          "set",
          "{",
          ...indentLines(printCsharpStatements(property.setter.statements)),
          "}",
        ])),
    "}",
  ];
}

function printCsharpAttributes(attributes: readonly CsharpAttribute[] | undefined): readonly string[] {
  return (attributes ?? []).map((attribute) => {
    const argumentsText = attribute.arguments === undefined || attribute.arguments.length === 0
      ? ""
      : `(${attribute.arguments.map(printCsharpArgument).join(", ")})`;
    return `[${printCsharpType(attribute.type)}${argumentsText}]`;
  });
}

function printTypeParameters(typeParameters: readonly CsharpTypeParameter[] | undefined): string {
  return typeParameters === undefined || typeParameters.length === 0
    ? ""
    : `<${typeParameters.map((typeParameter) => typeParameter.name).join(", ")}>`;
}

function printTypeParameterConstraintLines(typeParameters: readonly CsharpTypeParameter[] | undefined): string[] {
  return (typeParameters ?? [])
    .flatMap((typeParameter) => printTypeParameterConstraint(typeParameter));
}

function printTypeParameterConstraintSuffix(typeParameters: readonly CsharpTypeParameter[] | undefined): string {
  const constraints = printTypeParameterConstraintLines(typeParameters);
  return constraints.length === 0 ? "" : ` ${constraints.join(" ")}`;
}

function printTypeParameterConstraint(typeParameter: CsharpTypeParameter): readonly string[] {
  const constraints = typeParameter.constraints ?? [];
  return constraints.length === 0
    ? []
    : [`where ${typeParameter.name} : ${constraints.map(printCsharpType).join(", ")}`];
}

export function printCsharpType(type: CsharpTypeNode): string {
  switch (type.kind) {
    case "predefined":
      return type.name;
    case "invalid":
      throw new Error(`Invalid C# type reached printer: ${type.reason}`);
    case "named":
      return type.typeArguments === undefined || type.typeArguments.length === 0
        ? type.name
        : `${type.name}<${type.typeArguments.map(printCsharpType).join(", ")}>`;
    case "qualified": {
      const suffix = type.typeArguments === undefined || type.typeArguments.length === 0
        ? type.name
        : `${type.name}<${type.typeArguments.map(printCsharpType).join(", ")}>`;
      return `${printCsharpType(type.left)}.${suffix}`;
    }
    case "array":
      return `${printCsharpType(type.elementType)}[]`;
    case "tuple":
      return `(${type.elements.map(printCsharpType).join(", ")})`;
    case "function":
      return printCsharpFunctionType(type.parameters, type.returnType);
    case "nullable":
      return `${printCsharpType(type.inner)}?`;
  }
}

export function printCsharpStatement(statement: CsharpStatement): string {
  switch (statement.kind) {
    case "return":
      return statement.expression === undefined ? "return;" : `return ${printCsharpExpression(statement.expression)};`;
    case "expression":
      return `${printCsharpExpression(statement.expression)};`;
    case "local":
      return `${printCsharpLocalDeclaration(statement)};`;
    case "block":
      return [
        "{",
        ...indentLines(printCsharpStatements(statement.body.statements)),
        "}",
      ].join("\n");
    case "break":
      return "break;";
    case "continue":
      return "continue;";
    case "goto":
      return `goto ${statement.label};`;
    case "goto-switch":
      return statement.label.kind === "default"
        ? "goto default;"
        : `goto case ${printCsharpExpression(statement.label.expression)};`;
    case "throw":
      return `throw ${printCsharpExpression(statement.expression)};`;
    case "label":
      return [
        `${statement.name}:`,
        ...indentLines(printCsharpStatement(statement.statement).split("\n")),
      ].join("\n");
    case "switch":
      return [
        `switch (${printCsharpExpression(statement.expression)})`,
        "{",
        ...indentLines(statement.sections.flatMap(printCsharpSwitchSection)),
        "}",
      ].join("\n");
    case "try":
      return [
        "try",
        "{",
        ...indentLines(printCsharpStatements(statement.tryBody.statements)),
        "}",
        ...(statement.catchClause === undefined
          ? []
          : [
              statement.catchClause.variableName === undefined
                ? "catch"
                : `catch (Exception ${statement.catchClause.variableName})`,
              "{",
              ...indentLines(printCsharpStatements(statement.catchClause.body.statements)),
              "}",
            ]),
        ...(statement.finallyBody === undefined
          ? []
          : [
              "finally",
              "{",
              ...indentLines(printCsharpStatements(statement.finallyBody.statements)),
              "}",
            ]),
      ].join("\n");
    case "foreach":
      return [
        `foreach (${printCsharpType(statement.itemType)} ${statement.itemName} in ${printCsharpExpression(statement.collection)})`,
        "{",
        ...indentLines(printCsharpStatements(statement.body.statements)),
        "}",
      ].join("\n");
    case "if":
      return [
        `if (${printCsharpExpression(statement.condition)})`,
        "{",
        ...indentLines(printCsharpStatements(statement.thenBody.statements)),
        "}",
        ...(statement.elseBody === undefined
          ? []
          : [
              "else",
              "{",
              ...indentLines(printCsharpStatements(statement.elseBody.statements)),
              "}",
            ]),
      ].join("\n");
    case "while":
      return [
        `while (${printCsharpExpression(statement.condition)})`,
        "{",
        ...indentLines(printCsharpStatements(statement.body.statements)),
        "}",
      ].join("\n");
    case "do":
      return [
        "do",
        "{",
        ...indentLines(printCsharpStatements(statement.body.statements)),
        "}",
        `while (${printCsharpExpression(statement.condition)});`,
      ].join("\n");
    case "for":
      return [
        `for (${printCsharpForInitializer(statement.initializer)}; ${statement.condition === undefined ? "" : printCsharpExpression(statement.condition)}; ${statement.incrementor === undefined ? "" : printCsharpExpression(statement.incrementor)})`,
        "{",
        ...indentLines(printCsharpStatements(statement.body.statements)),
        "}",
      ].join("\n");
  }
}

function printCsharpStatements(statements: readonly CsharpStatement[]): string[] {
  return statements.flatMap((statement) => printCsharpStatement(statement).split("\n"));
}

function printCsharpSwitchSection(section: CsharpSwitchSection): string[] {
  const label = section.label.kind === "default"
    ? "default:"
    : `case ${printCsharpExpression(section.label.expression)}:`;
  return [
    label,
    ...indentLines(printCsharpStatements(section.statements)),
  ];
}

export function printCsharpExpression(expression: CsharpExpression): string {
  switch (expression.kind) {
    case "identifier":
      return expression.name;
    case "invalid":
      throw new Error(`Invalid C# expression reached printer: ${expression.reason}`);
    case "literal":
      return printLiteral(expression.value);
    case "interpolatedString":
      return printInterpolatedString(expression.parts);
    case "parenthesized":
      return `(${printCsharpExpression(expression.expression)})`;
    case "member":
      return `${printCsharpExpression(expression.receiver)}.${expression.name}`;
    case "optionalMember":
      return `${printCsharpExpression(expression.receiver)}?.${expression.name}`;
    case "element":
      return `${printCsharpExpression(expression.receiver)}[${printCsharpExpression(expression.argument)}]`;
    case "optionalElement":
      return `${printCsharpExpression(expression.receiver)}?[${printCsharpExpression(expression.argument)}]`;
    case "call":
      return `${printCsharpExpression(expression.callee)}(${expression.arguments.map(printCsharpArgument).join(", ")})`;
    case "new":
      return `new ${printCsharpType(expression.type)}(${expression.arguments.map(printCsharpArgument).join(", ")})`;
    case "objectInitializer":
      return printCsharpObjectInitializer(expression.type, expression.assignments);
    case "binary":
      return `${printCsharpExpression(expression.left)} ${expression.operator} ${printCsharpExpression(expression.right)}`;
    case "prefixUnary":
      return `${expression.operator}${printCsharpExpression(expression.operand)}`;
    case "postfixUnary":
      return `${printCsharpExpression(expression.operand)}${expression.operator}`;
    case "conditional":
      return `${printCsharpExpression(expression.condition)} ? ${printCsharpExpression(expression.whenTrue)} : ${printCsharpExpression(expression.whenFalse)}`;
    case "array": {
      const elements = expression.elements.map(printCsharpExpression).join(", ");
      const initializer = elements.length === 0 ? "{ }" : `{ ${elements} }`;
      return expression.elementType === undefined
        ? `new[] ${initializer}`
        : `new ${printCsharpType(expression.elementType)}[] ${initializer}`;
    }
    case "tuple":
      return `(${expression.elements.map(printCsharpExpression).join(", ")})`;
    case "default":
      return `default(${printCsharpType(expression.type)})`;
    case "lambda":
      return printCsharpLambda(expression);
  }
}

function printCsharpObjectInitializer(
  type: CsharpTypeNode,
  assignments: readonly CsharpObjectInitializerAssignment[],
): string {
  if (assignments.length === 0) {
    return `new ${printCsharpType(type)}()`;
  }
  return [
    `new ${printCsharpType(type)}`,
    "{",
    ...indentLines(assignments.map((assignment) =>
      `${assignment.name} = ${printCsharpExpression(assignment.expression)},`)),
    "}",
  ].join("\n");
}

function printCsharpFunctionType(parameters: readonly CsharpTypeNode[], returnType: CsharpTypeNode): string {
  if (returnType.kind === "predefined" && returnType.name === "void") {
    return parameters.length === 0
      ? "Action"
      : `Action<${parameters.map(printCsharpType).join(", ")}>`;
  }
  return `Func<${[...parameters, returnType].map(printCsharpType).join(", ")}>`;
}

function printCsharpLambda(
  lambda: Extract<CsharpExpression, { readonly kind: "lambda" }>,
): string {
  const parameters = printCsharpLambdaParameters(lambda.parameters);
  if ("statements" in lambda.body) {
    return [
      `${parameters} =>`,
      "{",
      ...indentLines(printCsharpStatements(lambda.body.statements)),
      "}",
    ].join("\n");
  }
  return `${parameters} => ${printCsharpExpression(lambda.body)}`;
}

function printCsharpLambdaParameters(parameters: readonly CsharpLambdaParameter[]): string {
  if (parameters.length === 1 && parameters[0]?.type === undefined) {
    return printCsharpLambdaParameter(parameters[0]!);
  }
  return `(${parameters.map(printCsharpLambdaParameter).join(", ")})`;
}

function printCsharpLambdaParameter(parameter: CsharpLambdaParameter): string {
  return parameter.type === undefined
    ? parameter.name
    : `${printCsharpType(parameter.type)} ${parameter.name}`;
}

function printInterpolatedString(parts: readonly CsharpInterpolatedStringPart[]): string {
  const body = parts.map((part) => {
    switch (part.kind) {
      case "text":
        return escapeCsharpInterpolatedStringText(part.text);
      case "expression":
        return `{${printCsharpExpression(part.expression)}}`;
    }
  }).join("");
  return `$"${body}"`;
}

function printCsharpLocalDeclaration(local: CsharpLocalDeclaration): string {
  return local.initializer === undefined
    ? `${printCsharpType(local.type)} ${local.name}`
    : `${printCsharpType(local.type)} ${local.name} = ${printCsharpExpression(local.initializer)}`;
}

function printCsharpForInitializer(initializer: CsharpForInitializer | undefined): string {
  if (initializer === undefined) {
    return "";
  }
  switch (initializer.kind) {
    case "expression":
      return printCsharpExpression(initializer.expression);
    case "locals": {
      const first = initializer.locals[0];
      if (first === undefined) {
        return "";
      }
      return `${printCsharpType(first.type)} ${initializer.locals.map(printCsharpLocalDeclarator).join(", ")}`;
    }
  }
}

function printCsharpLocalDeclarator(local: CsharpLocalDeclaration): string {
  return local.initializer === undefined
    ? local.name
    : `${local.name} = ${printCsharpExpression(local.initializer)}`;
}

function printCsharpArgument(argument: CsharpArgument): string {
  const expression = printCsharpExpression(argument.expression);
  return argument.passing === undefined ? expression : `${argument.passing} ${expression}`;
}

function printCsharpParameter(parameter: CsharpParameter): string {
  const attributes = printCsharpAttributes(parameter.attributes).join(" ");
  const attributePrefix = attributes.length === 0 ? "" : `${attributes} `;
  const paramsPrefix = parameter.isParams === true ? "params " : "";
  const passing = parameter.passing === undefined ? "" : `${parameter.passing} `;
  const defaultValue = parameter.defaultValue === undefined
    ? ""
    : ` = ${printCsharpExpression(parameter.defaultValue)}`;
  return `${attributePrefix}${paramsPrefix}${passing}${printCsharpType(parameter.type)} ${parameter.name}${defaultValue}`;
}

function printLiteral(value: string | number | boolean | null): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return String(value);
}

function escapeCsharpInterpolatedStringText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/{/g, "{{")
    .replace(/}/g, "}}")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function indentLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.length === 0 ? line : `    ${line}`);
}
