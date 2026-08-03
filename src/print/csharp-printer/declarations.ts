import type {
  CsharpCompilationUnit,
  CsharpConstructorDeclaration,
  CsharpEnumMember,
  CsharpInterfaceMember,
  CsharpMethodDeclaration,
  CsharpPropertyDeclaration,
  CsharpTypeDeclaration,
  CsharpTypeMember,
} from "../../backend/roslyn/syntax.js";
import type { CsharpPrintContext } from "./context.js";
import { failUnsupportedCsharpSyntax } from "./fail-closed.js";
import { indentLines } from "./format.js";

export function printCsharpCompilationUnit(
  unit: CsharpCompilationUnit,
  context: CsharpPrintContext,
): string {
  const lines: string[] = [];
  for (const externAlias of unit.externAliases ?? []) {
    lines.push(`extern alias ${externAlias};`);
  }
  if ((unit.externAliases ?? []).length > 0 && (unit.usings.length > 0 || unit.members.length > 0)) {
    lines.push("");
  }
  for (const using of unit.usings) {
    lines.push(`using ${using.namespace};`);
  }
  if (unit.usings.length > 0 && unit.members.length > 0) {
    lines.push("");
  }
  for (const member of unit.members) {
    switch (member.kind) {
      case "NamespaceDeclaration":
        lines.push(`namespace ${member.name}`);
        lines.push("{");
        lines.push(...indentLines(member.members.flatMap((declaration) => printTypeDeclarationLines(declaration, context))));
        lines.push("}");
        break;
      case "ClassDeclaration":
      case "StructDeclaration":
      case "InterfaceDeclaration":
      case "EnumDeclaration":
        lines.push(...printTypeDeclarationLines(member, context));
        break;
      default:
        failUnsupportedCsharpSyntax(member, "compilation-unit member");
    }
  }
  return `${lines.join("\n")}\n`;
}

function printTypeDeclarationLines(
  declaration: CsharpTypeDeclaration,
  context: CsharpPrintContext,
): string[] {
  const modifiers = declaration.modifiers.length === 0 ? "" : `${declaration.modifiers.join(" ")} `;
  if (declaration.kind === "EnumDeclaration") {
    return [
      ...context.printAttributes(declaration.attributes),
      `${modifiers}enum ${declaration.name}`,
      "{",
      ...indentLines(declaration.members.map((member, index, members) => printEnumMemberLine(member, index, members, context))),
      "}",
    ];
  }
  const typeParameters = context.printTypeParameters(declaration.typeParameters);
  const constraintLines = context.printTypeParameterConstraintLines(declaration.typeParameters);
  const bases = [
    ...(declaration.kind === "ClassDeclaration" && declaration.baseType !== undefined ? [declaration.baseType] : []),
    ...(declaration.interfaces ?? []),
  ];
  const baseList = bases.length === 0 ? "" : ` : ${bases.map(context.printType).join(", ")}`;
  if (declaration.kind === "InterfaceDeclaration") {
    return [
      ...context.printAttributes(declaration.attributes),
      `${modifiers}interface ${declaration.name}${typeParameters}${baseList}`,
      ...constraintLines,
      "{",
      ...indentLines(declaration.members.flatMap((member) => printInterfaceMemberLines(member, context))),
      "}",
    ];
  }
  if (declaration.kind !== "ClassDeclaration" && declaration.kind !== "StructDeclaration") {
    return failUnsupportedCsharpSyntax(declaration, "type declaration");
  }
  const keyword = declaration.kind === "ClassDeclaration" ? "class" : "struct";
  return [
    ...context.printAttributes(declaration.attributes),
    `${modifiers}${keyword} ${declaration.name}${typeParameters}${baseList}`,
    ...constraintLines,
    "{",
    ...indentLines(declaration.members.flatMap((member) => printTypeMemberLines(member, context))),
    "}",
  ];
}

function printEnumMemberLine(
  member: CsharpEnumMember,
  index: number,
  members: readonly CsharpEnumMember[],
  context: CsharpPrintContext,
): string {
  const value = member.value === undefined ? "" : ` = ${context.printExpression(member.value)}`;
  const suffix = index === members.length - 1 ? "" : ",";
  return `${member.name}${value}${suffix}`;
}

