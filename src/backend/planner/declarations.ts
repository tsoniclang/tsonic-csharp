import {
  AsBlock,
  AsBinaryExpression,
  AsCallExpression,
  AsClassDeclaration,
  AsClassStaticBlockDeclaration,
  AsConstructorDeclaration,
  AsEnumDeclaration,
  AsEnumMember,
  AsExpressionStatement,
  AsFunctionDeclaration,
  AsGetAccessorDeclaration,
  AsIdentifier,
  AsInterfaceDeclaration,
  AsIndexSignatureDeclaration,
  AsMethodDeclaration,
  AsMethodSignatureDeclaration,
  AsParameterDeclaration,
  AsParenthesizedExpression,
  AsPrefixUnaryExpression,
  AsPropertyDeclaration,
  AsPropertySignatureDeclaration,
  AsSetAccessorDeclaration,
  KindCallExpression,
  KindConstructor,
  KindClassStaticBlockDeclaration,
  KindExpressionStatement,
  KindEnumMember,
  KindIdentifier,
  KindNumericLiteral,
  KindParenthesizedExpression,
  KindPrefixUnaryExpression,
  KindGetAccessor,
  KindIndexSignature,
  KindMethodDeclaration,
  KindMethodSignature,
  KindNeverKeyword,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  KindPrivateIdentifier,
  KindPropertyDeclaration,
  KindPropertySignature,
  KindSetAccessor,
  KindSuperKeyword,
  HasSyntacticModifier,
  HasSourceKind,
  ModifierFlagsStatic,
  Node_Name,
  SourceTokenKind,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpClassDeclaration,
  CsharpConstructorDeclaration,
  CsharpEnumDeclaration,
  CsharpEnumMember,
  CsharpExpression,
  CsharpFieldDeclaration,
  CsharpInterfaceDeclaration,
  CsharpInterfaceIndexerDeclaration,
  CsharpInterfaceMember,
  CsharpInterfaceMethodDeclaration,
  CsharpInterfacePropertyDeclaration,
  CsharpMethodDeclaration,
  CsharpParameter,
  CsharpPropertyDeclaration,
  CsharpStatement,
  CsharpTypeMember,
} from "../roslyn/syntax.js";
import { planAttributesForSubject } from "./attributes.js";
import { getCsharpTypeForNode, invalidCsharpType, predefined } from "./csharp-types.js";
import {
  createDestructuringPlannerState,
  planParameterBindingPrelude,
} from "./bindings.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planCallArgument, planExpressionWithExpectedType } from "./expressions.js";
import { planClassHeritage, planInterfaceHeritage } from "./heritage.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers, isAsyncNode } from "./modifiers.js";
import { planIdentifierName } from "./names.js";
import { planParameters, planParametersWithPrelude } from "./parameters.js";
import { planBlockStatements, planStatements } from "./statements.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";
import { getTargetTypeRefForType } from "./runtime-carriers.js";
import { planTypeParameters } from "./type-parameters.js";

export function planClassDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpClassDeclaration {
  const declaration = AsClassDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "class declaration", diagnostics);
  const className = planIdentifierName(declaration.name, "AnonymousClass", input, diagnostics, "Class name");
  const heritage = planClassHeritage(declaration.HeritageClauses?.Nodes ?? [], sourceFile, input, diagnostics);
  return {
    kind: "ClassDeclaration",
    name: className,
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    ...(heritage.baseType === undefined ? {} : { baseType: heritage.baseType }),
    ...(heritage.interfaces.length === 0 ? {} : { interfaces: heritage.interfaces }),
    members: planClassMembers(declaration.Members?.Nodes ?? [], className, sourceFile, input, diagnostics),
  };
}

