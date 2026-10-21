import type { CsharpExpression, CsharpStatement } from "../../target-ast/syntax/index.js";
import type { CsharpNativeMemoryLayout } from "../../../target-model/operations/native-memory.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpRuntimeNativeArrayTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNativeLayoutOwner, csharpNativeMemoryOwner } from "../../../target-model/names/native-memory.js";
import { qualifiedCsharpType } from "../types/primitives.js";
import type { CsharpNativeLayoutRecords } from "../../../target-model/records/native-layout-emission.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function planCsharpNativeMemoryCall(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  method: "Allocate" | "ToRaw" | "Reinterpret", value: CsharpExpression, layout: CsharpNativeMemoryLayout,
  records: CsharpNativeLayoutRecords,
): CsharpExpression | undefined {
  const pointee = csharpTypeFromTargetTypeRef(layout.pointeeType, typeParameterNames);
  const owner = qualifiedCsharpType(csharpNativeMemoryOwner.namespace, csharpNativeMemoryOwner.name);
  const codec = planCsharpNativeLayout(typeParameterNames, layout, records);
  if (pointee === undefined || codec === undefined) failCsharpPlannerInvariant("An admitted native allocation requires its pointee and codec syntax.");
  return { kind: "InvocationExpression", callee: {
    kind: "SimpleMemberAccessExpression",
    receiver: owner,
    name: method, typeArguments: [pointee],
  }, arguments: [value, codec].map(expression => ({ kind: "Argument", expression })) };
}

export function planCsharpNativeArray(typeParameterNames: ReadonlyMap<string, string> | undefined, initial: CsharpExpression, layout: CsharpNativeMemoryLayout, stride: bigint, records: CsharpNativeLayoutRecords): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(csharpRuntimeNativeArrayTargetType(layout.pointeeType), typeParameterNames);
  const codec = planCsharpNativeLayout(typeParameterNames, layout, records);
  return type === undefined || codec === undefined ? undefined : { kind: "ObjectCreationExpression", type,
    arguments: [initial, codec, csharpNativeSizeLiteral(stride)].map(expression => ({ kind: "Argument", expression })) };
}

