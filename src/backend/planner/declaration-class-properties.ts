import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  fieldFactKey,
  type FieldFact,
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpFieldDeclaration,
  CsharpParameter,
  CsharpPropertyDeclaration,
  CsharpStatement,
  CsharpTypeMember,
} from "../roslyn/syntax.js";
import {
  AsGetAccessorDeclaration,
  AsParameterDeclaration,
  AsPropertyDeclaration,
  AsSetAccessorDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindGetAccessor,
  KindObjectBindingPattern,
} from "./source-ast.js";
import {
  createDestructuringPlannerState,
  planParameterBindingPrelude,
} from "./bindings.js";
import {
  getCsharpTypeForNode,
  invalidCsharpType,
  nullableCsharpType,
} from "./csharp-types.js";
import {
  unsupportedNodeDiagnostic,
} from "./diagnostics.js";
import {
  planExpressionWithExpectedType,
} from "./expressions.js";
import {
  diagnoseTypeScriptOnlyRuntimeShapeModifiers,
} from "./modifiers.js";
import {
  planIdentifierName,
} from "./names.js";
import {
  planBlockStatements,
} from "./statements.js";
import {
  planClassMemberModifiers,
  planPropertyModifiers,
} from "./declaration-class-modifiers.js";
import {
  planAttributesForSubject,
} from "./attributes.js";
import {
  getCsharpTypeForFieldFact,
} from "./value-types.js";

export function planPropertyDeclaration(
  node: Node,
  autoPropertyNames: ReadonlySet<string>,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpFieldDeclaration | CsharpPropertyDeclaration {
  const declaration = AsPropertyDeclaration(node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, node, "property declaration", diagnostics);
  const fieldFact = getClassPropertyFieldFact(node, declaration, input);
  if (fieldFact !== undefined) {
    const type = getCsharpTypeForFieldFact(fieldFact, "Class field", sourceFile, input, diagnostics);
    return {
      kind: "FieldDeclaration",
      name: planIdentifierName(declaration.name, "FieldDeclaration", input, diagnostics, "Field name"),
      modifiers: planClassMemberModifiers(node, declaration.name, input),
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      type,
    };
  }
  const declaredType = getCsharpTypeForNode(
    declaration.Type ?? declaration.name,
    sourceFile,
    input,
    invalidCsharpType("property type"),
    diagnostics,
  );
  const type = input.ast.questionToken(node) === undefined
    ? declaredType
    : nullableCsharpType(declaredType);
  const propertyName = planIdentifierName(declaration.name, "FieldDeclaration", input, diagnostics, "Field name");
  if (!shouldEmitAutoProperty(node, propertyName, autoPropertyNames, sourceFile, input)) {
    return {
      kind: "FieldDeclaration",
      name: propertyName,
      modifiers: planClassMemberModifiers(node, declaration.name, input),
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      type,
      ...(declaration.Initializer !== undefined
        ? { initializer: planExpressionWithExpectedType(declaration.Initializer, sourceFile, input, diagnostics, type, declaration.Type ?? declaration.name) }
        : {}),
    };
  }
  return {
    kind: "PropertyDeclaration",
    name: propertyName,
    modifiers: planPropertyModifiers(node, declaration.name, sourceFile, input),
    attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
    type,
    autoGetter: true,
    autoSetter: true,
    ...(declaration.Initializer !== undefined
      ? { initializer: planExpressionWithExpectedType(declaration.Initializer, sourceFile, input, diagnostics, type, declaration.Type ?? declaration.name) }
      : {}),
  };
}

function shouldEmitAutoProperty(
  node: Node,
  propertyName: string,
  autoPropertyNames: ReadonlySet<string>,
  _sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  const dispatch = input.navigation.memberDispatch(node);
  return autoPropertyNames.has(propertyName) ||
    dispatch?.overridesBase === true ||
    dispatch?.hasDerivedOverride === true;
}

export function mergeAccessorProperty(
  node: Node,
  planned: CsharpTypeMember[],
  accessorProperties: Map<string, CsharpPropertyDeclaration>,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): void {
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.ast, node, "accessor declaration", diagnostics);
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

function getClassPropertyFieldFact(
  node: Node,
  declaration: NonNullable<ReturnType<typeof AsPropertyDeclaration>>,
  input: CsharpTranslationContext,
): FieldFact | undefined {
  return input.sourceFacts?.getFact(node, fieldFactKey) ??
    input.sourceFacts?.getFact(declaration.name, fieldFactKey) ??
    input.sourceFacts?.getFact(declaration.Type, fieldFactKey) ??
    input.sourceFacts?.getFact(declaration.Initializer, fieldFactKey);
}

function mergeGetterAccessor(
  existing: CsharpPropertyDeclaration | undefined,
  node: Node,
  name: string,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): CsharpPropertyDeclaration {
  const declaration = AsGetAccessorDeclaration(node)!;
  const type = getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input, existing?.type ?? invalidCsharpType("get accessor type"), diagnostics);
  const state = createDestructuringPlannerState(node, input.ast);
  state.currentReturnType = type;
  return {
    kind: "PropertyDeclaration",
    name,
    modifiers: existing?.modifiers ?? planPropertyModifiers(node, declaration.name, sourceFile, input),
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
  input: CsharpTranslationContext,
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
  const state = createDestructuringPlannerState(node, input.ast);
  const parameterName = parameterDeclaration?.name;
  const parameterPrelude = HasSourceKind(input.ast, parameterName, KindObjectBindingPattern) || HasSourceKind(input.ast, parameterName, KindArrayBindingPattern)
    ? planParameterBindingPrelude(parameterName, "value", sourceFile, input, diagnostics, state)
    : [];
  return {
    kind: "PropertyDeclaration",
    name,
    modifiers: existing?.modifiers ?? planPropertyModifiers(node, declaration.name, sourceFile, input),
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
  input: CsharpTranslationContext,
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