function planClassMembers(
  members: readonly (Node | undefined)[],
  className: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): readonly CsharpTypeMember[] {
  const planned: CsharpTypeMember[] = [];
  const accessorProperties = new Map<string, CsharpPropertyDeclaration>();
  for (const member of members) {
    if (member === undefined) {
      continue;
    }
    switch (SourceKind(input.ast, member)) {
      case KindConstructor:
        planned.push(planConstructorDeclaration(member, className, sourceFile, input, diagnostics));
        break;
      case KindClassStaticBlockDeclaration:
        planned.push(planClassStaticBlockDeclaration(member, className, sourceFile, input, diagnostics));
        break;
      case KindMethodDeclaration:
        planned.push(planMethodDeclaration(member, sourceFile, input, diagnostics));
        break;
      case KindPropertyDeclaration:
        planned.push(planPropertyDeclaration(member, sourceFile, input, diagnostics));
        break;
      case KindGetAccessor:
      case KindSetAccessor:
        mergeAccessorProperty(member, planned, accessorProperties, sourceFile, input, diagnostics);
        break;
      default:
        diagnostics.push(unsupportedNodeDiagnostic(member, "Class member is outside the current C# planning surface."));
        break;
    }
  }
  return planned;
}

function planClassStaticBlockDeclaration(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpConstructorDeclaration {
  const declaration = AsClassStaticBlockDeclaration(node)!;
  return {
    kind: "ConstructorDeclaration",
    name: className,
    modifiers: ["static"],
    parameters: [],
    body: {
      kind: "Block",
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics),
    },
  };
}

export function planInterfaceDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceDeclaration {
  const declaration = AsInterfaceDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "interface declaration", diagnostics);
  const interfaces = planInterfaceHeritage(declaration.HeritageClauses?.Nodes ?? [], sourceFile, input, diagnostics);
  return {
    kind: "InterfaceDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousInterface", input, diagnostics, "Interface name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    ...(interfaces.length === 0 ? {} : { interfaces }),
    members: (declaration.Members?.Nodes ?? []).flatMap((member): CsharpInterfaceMember[] => {
      if (member === undefined) {
        return [];
      }
      switch (SourceKind(input.ast, member)) {
        case KindMethodSignature:
          return [planInterfaceMethodDeclaration(member, sourceFile, input, diagnostics)];
        case KindPropertySignature:
          return [planInterfacePropertyDeclaration(member, sourceFile, input, diagnostics)];
        case KindIndexSignature:
          return [planInterfaceIndexerDeclaration(member, sourceFile, input, diagnostics)];
        default:
          diagnostics.push(unsupportedNodeDiagnostic(member, "Interface member is outside the current C# planning surface."));
          return [];
      }
    }),
  };
}

export function planEnumDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpEnumDeclaration {
  const declaration = AsEnumDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "enum declaration", diagnostics);
  return {
    kind: "EnumDeclaration",
    name: planIdentifierName(declaration.name, "AnonymousEnum", input, diagnostics, "Enum name"),
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    members: (declaration.Members?.Nodes ?? []).flatMap((member): CsharpEnumMember[] => {
      if (member === undefined) {
        return [];
      }
      if (!HasSourceKind(input.ast, member, KindEnumMember)) {
        diagnostics.push(unsupportedNodeDiagnostic(member, "Enum member is outside the current C# planning surface."));
        return [];
      }
      return [planEnumMember(member, sourceFile, input, diagnostics)];
    }),
  };
}

