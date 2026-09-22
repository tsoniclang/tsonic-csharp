import type { CsharpExpression, CsharpStatement } from "../../target-ast/roslyn/index.js";
import type { CsharpNativeMemoryLayout } from "../../../target-model/operations/native-memory.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpRuntimeNativeLayoutTargetType, csharpRuntimeNativeLocationTargetType, csharpRuntimeNativeArrayTargetType } from "../../../target-model/types/runtime-carriers.js";

export function planCsharpNativeMemoryCall(
  method: "Allocate" | "ToRaw" | "Reinterpret", value: CsharpExpression, layout: CsharpNativeMemoryLayout,
): CsharpExpression | undefined {
  const pointee = csharpTypeFromTargetTypeRef(layout.pointeeType);
  const owner = csharpTypeFromTargetTypeRef(csharpRuntimeNativeLocationTargetType());
  const codec = planCsharpNativeLayout(layout);
  if (pointee === undefined || owner === undefined || codec === undefined) return undefined;
  return { kind: "InvocationExpression", callee: {
    kind: "SimpleMemberAccessExpression",
    receiver: owner,
    name: method, typeArguments: [pointee],
  }, arguments: [value, codec].map(expression => ({ kind: "Argument", expression })) };
}

export function planCsharpNativeArray(initial: CsharpExpression, layout: CsharpNativeMemoryLayout, stride: number): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(csharpRuntimeNativeArrayTargetType(layout.pointeeType));
  const codec = planCsharpNativeLayout(layout);
  return type === undefined || codec === undefined ? undefined : { kind: "ObjectCreationExpression", type,
    arguments: [initial, codec, numeric(stride)].map(expression => ({ kind: "Argument", expression })) };
}

function planCsharpNativeLayout(layout: CsharpNativeMemoryLayout): CsharpExpression | undefined {
  const pointee = csharpTypeFromTargetTypeRef(layout.pointeeType);
  const owner = csharpTypeFromTargetTypeRef(csharpRuntimeNativeLayoutTargetType(layout.kind === "scalar" ? undefined : layout.pointeeType));
  if (pointee === undefined || owner === undefined) return undefined;
  const dimensions: CsharpExpression[] = [
    { kind: "NumericLiteralExpression" as const, value: layout.size },
    { kind: "NumericLiteralExpression" as const, value: layout.alignment },
    { kind: "NumericLiteralExpression" as const, value: layout.width },
    { kind: "LiteralExpression" as const, value: layout.littleEndian },
  ];
  if (layout.kind === "scalar") return { kind: "InvocationExpression", callee: {
    kind: "SimpleMemberAccessExpression", receiver: owner, name: "Scalar", typeArguments: [pointee],
  }, arguments: dimensions.map(expression => ({ kind: "Argument", expression })) };
  const read: CsharpStatement[] = [{ kind: "LocalDeclarationStatement", type: pointee,
    name: "result", ...(layout.kind === "array" ? {} : { initializer: { kind: "DefaultExpression" as const, type: pointee } }) }];
  const nativeSize = (value: number): CsharpExpression => ({ kind: "CastExpression",
    type: { kind: "PredefinedType", name: "nuint" }, expression: numeric(value) });
  const addOffset = (offset: CsharpExpression, value: CsharpExpression): CsharpExpression => ({ kind: "BinaryExpression",
    left: offset, operatorToken: { kind: "PlusToken" }, right: value });
  const assign = (left: CsharpExpression, right: CsharpExpression): CsharpStatement => ({ kind: "ExpressionStatement",
    expression: { kind: "AssignmentExpression", left, operatorToken: { kind: "EqualsToken" }, right } });
  const walk = (
    current: CsharpNativeMemoryLayout, destination: CsharpExpression, source: CsharpExpression,
    offset: CsharpExpression, alignment: number, depth: number,
  ): { readonly read: readonly CsharpStatement[]; readonly write: readonly CsharpStatement[] } | undefined => {
    const type = csharpTypeFromTargetTypeRef(current.pointeeType);
    if (type === undefined) return undefined;
    if (current.kind === "array") {
      if (type.kind !== "ArrayType" || !/^(0|[1-9][0-9]*)$/u.test(current.length) ||
        BigInt(current.length) > 2147483647n) return undefined;
      const length = Number(current.length);
      const index: CsharpExpression = { kind: "IdentifierName", name: `index_${depth}` };
      const placement = addOffset(offset, { kind: "BinaryExpression",
        left: { kind: "CastExpression", type: { kind: "PredefinedType", name: "nuint" }, expression: index },
        operatorToken: { kind: "AsteriskToken" }, right: nativeSize(current.stride) });
      const element = walk(current.element,
        { kind: "ElementAccessExpression", receiver: destination, arguments: [index] },
        { kind: "ElementAccessExpression", receiver: source, arguments: [index] },
        placement, Math.min(alignment, current.element.alignment), depth + 1);
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
      for (const field of current.fields) {
        const child = walk(field.layout,
          { kind: "SimpleMemberAccessExpression", receiver: destination, name: field.name },
          { kind: "SimpleMemberAccessExpression", receiver: source, name: field.name },
          field.offset === 0 ? offset : addOffset(offset, nativeSize(field.offset)),
          Math.min(alignment, field.alignment), depth + 1);
        if (child === undefined) return undefined;
        read.push(...child.read);
        write.push(...child.write);
      }
      return { read, write };
    }
    const access = (method: string, value?: CsharpExpression): CsharpExpression => ({ kind: "InvocationExpression", callee: {
      kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "pointer" }, name: method, typeArguments: [type],
    }, arguments: [offset, numeric(alignment), ...(value === undefined ? [] : [value])]
      .map(expression => ({ kind: "Argument", expression })) });
    return { read: [assign(destination, access("ReadAt"))],
      write: [{ kind: "ExpressionStatement", expression: access("WriteAt", source) }] };
  };
  const codec = walk(layout, { kind: "IdentifierName", name: "result" },
    { kind: "IdentifierName", name: "value" }, nativeSize(0), layout.alignment, 0);
  if (codec === undefined) return undefined;
  read.push(...codec.read);
  read.push({ kind: "ReturnStatement", expression: { kind: "IdentifierName", name: "result" } });
  return { kind: "ObjectCreationExpression", type: owner, arguments: [...dimensions,
    { kind: "LambdaExpression" as const, parameters: [{ kind: "Parameter" as const, name: "pointer" }], body: { kind: "Block" as const, statements: read } },
    { kind: "LambdaExpression" as const, parameters: [{ kind: "Parameter" as const, name: "pointer" }, { kind: "Parameter" as const, name: "value" }], body: { kind: "Block" as const, statements: codec.write } },
  ].map(expression => ({ kind: "Argument", expression })) };
}

function numeric(value: number): CsharpExpression { return { kind: "NumericLiteralExpression", value }; }
