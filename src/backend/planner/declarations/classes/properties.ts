import type { CsharpPlanningContext } from "../../context.js";
import {
  type Node,
  type SourceFile,
} from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpFieldDeclaration,
  CsharpExpression,
  CsharpParameter,
  CsharpPropertyDeclaration,
  CsharpStatement,
  CsharpTypeMember,
} from "../../../target-ast/roslyn/index.js";
import {
  AsGetAccessorDeclaration,
  AsParameterDeclaration,
  AsPropertyDeclaration,
  AsSetAccessorDeclaration,
  HasSourceKind,
  KindArrayBindingPattern,
  KindGetAccessor,
  KindObjectBindingPattern,
  sourceParameterIsProperty,
} from "@tsonic/target-api/source";
import {
  createDestructuringPlannerState,
  planParameterBindingPrelude,
} from "../../bindings/index.js";
import {
  getCsharpTypeForNode,
  invalidCsharpType,
} from "../../types/index.js";
import {
  targetPolicyDiagnostic,
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import {
  diagnoseTypeScriptOnlyRuntimeShapeModifiers,
} from "../modifiers.js";
import {
  planIdentifierName,
} from "../../names/source-identifiers.js";
import {
  planBlockStatements,
} from "../../statements/index.js";
import {
  planClassMemberModifiers,
  planPropertyModifiers,
} from "./modifiers.js";
import {
  planAttributesForSubject,
} from "../attributes.js";
import { getCsharpTypeForSourceField } from "../value-types.js";
import {
  csharpSafetyAccessorModifiersForDeclaration,
  diagnoseUnavailableCsharpSafetyAccessors,
  withCsharpSafetyModifiers,
} from "../../safety/explicit-safety.js";

export function planPropertyDeclaration(
  node: Node,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  initializer: CsharpExpression | undefined,
): CsharpFieldDeclaration | CsharpPropertyDeclaration {
  const parameterProperty = sourceParameterIsProperty(input.program.source.ast, node);
  const declaration = parameterProperty ? AsParameterDeclaration(input.program.source.ast, node)! :
    AsPropertyDeclaration(input.program.source.ast, node)!;
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "property declaration", diagnostics, ["public", "private", "protected", "readonly", "abstract", "override"]);
  const sourceField = input.program.sourceEvidence.sourceField([node, declaration.name, declaration.Type,
    ...(parameterProperty ? [] : [declaration.Initializer])]);
  if (sourceField !== undefined) {
    diagnoseUnavailableCsharpSafetyAccessors(
      node,
      [],
      input,
      diagnostics,
    );
    const type = getCsharpTypeForSourceField(sourceField, "Class field", sourceFile, input, diagnostics);
    return {
      kind: "FieldDeclaration",
      name: planIdentifierName(declaration.name, "FieldDeclaration", input, diagnostics, "Field name"),
      modifiers: withCsharpSafetyModifiers(
        planClassMemberModifiers(node, declaration.name, input),
        node,
        "declaration",
        input,
      ),
      attributes: planAttributesForSubject(node, sourceFile, input, diagnostics),
      type,
    };
  }
  const type = getCsharpTypeForNode(
    node,
    sourceFile,
    input,
    invalidCsharpType("property type"),
    diagnostics,
  );
  const propertyName = planIdentifierName(declaration.name, "FieldDeclaration", input, diagnostics, "Field name");
  const modifiers = planClassMemberModifiers(node, declaration.name, input);
  const storage = input.program.operations.classPropertyStorage(node);
  if (storage === undefined) diagnostics.push(unsupportedNodeDiagnostic(node,
    "The class property has no sealed native field/property representation."));
  if (input.program.source.ast.hasModifierKind(node, "abstract")) {
    return {
      kind: "PropertyDeclaration", name: propertyName,
      modifiers: planPropertyModifiers(node, declaration.name, sourceFile, input),
      type, autoGetter: true, autoSetter: storage?.readonly !== true,
      attributes: parameterProperty ? [] : planAttributesForSubject(node, sourceFile, input, diagnostics),
    };
  }
  if (declaration.Initializer === undefined && modifiers.includes("static")) {
    diagnostics.push(targetPolicyDiagnostic(
      node,
      "CSHARP_STATIC_FIELD_INITIALIZER_REQUIRED",
      "A static class field requires an explicit initializer. Use defaultValue<T>() when target-native default initialization is intended; an uninitialized TypeScript field has undefined runtime semantics and cannot be replaced by a C# default value.",
    ));
  }
  if (storage?.kind === "field") {
    diagnoseUnavailableCsharpSafetyAccessors(
      node,
      [],
      input,
      diagnostics,
    );
    return {
      kind: "FieldDeclaration",
      name: propertyName,
      modifiers: withCsharpSafetyModifiers(
        storage.readonly ? [...modifiers, "readonly"] : modifiers,
        node,
        "declaration",
        input,
      ),
      attributes: parameterProperty ? [] : planAttributesForSubject(node, sourceFile, input, diagnostics),
      type,
      ...(initializer === undefined ? {} : { initializer }),
    };
  }
  return {
    kind: "PropertyDeclaration",
    name: propertyName,
    modifiers: withCsharpSafetyModifiers(
      planPropertyModifiers(node, declaration.name, sourceFile, input),
      node,
      "declaration",
      input,
    ),
    attributes: parameterProperty ? [] : planAttributesForSubject(node, sourceFile, input, diagnostics),
    type,
    autoGetter: true,
    autoSetter: storage?.readonly !== true,
    getterModifiers: csharpSafetyAccessorModifiersForDeclaration(
      node,
      "getter",
      input,
    ),
    setterModifiers: csharpSafetyAccessorModifiersForDeclaration(
      node,
      "setter",
      input,
    ),
    ...(initializer === undefined ? {} : { initializer }),
  };
}