function planEnumMember(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpEnumMember {
  const member = AsEnumMember(node)!;
  const enumValue = input.semantics.getEnumMemberConstant(node, { sourceFile });
  const enumExpressionValue = member.Initializer === undefined
    ? undefined
    : planEnumConstantExpression(member.Initializer, sourceFile, input, diagnostics);
  if (
    member.Initializer !== undefined &&
    (enumValue === undefined || typeof enumValue.value !== "number" || !Number.isInteger(enumValue.value))
  ) {
    diagnostics.push(unsupportedNodeDiagnostic(member.Initializer!, "C# enum member initializers must be integer constants evaluated by TSTS; string or provider-owned enum carriers require finalized target facts."));
  }
  return {
    kind: "EnumMemberDeclaration",
    name: planIdentifierName(member.name ?? Node_Name(node), "AnonymousMember", input, diagnostics, "Enum member name"),
    ...(member.Initializer === undefined
      ? {}
      : enumExpressionValue !== undefined
        ? { value: enumExpressionValue }
        : enumValue?.value === undefined ? {} : { value: { kind: "LiteralExpression", value: enumValue.value } }),
  };
}

function planEnumConstantExpression(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpExpression | undefined {
  switch (input.ast.kindName(node)) {
    case KindNumericLiteral:
      return { kind: "LiteralExpression", value: Number(input.ast.text(node)) };
    case KindIdentifier:
      return { kind: "IdentifierName", name: planIdentifierName(AsIdentifier(node), "EnumConstant", input, diagnostics, "Enum constant reference") };
    case KindParenthesizedExpression: {
      const expression = AsParenthesizedExpression(node)?.Expression;
      const planned = expression === undefined ? undefined : planEnumConstantExpression(expression, sourceFile, input, diagnostics);
      return planned === undefined ? undefined : { kind: "ParenthesizedExpression", expression: planned };
    }
    case KindPrefixUnaryExpression: {
      const expression = AsPrefixUnaryExpression(node);
      const operand = expression?.Operand === undefined ? undefined : planEnumConstantExpression(expression.Operand, sourceFile, input, diagnostics);
      const operatorToken = (expression as { readonly Operator?: unknown; readonly OperatorToken?: unknown } | undefined)?.Operator ??
        (expression as { readonly OperatorToken?: unknown } | undefined)?.OperatorToken;
      const operator = getEnumConstantPrefixOperator(SourceTokenKind(input.ast, operatorToken));
      return operand === undefined || operator === undefined ? undefined : { kind: "PrefixUnaryExpression", operator, operand };
    }
    case "KindBinaryExpression": {
      const expression = AsBinaryExpression(node);
      const left = expression?.Left === undefined ? undefined : planEnumConstantExpression(expression.Left, sourceFile, input, diagnostics);
      const right = expression?.Right === undefined ? undefined : planEnumConstantExpression(expression.Right, sourceFile, input, diagnostics);
      const operator = getEnumConstantBinaryOperator(SourceTokenKind(input.ast, expression?.OperatorToken?.Kind));
      return left === undefined || right === undefined || operator === undefined
        ? undefined
        : { kind: "BinaryExpression", left, operator, right };
    }
    default:
      return undefined;
  }
}

function getEnumConstantPrefixOperator(tokenKind: string | undefined): string | undefined {
  switch (tokenKind) {
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindTildeToken":
      return "~";
    default:
      return undefined;
  }
}

function getEnumConstantBinaryOperator(tokenKind: string | undefined): string | undefined {
  switch (tokenKind) {
    case "KindLessThanLessThanToken":
      return "<<";
    case "KindGreaterThanGreaterThanToken":
      return ">>";
    case "KindBarToken":
      return "|";
    case "KindAmpersandToken":
      return "&";
    case "KindCaretToken":
      return "^";
    case "KindPlusToken":
      return "+";
    case "KindMinusToken":
      return "-";
    case "KindAsteriskToken":
      return "*";
    case "KindSlashToken":
      return "/";
    case "KindPercentToken":
      return "%";
    default:
      return undefined;
  }
}

export function planFunctionDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsFunctionDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "function declaration", diagnostics);
  const name = planIdentifierName(declaration.name, "__anonymous", input, diagnostics, "Function name");
  const state = createDestructuringPlannerState();
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const returnType = getExplicitReturnType(declaration.Type, node, "function declaration", sourceFile, input, diagnostics);
  state.currentReturnType = returnType;
  state.currentReturnTypeSubject = declaration.Type;
  return {
    kind: "MethodDeclaration",
    name,
    modifiers: isAsyncNode(node) ? ["public", "static", "async"] : ["public", "static"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    returnType,
    parameters: parameters.parameters,
    body: {
      kind: "Block",
      statements: [
        ...parameters.prelude,
        ...planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
      ],
    },
  };
}

function planConstructorDeclaration(
  node: Node,
  className: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpConstructorDeclaration {
  const declaration = AsConstructorDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "constructor declaration", diagnostics);
  const bodyStatements = AsBlock(declaration.Body)?.Statements?.Nodes ?? [];
  const leadingSuperCall = getLeadingSuperCall(bodyStatements, input);
  const state = createDestructuringPlannerState();
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  if (leadingSuperCall !== undefined && parameters.prelude.length > 0 && (leadingSuperCall.Arguments?.Nodes ?? []).length > 0) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Constructor base arguments cannot reference destructured parameter locals until base-argument rewriting is finalized."));
  }
  return {
    kind: "ConstructorDeclaration",
    name: className,
    modifiers: ["public"],
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    parameters: parameters.parameters,
    ...(leadingSuperCall === undefined
      ? {}
      : {
          baseArguments: (leadingSuperCall.Arguments?.Nodes ?? [])
            .filter((argument): argument is Node => argument !== undefined)
            .map((argument) => planCallArgument(argument, sourceFile, input, diagnostics)),
        }),
    body: {
      kind: "Block",
      statements: leadingSuperCall === undefined
        ? [
            ...parameters.prelude,
            ...planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
          ]
        : [
            ...parameters.prelude,
            ...bodyStatements
              .slice(1)
              .filter((statement): statement is Node => statement !== undefined)
              .flatMap((statement) => planStatements(statement, sourceFile, input, diagnostics, state)),
          ],
    },
  };
}

