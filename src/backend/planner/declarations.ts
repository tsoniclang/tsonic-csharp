import {
  AsBlock,
  AsCallExpression,
  AsClassDeclaration,
  AsClassStaticBlockDeclaration,
  AsConstructorDeclaration,
  AsExpressionStatement,
  AsFunctionDeclaration,
  AsGetAccessorDeclaration,
  AsMethodDeclaration,
  AsParameterDeclaration,
  AsPropertyDeclaration,
  AsSetAccessorDeclaration,
  KindCallExpression,
  KindConstructor,
  KindClassStaticBlockDeclaration,
  KindExpressionStatement,
  KindGetAccessor,
  KindMethodDeclaration,
  KindArrayBindingPattern,
  KindObjectBindingPattern,
  KindPrivateIdentifier,
  KindPropertyDeclaration,
  KindSetAccessor,
  KindSuperKeyword,
  HasSyntacticModifier,
  HasSourceKind,
  ModifierFlagsStatic,
  SourceKind,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetCompileInput, TargetDiagnostic } from "@tsonic/target-api";
import type {
  CsharpClassDeclaration,
  CsharpConstructorDeclaration,
  CsharpFieldDeclaration,
  CsharpMethodDeclaration,
  CsharpParameter,
  CsharpPropertyDeclaration,
  CsharpStatement,
  CsharpTypeMember,
} from "../roslyn/syntax.js";
import { planAttributesForSubject } from "./attributes.js";
import { getCsharpTypeForNode, invalidCsharpType } from "./csharp-types.js";
import {
  createDestructuringPlannerState,
  planParameterBindingPrelude,
} from "./bindings.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import { planCallArgument, planExpressionWithExpectedType } from "./expressions.js";
import { planClassHeritage } from "./heritage.js";
import { diagnoseTypeScriptOnlyRuntimeShapeModifiers, isAsyncNode } from "./modifiers.js";
import { planIdentifierName } from "./names.js";
import { planParametersWithPrelude } from "./parameters.js";
import { planBlockStatements, planStatements } from "./statements.js";
import { planTypeParameters } from "./type-parameters.js";
import { getExplicitReturnType } from "./declaration-return-types.js";

export { planEnumDeclaration } from "./declaration-enums.js";
export { planInterfaceDeclaration } from "./declaration-interfaces.js";

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