export function mergeAccessorProperty(
  node: Node,
  planned: CsharpTypeMember[],
  accessorProperties: Map<string, CsharpPropertyDeclaration>,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): void {
  diagnoseTypeScriptOnlyRuntimeShapeModifiers(input.program.source.ast, node, "accessor declaration", diagnostics, ["public", "private", "protected", "abstract", "override"]);
  const accessor = HasSourceKind(input.program.source.ast, node, KindGetAccessor)
    ? AsGetAccessorDeclaration(input.program.source.ast, node)!
    : AsSetAccessorDeclaration(input.program.source.ast, node)!;
  const name = planIdentifierName(accessor.name, "PropertyDeclaration", input, diagnostics, "Accessor name");
  const existing = accessorProperties.get(name);
  const next = HasSourceKind(input.program.source.ast, node, KindGetAccessor)
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
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpPropertyDeclaration {
  const declaration = AsGetAccessorDeclaration(input.program.source.ast, node)!;
  const type = getCsharpTypeForNode(declaration.Type ?? declaration.name, sourceFile, input, existing?.type ?? invalidCsharpType("get accessor type"), diagnostics);
  const state = createDestructuringPlannerState(node, input.program.source.ast);
  state.currentReturnType = type;
  state.currentReturnExpressionTargetType = input.types.classifications.resolveNode(declaration.Type ?? declaration.name, sourceFile);
  return {
    kind: "PropertyDeclaration",
    name,
    modifiers: withCsharpSafetyModifiers(
      existing?.modifiers ?? planPropertyModifiers(
        node,
        declaration.name,
        sourceFile,
        input,
      ),
      node,
      "declaration",
      input,
    ),
    attributes: existing?.attributes ?? planAttributesForSubject(node, sourceFile, input, diagnostics),
    type,
    ...(input.program.source.ast.hasModifierKind(node, "abstract") ? { autoGetter: true } : { getter: {
      kind: "Block",
      statements: planBlockStatements(declaration.Body, sourceFile, input, diagnostics, state),
    } as const }),
    getterModifiers: mergeAccessorModifiers(
      existing?.getterModifiers,
      csharpSafetyAccessorModifiersForDeclaration(node, "getter", input),
    ),
    ...(existing?.setter === undefined ? {} : { setter: existing.setter }),
    ...(existing?.autoSetter === undefined ? {} : { autoSetter: existing.autoSetter }),
    ...(existing?.setterModifiers === undefined
      ? {}
      : { setterModifiers: existing.setterModifiers }),
  };
}

function mergeSetterAccessor(
  existing: CsharpPropertyDeclaration | undefined,
  node: Node,
  name: string,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): CsharpPropertyDeclaration {
  const declaration = AsSetAccessorDeclaration(input.program.source.ast, node)!;
  const parameterNodes = declaration.Parameters?.Nodes ?? [];
  const parameterNode = parameterNodes[0];
  const parameterDeclaration = parameterNode === undefined ? undefined : AsParameterDeclaration(input.program.source.ast, parameterNode)!;
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
  const parameterAlias = HasSourceKind(input.program.source.ast, parameterDeclaration?.name, KindObjectBindingPattern) || HasSourceKind(input.program.source.ast, parameterDeclaration?.name, KindArrayBindingPattern)
    ? undefined
    : parameterDeclaration === undefined
      ? undefined
      : {
          name: planIdentifierName(parameterDeclaration.name, "value", input, diagnostics, "Set accessor parameter name"),
          type,
        };
  const state = createDestructuringPlannerState(node, input.program.source.ast);
  const parameterName = parameterDeclaration?.name;
  const parameterPrelude = HasSourceKind(input.program.source.ast, parameterName, KindObjectBindingPattern) || HasSourceKind(input.program.source.ast, parameterName, KindArrayBindingPattern)
    ? planParameterBindingPrelude(parameterName, "value", sourceFile, input, diagnostics, state)
    : [];
  return {
    kind: "PropertyDeclaration",
    name,
    modifiers: withCsharpSafetyModifiers(
      existing?.modifiers ?? planPropertyModifiers(
        node,
        declaration.name,
        sourceFile,
        input,
      ),
      node,
      "declaration",
      input,
    ),
    attributes: existing?.attributes ?? planAttributesForSubject(node, sourceFile, input, diagnostics),
    type,
    ...(existing?.getter === undefined ? {} : { getter: existing.getter }),
    ...(existing?.autoGetter === undefined ? {} : { autoGetter: existing.autoGetter }),
    ...(existing?.getterModifiers === undefined
      ? {}
      : { getterModifiers: existing.getterModifiers }),
    ...(input.program.source.ast.hasModifierKind(node, "abstract") ? { autoSetter: true } : { setter: {
      kind: "Block",
      statements: planSetAccessorStatements(declaration.Body, parameterAlias, parameterPrelude, sourceFile, input, diagnostics, state),
    } as const }),
    setterModifiers: mergeAccessorModifiers(
      existing?.setterModifiers,
      csharpSafetyAccessorModifiersForDeclaration(node, "setter", input),
    ),
  };
}

function mergeAccessorModifiers(
  left: CsharpPropertyDeclaration["getterModifiers"],
  right: CsharpPropertyDeclaration["getterModifiers"],
): CsharpPropertyDeclaration["getterModifiers"] {
  return [...new Set([...(left ?? []), ...(right ?? [])])];
}

function planSetAccessorStatements(
  body: Node | undefined,
  parameter: Pick<CsharpParameter, "name" | "type"> | undefined,
  parameterPrelude: readonly CsharpStatement[],
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: ReturnType<typeof createDestructuringPlannerState>,
): readonly CsharpStatement[] {
  return planBlockStatements(body, sourceFile, input, diagnostics, state, [
    ...(parameter === undefined || parameter.name === "value"
      ? []
      : [{
          kind: "LocalDeclarationStatement" as const,
          name: parameter.name,
          type: parameter.type,
          initializer: { kind: "IdentifierName" as const, name: "value" },
        }]),
    ...parameterPrelude,
  ]);
}