function getLeadingSuperCall(statements: readonly (Node | undefined)[], input: TargetCompileInput): NonNullable<ReturnType<typeof AsCallExpression>> | undefined {
  const first = statements[0];
  if (!HasSourceKind(input.ast, first, KindExpressionStatement)) {
    return undefined;
  }
  const expression = AsExpressionStatement(first)!.Expression;
  if (!HasSourceKind(input.ast, expression, KindCallExpression)) {
    return undefined;
  }
  const call = AsCallExpression(expression)!;
  return HasSourceKind(input.ast, call.Expression, KindSuperKeyword) ? call : undefined;
}

function planMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpMethodDeclaration {
  const declaration = AsMethodDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "method declaration", diagnostics);
  const state = createDestructuringPlannerState();
  const parameters = planParametersWithPrelude(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics, state);
  const returnType = getExplicitReturnType(declaration.Type, node, "method declaration", sourceFile, input, diagnostics);
  state.currentReturnType = returnType;
  state.currentReturnTypeSubject = declaration.Type;
  return {
    kind: "MethodDeclaration",
    name: planIdentifierName(declaration.name, "MethodDeclaration", input, diagnostics, "Method name"),
    modifiers: planMethodModifiers(node, declaration.name, input),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    returnType,
    parameters: parameters.parameters,
    body: {
      kind: "Block",
      statements: [
        ...parameters.prelude,
        ...planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
      ],
    },
  };
}

function planInterfaceMethodDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceMethodDeclaration {
  const declaration = AsMethodSignatureDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "interface method declaration", diagnostics);
  return {
    kind: "MethodDeclaration",
    name: planIdentifierName(declaration.name, "MethodDeclaration", input, diagnostics, "Interface method name"),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    typeParameters: planTypeParameters(declaration.TypeParameters?.Nodes ?? [], sourceFile, input, diagnostics),
    returnType: getExplicitReturnType(declaration.Type, node, "interface method declaration", sourceFile, input, diagnostics),
    parameters: planParameters(declaration.Parameters?.Nodes ?? [], sourceFile, input, diagnostics),
  };
}

function getExplicitReturnType(
  typeNode: Node | undefined,
  declarationNode: Node,
  context: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): ReturnType<typeof getCsharpTypeForNode> {
  if (typeNode === undefined) {
    const returnCarrier = getInferredReturnTypeCarrier(declarationNode, sourceFile, input) ??
      input.semantics.getReturnTypeCarrierFromDeclaration(declarationNode, { sourceFile });
    if (returnCarrier === undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(declarationNode, `C# ${context} emission requires a return type, but TSTS did not return an inferred signature return type.`));
      return invalidCsharpType(`${context} return type`);
    }
    const inferred = csharpTypeFromTargetTypeRef(returnCarrier);
    return inferred ?? invalidCsharpType(`${context} return type`);
  }
  if (HasSourceKind(input.ast, typeNode, KindNeverKeyword)) {
    return predefined("void");
  }
  return getCsharpTypeForNode(typeNode, sourceFile, input, invalidCsharpType(`${context} return type`), diagnostics);
}