function planCsharpNativeLayout(typeParameterNames: ReadonlyMap<string, string> | undefined, layout: CsharpNativeMemoryLayout, records: CsharpNativeLayoutRecords): CsharpExpression | undefined {
  const selected = records.nativeLayoutEmission.get(layout);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted native layout requires its exact emission plan.");
  const pointee = csharpTypeFromTargetTypeRef(layout.pointeeType, typeParameterNames);
  const owner = layout.kind === "scalar" ? qualifiedCsharpType(csharpNativeLayoutOwner.namespace, csharpNativeLayoutOwner.name)
    : csharpTypeFromTargetTypeRef(selected.owner, typeParameterNames);
  if (pointee === undefined || owner === undefined) failCsharpPlannerInvariant("An admitted native layout requires its exact pointee and owner syntax.");
  const dimensions: CsharpExpression[] = [
    csharpNativeSizeLiteral(layout.size),
    csharpNativeSizeLiteral(layout.alignment),
    { kind: "NumericLiteralExpression" as const, value: layout.width },
    { kind: "LiteralExpression" as const, value: layout.littleEndian },
  ];
  if (layout.kind === "scalar") return { kind: "InvocationExpression", callee: {
    kind: "SimpleMemberAccessExpression", receiver: owner, name: "Scalar", typeArguments: [pointee],
  }, arguments: dimensions.map(expression => ({ kind: "Argument", expression })) };
  const read: CsharpStatement[] = [{ kind: "LocalDeclarationStatement", type: pointee,
    name: "result", ...(layout.kind === "array" ? {} : { initializer: { kind: "DefaultExpression" as const, type: pointee } }) }];
  const addOffset = (offset: CsharpExpression, value: CsharpExpression): CsharpExpression => ({ kind: "BinaryExpression",
    left: offset, operatorToken: { kind: "PlusToken" }, right: value });
  const assign = (left: CsharpExpression, right: CsharpExpression): CsharpStatement => ({ kind: "ExpressionStatement",
    expression: { kind: "AssignmentExpression", left, operatorToken: { kind: "EqualsToken" }, right } });
  const walk = (
    current: CsharpNativeMemoryLayout, destination: CsharpExpression, source: CsharpExpression,
    offset: CsharpExpression, alignment: bigint, depth: number,
  ): { readonly read: readonly CsharpStatement[]; readonly write: readonly CsharpStatement[] } | undefined => {
    const type = csharpTypeFromTargetTypeRef(current.pointeeType, typeParameterNames);
    const emission = records.nativeLayoutEmission.get(current);
    if (type === undefined || emission === undefined) failCsharpPlannerInvariant("An admitted native layout requires each child type and emission plan.");
    if (current.kind === "array") {
      if (type.kind !== "ArrayType" || emission.array === undefined) failCsharpPlannerInvariant("An admitted native array layout requires its selected element and extent syntax.");
      const length = emission.array.length;
      const index: CsharpExpression = { kind: "IdentifierName", name: `index_${depth}` };
      const placement = addOffset(offset, { kind: "BinaryExpression",
        left: { kind: "CastExpression", type: { kind: "PredefinedType", name: "nuint" }, expression: index },
        operatorToken: { kind: "AsteriskToken" }, right: csharpNativeSizeLiteral(current.stride) });
      const element = walk(current.element,
        { kind: "ElementAccessExpression", receiver: destination, arguments: [index] },
        { kind: "ElementAccessExpression", receiver: source, arguments: [index] },
        placement, alignment < current.element.alignment ? alignment : current.element.alignment, depth + 1);
      if (element === undefined) return undefined;
      const loop = (statements: readonly CsharpStatement[]): CsharpStatement => ({ kind: "ForStatement",
        initializer: { kind: "VariableDeclaration", locals: [{ kind: "VariableDeclarator", name: index.name,
          type: { kind: "PredefinedType", name: "int" }, initializer: numeric(0) }] },
        condition: { kind: "BinaryExpression", left: index, operatorToken: { kind: "LessThanToken" }, right: numeric(length) },
        incrementors: [{ kind: "PostfixUnaryExpression", operand: index, operatorToken: { kind: "PlusPlusToken" } }],
        body: { kind: "Block", statements } });
      const guard: CsharpStatement = { kind: "IfStatement", condition: { kind: "BinaryExpression",
        left: { kind: "NullPatternExpression", expression: source, negated: false }, operatorToken: { kind: "BarBarToken" },
        right: { kind: "BinaryExpression", left: { kind: "SimpleMemberAccessExpression", receiver: source, name: "Length" },
          operatorToken: { kind: "ExclamationEqualsToken" }, right: numeric(length) } },
        thenBody: { kind: "Block", statements: [{ kind: "ThrowStatement", expression: { kind: "ObjectCreationExpression",
          type: { kind: "AliasQualifiedName", alias: "global", name: { kind: "QualifiedName",
            left: { kind: "IdentifierName", name: "System" }, name: "ArgumentException" } },
          arguments: [{ kind: "Argument", expression: { kind: "LiteralExpression", value: "Value does not match the selected fixed-array extent." } }] } }] } };
      return { read: [assign(destination, { kind: "ArrayCreationExpression", elementType: type.elementType, size: numeric(length), elements: [] }),
          ...(length === 0 || element.read.length === 0 ? [] : [loop(element.read)])],
        write: [guard, ...(length === 0 || element.write.length === 0 ? [] : [loop(element.write)])] };
    }
    if (current.kind === "record") {
      const read: CsharpStatement[] = [];
      const write: CsharpStatement[] = [];
      for (const [index, field] of current.fields.entries()) {
        const name = emission.fields[index];
        if (name === undefined) failCsharpPlannerInvariant("An admitted native layout field requires its physical member name.");
        const child = walk(field.layout,
          { kind: "SimpleMemberAccessExpression", receiver: destination, name },
          { kind: "SimpleMemberAccessExpression", receiver: source, name },
          field.offset === 0n ? offset : addOffset(offset, csharpNativeSizeLiteral(field.offset)),
          alignment < field.alignment ? alignment : field.alignment, depth + 1);
        if (child === undefined) return undefined;
        read.push(...child.read);
        write.push(...child.write);
      }
      return { read, write };
    }
    const access = (method: string, value?: CsharpExpression): CsharpExpression => ({ kind: "InvocationExpression", callee: {
      kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "pointer" }, name: method, typeArguments: [type],
    }, arguments: [offset, csharpNativeSizeLiteral(alignment), ...(value === undefined ? [] : [value])]
      .map(expression => ({ kind: "Argument", expression })) });
    return { read: [assign(destination, access("ReadAt"))],
      write: [{ kind: "ExpressionStatement", expression: access("WriteAt", source) }] };
  };
  const codec = walk(layout, { kind: "IdentifierName", name: "result" },
    { kind: "IdentifierName", name: "value" }, csharpNativeSizeLiteral(0n), layout.alignment, 0);
  if (codec === undefined) return undefined;
  read.push(...codec.read);
  read.push({ kind: "ReturnStatement", expression: { kind: "IdentifierName", name: "result" } });
  return { kind: "ObjectCreationExpression", type: owner, arguments: [...dimensions,
    { kind: "LambdaExpression" as const, parameters: [{ kind: "Parameter" as const, name: "pointer" }], body: { kind: "Block" as const, statements: read } },
    { kind: "LambdaExpression" as const, parameters: [{ kind: "Parameter" as const, name: "pointer" }, { kind: "Parameter" as const, name: "value" }], body: { kind: "Block" as const, statements: codec.write } },
  ].map(expression => ({ kind: "Argument", expression })) };
}

function numeric(value: number): CsharpExpression { return { kind: "NumericLiteralExpression", value }; }

export function csharpNativeSizeLiteral(value: bigint): CsharpExpression {
  return { kind: "CastExpression", type: { kind: "PredefinedType", name: "nuint" },
    expression: { kind: "IntegerLiteralExpression", digits: value.toString(), suffix: "UL" } };
}