function printInterfaceMemberLines(
  member: CsharpInterfaceMember,
  context: CsharpPrintContext,
): string[] {
  switch (member.kind) {
    case "MethodDeclaration": {
      const typeParameters = context.printTypeParameters(member.typeParameters);
      const constraints = context.printTypeParameterConstraintSuffix(member.typeParameters);
      const parameters = member.parameters.map(context.printParameter).join(", ");
      return [
        ...context.printAttributes(member.attributes),
        `${context.printType(member.returnType)} ${member.name}${typeParameters}(${parameters})${constraints};`,
      ];
    }
    case "PropertyDeclaration":
      return [
        ...context.printAttributes(member.attributes),
        `${context.printType(member.type)} ${member.name} { get;${member.writable ? " set;" : ""} }`,
      ];
    case "IndexerDeclaration":
      return [
        ...context.printAttributes(member.attributes),
        `${context.printType(member.valueType)} this[${context.printType(member.keyType)} ${member.keyName}] { get;${member.writable ? " set;" : ""} }`,
      ];
  }
  return failUnsupportedCsharpSyntax(member, "interface member");
}

function printTypeMemberLines(member: CsharpTypeMember, context: CsharpPrintContext): string[] {
  switch (member.kind) {
    case "FieldDeclaration": {
      const modifiers = member.modifiers.length === 0 ? "" : `${member.modifiers.join(" ")} `;
      const initializer = member.initializer === undefined ? "" : ` = ${context.printExpression(member.initializer)}`;
      return [
        ...context.printAttributes(member.attributes),
        `${modifiers}${context.printType(member.type)} ${member.name}${initializer};`,
      ];
    }
    case "ConstructorDeclaration":
      return printConstructorLines(member, context);
    case "StaticConstructorDeclaration":
      return printStaticConstructorLines(member, context);
    case "MethodDeclaration":
      return printMethodLines(member, context);
    case "PropertyDeclaration":
      return printPropertyLines(member, context);
  }
  return failUnsupportedCsharpSyntax(member, "type member");
}

function printConstructorLines(
  constructor: CsharpConstructorDeclaration,
  context: CsharpPrintContext,
): string[] {
  const modifiers = constructor.modifiers.length === 0 ? "" : `${constructor.modifiers.join(" ")} `;
  const parameters = constructor.parameters.map(context.printParameter).join(", ");
  const baseInitializer = constructor.baseArguments === undefined
    ? ""
    : ` : base(${constructor.baseArguments.map(context.printArgument).join(", ")})`;
  return [
    ...context.printAttributes(constructor.attributes),
    `${modifiers}${constructor.name}(${parameters})${baseInitializer}`,
    "{",
    ...indentLines(context.printStatements(constructor.body.statements)),
    "}",
  ];
}

function printStaticConstructorLines(
  constructor: Extract<CsharpTypeMember, { readonly kind: "StaticConstructorDeclaration" }>,
  context: CsharpPrintContext,
): string[] {
  return [
    `static ${constructor.name}()`,
    "{",
    ...indentLines(context.printStatements(constructor.body.statements)),
    "}",
  ];
}

function printMethodLines(method: CsharpMethodDeclaration, context: CsharpPrintContext): string[] {
  const modifiers = method.modifiers.length === 0 ? "" : `${method.modifiers.join(" ")} `;
  const typeParameters = context.printTypeParameters(method.typeParameters);
  const constraintLines = context.printTypeParameterConstraintLines(method.typeParameters);
  const parameters = method.parameters.map(context.printParameter).join(", ");
  return [
    ...context.printAttributes(method.attributes),
    `${modifiers}${context.printType(method.returnType)} ${method.name}${typeParameters}(${parameters})`,
    ...constraintLines,
    "{",
    ...indentLines(context.printStatements(method.body.statements)),
    "}",
  ];
}

function printPropertyLines(property: CsharpPropertyDeclaration, context: CsharpPrintContext): string[] {
  const modifiers = property.modifiers.length === 0 ? "" : `${property.modifiers.join(" ")} `;
  const initializer = property.initializer === undefined ? "" : ` = ${context.printExpression(property.initializer)};`;
  const accessors: string[] = [];
  if (property.autoGetter === true) {
    accessors.push("get;");
  } else if (property.getter !== undefined) {
    accessors.push("get", "{", ...indentLines(context.printStatements(property.getter.statements)), "}");
  }
  if (property.autoSetter === true) {
    const setterModifiers = property.autoSetterModifiers === undefined || property.autoSetterModifiers.length === 0
      ? ""
      : `${property.autoSetterModifiers.join(" ")} `;
    accessors.push(`${setterModifiers}set;`);
  } else if (property.setter !== undefined) {
    accessors.push("set", "{", ...indentLines(context.printStatements(property.setter.statements)), "}");
  }
  return [
    ...context.printAttributes(property.attributes),
    `${modifiers}${context.printType(property.type)} ${property.name}`,
    "{",
    ...indentLines(accessors),
    `}${initializer}`,
  ];
}