function getInferredReturnTypeCarrier(
  declarationNode: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
) {
  const name = input.ast.name(declarationNode);
  const symbol = input.semantics.getSymbolAtLocation(name ?? declarationNode, { sourceFile });
  const candidateTypes = [
    input.semantics.getTypeOfSymbol(symbol, { sourceFile }),
    name === undefined ? undefined : input.semantics.getTypeAtLocation(name, { sourceFile }),
    input.semantics.getTypeAtLocation(declarationNode, { sourceFile }),
  ];
  for (const declarationType of candidateTypes) {
    const signature = input.types.getCallSignatures(declarationType, { sourceFile })[0];
    const returnType = input.types.getReturnTypeOfSignature(signature, { sourceFile });
    const carrier = getTargetTypeRefForType(input, returnType, sourceFile);
    if (carrier !== undefined) {
      return carrier;
    }
  }
  return undefined;
}

function planInterfacePropertyDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfacePropertyDeclaration {
  const declaration = AsPropertySignatureDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "interface property declaration", diagnostics);
  if (declaration.Initializer !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Interface property initializers have no direct C# interface equivalent."));
  }
  return {
    kind: "PropertyDeclaration",
    name: planIdentifierName(declaration.name, "PropertyDeclaration", input, diagnostics, "Interface property name"),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    type: getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input, invalidCsharpType("interface property type"), diagnostics),
  };
}

function planInterfaceIndexerDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpInterfaceIndexerDeclaration {
  const declaration = AsIndexSignatureDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "interface index signature", diagnostics);
  const parameterNodes = declaration.Parameters?.Nodes ?? [];
  const parameterNode = parameterNodes.find((item): item is Node => item !== undefined);
  if (parameterNode === undefined || parameterNodes.filter((item) => item !== undefined).length !== 1) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Interface index signature requires exactly one key parameter."));
  }
  const parameterDeclaration = parameterNode === undefined ? undefined : AsParameterDeclaration(parameterNode);
  return {
    kind: "IndexerDeclaration",
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    keyName: planIdentifierName(parameterDeclaration?.name, "key", input, diagnostics, "Interface indexer key name"),
    keyType: getCsharpTypeForNode(parameterDeclaration?.Type ?? parameterDeclaration?.name, sourceFile, input, undefined, diagnostics),
    valueType: getCsharpTypeForNode(declaration.Type, sourceFile, input, undefined, diagnostics),
  };
}

function planPropertyDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpFieldDeclaration {
  const declaration = AsPropertyDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "property declaration", diagnostics);
  const type = getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input, invalidCsharpType("property type"), diagnostics);
  return {
    kind: "FieldDeclaration",
    name: planIdentifierName(declaration.name, "FieldDeclaration", input, diagnostics, "Property name"),
    modifiers: planClassMemberModifiers(node, declaration.name, input),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    type,
    ...(declaration.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(declaration.Initializer, sourceFile, input, diagnostics, type, declaration.Type ?? declaration.name) }
      : {}),
  };
}

function mergeAccessorProperty(
  node: Node,
  planned: CsharpTypeMember[],
  accessorProperties: Map<string, CsharpPropertyDeclaration>,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): void {
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(node, "accessor declaration", diagnostics);
  const accessor = HasSourceKind(input.ast, node, KindGetAccessor)
    ? AsGetAccessorDeclaration(node)!
    : AsSetAccessorDeclaration(node)!;
  const name = planIdentifierName(accessor.name, "PropertyDeclaration", input, diagnostics, "Accessor name");
  const existing = accessorProperties.get(name);
  const next = HasSourceKind(input.ast, node, KindGetAccessor)
    ? mergeGetterAccessor(existing, node, name, sourceFile, input, diagnostics)
    : mergeSetterAccessor(existing, node, name, sourceFile, input, diagnostics);
  accessorProperties.set(name, next);
  if (existing === undefined) {
    planned.push(next);
    return;
  }
  const index = planned.indexOf(existing);
  if (index >= 0) {
    planned[index] = next;
  }
}

function mergeGetterAccessor(
  existing: CsharpPropertyDeclaration | undefined,
  node: Node,
  name: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpPropertyDeclaration {
  const declaration = AsGetAccessorDeclaration(node)!;
  const type = getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input, existing?.type ?? invalidCsharpType("get accessor type"), diagnostics);
  const state = createDestructuringPlannerState();
  state.currentReturnType = type;
  return {
    kind: "PropertyDeclaration",
    name,
    modifiers: existing?.modifiers ?? planClassMemberModifiers(node, declaration.name, input),
    attributes: existing?.attributes ?? planAttributesForSubject(node, sourceFile, input, diagnostics),
    type,
    getter: {
      kind: "Block",
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
    },
    ...(existing?.setter === undefined ? {} : { setter: existing.setter }),
  };
}

