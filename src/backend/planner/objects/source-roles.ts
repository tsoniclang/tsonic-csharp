import type { CsharpPlanningContext } from "../context.js";
import type { CsharpOutputSourceFile } from "../../artifact-model/output.js";
import type { CsharpExpression, CsharpMethodDeclaration, CsharpStatement, CsharpStructDeclaration, CsharpTypeNode } from "../../target-ast/syntax/index.js";
import type { TargetTypeRef, CsharpOptionalStorageLayout } from "../../../target-model/types/native-type-data.js";
import type { CsharpSourceRoleEmission } from "../../../target-model/records/types/source-roles.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { csharpGenericConstraintFromTargetTypeParameterConstraint } from "../types/type-parameters.js";
import { csharpCompilationRequiresUnsafe, csharpTypeSafetyModifiers } from "../safety/explicit-safety.js";
import { finalizeCsharpCompilationUnit } from "../program/compilation-unit.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

const argument: CsharpExpression = { kind: "IdentifierName", name: "value" };
const invalid: CsharpExpression = { kind: "ThrowExpression", expression: { kind: "ObjectCreationExpression",
  type: { kind: "IdentifierName", name: "System.InvalidOperationException" },
  arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "The value does not occupy this Source role." } }] } };

export function planCsharpSourceRoleFile(input: CsharpPlanningContext):
  { readonly source: CsharpOutputSourceFile; readonly requiresUnsafe: boolean } | undefined {
  const declarations = input.program.records.sourceRoles.get().map(definition => planRole(input, definition));
  if (declarations.length === 0) return undefined;
  const finalized = finalizeCsharpCompilationUnit({ kind: "CompilationUnit", usings: [],
    members: [{ kind: "NamespaceDeclaration", name: input.program.records.compilation.get().namespace, members: declarations }],
  }, csharpCompilationRequiresUnsafe("source-roles", input));
  return { source: { path: "generated/TsonicSourceRoles.cs", unit: finalized.unit }, requiresUnsafe: finalized.requiresUnsafe };
}

function planRole(input: CsharpPlanningContext, definition: CsharpSourceRoleEmission): CsharpStructDeclaration {
  const names = new Map(definition.parameters.map((parameter, index) => [parameter.identity, `T${index}`]));
  const render = (carrier: TargetTypeRef): CsharpTypeNode => csharpTypeFromTargetTypeRef(carrier, names)
    ?? failCsharpPlannerInvariant("An admitted Source role requires every exact Native physical type.", definition.site);
  const storageType = render(definition.storage);
  const valueType = render(definition.value);
  const witnessType = render(definition.carrier);
  if (witnessType.kind !== "IdentifierName") failCsharpPlannerInvariant("A generated Source role requires its exact Native witness name.", definition.site);
  const storagePayload = definition.storageOptional?.payload ?? definition.storage;
  const valuePayload = definition.valueOptional?.payload ?? definition.value;

  const memberCall = (receiver: CsharpExpression, name: string, values: readonly CsharpExpression[] = []): CsharpExpression => ({
    kind: "InvocationExpression", callee: { kind: "SimpleMemberAccessExpression", receiver, name },
    arguments: values.map(expression => ({ kind: "Argument", expression })),
  });
  const absent = (layout: CsharpOptionalStorageLayout, value: CsharpExpression): CsharpExpression =>
    memberCall(render(layout.operations), "Is1", [value]);
  const empty = (layout: CsharpOptionalStorageLayout): CsharpExpression =>
    memberCall(render(layout.operations), "From1", [{ kind: "LiteralExpression", value: null }]);
  const present = (layout: CsharpOptionalStorageLayout | undefined, value: CsharpExpression): CsharpExpression =>
    layout === undefined ? value : memberCall(render(layout.operations), "As2", [value]);
  const lift = (layout: CsharpOptionalStorageLayout | undefined, value: CsharpExpression): CsharpExpression =>
    layout === undefined ? value : memberCall(render(layout.operations), "From2", [value]);
  const payload = (value: CsharpExpression, slots: readonly TargetTypeRef[], index: number): CsharpExpression =>
    slots.length === 1 ? value : memberCall(value, `As${index + 1}`);
  const inject = (carrier: TargetTypeRef, slots: readonly TargetTypeRef[], index: number,
    value: CsharpExpression): CsharpExpression => slots.length === 1 ? value : memberCall(render(carrier), `From${index + 1}`, [value]);
  const hasSlot = (value: CsharpExpression, slots: readonly TargetTypeRef[], index: number): CsharpExpression =>
    slots.length === 1 ? { kind: "LiteralExpression", value: true } : memberCall(value, `Is${index + 1}`);
  const choices = (values: readonly { readonly condition: CsharpExpression; readonly value: CsharpExpression }[],
    alternative: CsharpExpression): CsharpExpression => values.reduceRight<CsharpExpression>((otherwise, choice) => ({
      kind: "ConditionalExpression", condition: choice.condition, whenTrue: choice.value, whenFalse: otherwise,
    }), alternative);
  const value = present(definition.valueOptional, argument);
  const storage = present(definition.storageOptional, argument);
  const injectRole = choices(definition.valueToStorage.map((index, valueIndex) => ({
    condition: hasSlot(value, definition.valueSlots, valueIndex),
    value: lift(definition.storageOptional, inject(storagePayload, definition.storageSlots, index,
      payload(value, definition.valueSlots, valueIndex))),
  })), invalid);
  const extractRole = choices(definition.valueToStorage.map((index, valueIndex) => ({
    condition: hasSlot(storage, definition.storageSlots, index),
    value: lift(definition.valueOptional, inject(valuePayload, definition.valueSlots, valueIndex,
      payload(storage, definition.storageSlots, index))),
  })), invalid);
  const contains = definition.valueToStorage.map(index => hasSlot(storage, definition.storageSlots, index))
    .reduce<CsharpExpression>((previous, condition) => ({ kind: "BinaryExpression", left: previous,
      operatorToken: { kind: "BarBarToken" }, right: condition }), { kind: "LiteralExpression", value: false });
  const method = (name: "From" | "Is" | "As", parameterType: CsharpTypeNode, resultType: CsharpTypeNode,
    expression: CsharpExpression, optional: CsharpOptionalStorageLayout | undefined, whenAbsent: CsharpExpression): CsharpMethodDeclaration => {
    const statements: CsharpStatement[] = [];
    if (optional !== undefined) statements.push({ kind: "IfStatement", condition: absent(optional, argument),
      thenBody: { kind: "Block", statements: [{ kind: "ReturnStatement", expression: whenAbsent }] } });
    statements.push({ kind: "ReturnStatement", expression });
    return { kind: "MethodDeclaration", modifiers: ["public", "static"], name, returnType: resultType,
      parameters: [{ name: "value", type: parameterType }], body: { kind: "Block", statements } };
  };
  return { kind: "StructDeclaration", name: witnessType.name,
    modifiers: ["public", "readonly", ...csharpTypeSafetyModifiers(input, definition.storage), ...csharpTypeSafetyModifiers(input, definition.value)],
    typeParameters: definition.parameters.map((parameter, index) => ({ name: `T${index}`,
      constraints: parameter.csharpConstraints.constraints.map(constraint =>
        csharpGenericConstraintFromTargetTypeParameterConstraint(names, constraint, definition.site, [])) })),
    interfaces: definition.interfaces.map(render),
    members: [method("From", valueType, storageType, injectRole, definition.valueOptional,
      definition.storageOptional === undefined ? invalid : empty(definition.storageOptional)),
      method("Is", storageType, { kind: "PredefinedType", name: "bool" }, contains,
        definition.storageOptional, { kind: "LiteralExpression", value: definition.valueOptional !== undefined }),
      method("As", storageType, valueType, extractRole, definition.storageOptional,
        definition.valueOptional === undefined ? invalid : empty(definition.valueOptional))],
  };
}