function mergeSetterAccessor(
  existing: CsharpPropertyDeclaration | undefined,
  node: Node,
  name: string,
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
): CsharpPropertyDeclaration {
  const declaration = AsSetAccessorDeclaration(node)!;
  const parameterNodes = declaration.Parameters?.Nodes ?? [];
  const parameterNode = parameterNodes[0];
  const parameterDeclaration = parameterNode === undefined ? undefined : AsParameterDeclaration(parameterNode)!;
  if (parameterDeclaration === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Set accessor requires exactly one parameter."));
  }
  if (parameterNodes.filter((parameterItem) => parameterItem !== undefined).length > 1) {
    diagnostics.push(unsupportedNodeDiagnostic(node, "Set accessor has more than one parameter."));
  }
  const type = getCsharpTypeForNode(
    parameterDeclaration?.Type ?? declaration.Type ?? declaration.name,
    sourceFile,
    input,
    existing?.type ?? invalidCsharpType("set accessor type"),
    diagnostics,
  );
  const parameterAlias = HasSourceKind(input.ast, parameterDeclaration?.name, KindObjectBindingPattern) || HasSourceKind(input.ast, parameterDeclaration?.name, KindArrayBindingPattern)
    ? undefined
    : parameterDeclaration === undefined
      ? undefined
      : {
          name: planIdentifierName(parameterDeclaration.name, "value", input, diagnostics, "Set accessor parameter name"),
          type,
        };
  const state = createDestructuringPlannerState();
  const parameterName = parameterDeclaration?.name;
  const parameterPrelude = HasSourceKind(input.ast, parameterName, KindObjectBindingPattern) || HasSourceKind(input.ast, parameterName, KindArrayBindingPattern)
    ? planParameterBindingPrelude(parameterName, "value", sourceFile, input, diagnostics, state)
    : [];
  return {
    kind: "PropertyDeclaration",
    name,
    modifiers: existing?.modifiers ?? planClassMemberModifiers(node, declaration.name, input),
    attributes: existing?.attributes ?? planAttributesForSubject(node, sourceFile, input, diagnostics),
    type,
    ...(existing?.getter === undefined ? {} : { getter: existing.getter }),
    setter: {
      kind: "Block",
      statements: planSetAccessorStatements(declaration.Body, parameterAlias, parameterPrelude, sourceFile, input, diagnostics, state),
    },
  };
}

function planSetAccessorStatements(
  body: Node | undefined,
  parameter: Pick<CsharpParameter, "name" | "type"> | undefined,
  parameterPrelude: readonly CsharpStatement[],
  sourceFile: SourceFile,
  input: TargetCompileInput,
  diagnostics: TargetDiagnostic[],
  state: ReturnType<typeof createDestructuringPlannerState>,
): readonly CsharpStatement[] {
  const statements = planBlockStatements(body, sourceFile, input, diagnostics, state);
  return [
    ...(parameter === undefined || parameter.name === "value"
      ? []
      : [{
          kind: "LocalDeclarationStatement" as const,
          name: parameter.name,
          type: parameter.type,
          initializer: { kind: "IdentifierName" as const, name: "value" },
        }]),
    ...parameterPrelude,
    ...statements,
  ];
}

function planClassMemberModifiers(node: Node, name: Node | undefined, input: TargetCompileInput): readonly ("public" | "private" | "static")[] {
  const access = HasSourceKind(input.ast, name, KindPrivateIdentifier) ? "private" : "public";
  return HasSyntacticModifier(node, ModifierFlagsStatic)
    ? [access, "static"]
    : [access];
}

function planMethodModifiers(node: Node, name: Node | undefined, input: TargetCompileInput): CsharpMethodDeclaration["modifiers"] {
  const modifiers: CsharpMethodDeclaration["modifiers"][number][] = [...planClassMemberModifiers(node, name, input)];
  if (isAsyncNode(node)) {
    modifiers.push("async");
  }
  return modifiers;
}
