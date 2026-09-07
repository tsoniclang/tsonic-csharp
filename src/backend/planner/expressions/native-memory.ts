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
    name: "result", initializer: { kind: "DefaultExpression", type: pointee } }];
  const write: CsharpStatement[] = [];
  const walk = (current: CsharpNativeMemoryLayout, names: readonly string[], offset: number, alignment: number): boolean => {
    if (current.kind === "record") return current.fields.every(field =>
      walk(field.layout, [...names, field.name], offset + field.offset, Math.min(alignment, field.alignment)));
    const type = csharpTypeFromTargetTypeRef(current.pointeeType);
    if (type === undefined) return false;
    const member = (root: string): CsharpExpression => names.reduce<CsharpExpression>((receiver, name) =>
      ({ kind: "SimpleMemberAccessExpression", receiver, name }), { kind: "IdentifierName", name: root });
    const access = (method: string, value?: CsharpExpression): CsharpExpression => ({ kind: "InvocationExpression", callee: {
      kind: "SimpleMemberAccessExpression", receiver: { kind: "IdentifierName", name: "pointer" }, name: method, typeArguments: [type],
    }, arguments: [numeric(offset), numeric(alignment), ...(value === undefined ? [] : [value])]
      .map(expression => ({ kind: "Argument", expression })) });
    read.push({ kind: "ExpressionStatement", expression: { kind: "AssignmentExpression", left: member("result"),
      operatorToken: { kind: "EqualsToken" }, right: access("ReadAt") } });
    write.push({ kind: "ExpressionStatement", expression: access("WriteAt", member("value")) });
    return true;
  };
  if (!walk(layout, [], 0, layout.alignment)) return undefined;
  read.push({ kind: "ReturnStatement", expression: { kind: "IdentifierName", name: "result" } });
  return { kind: "ObjectCreationExpression", type: owner, arguments: [...dimensions,
    { kind: "LambdaExpression" as const, parameters: [{ kind: "Parameter" as const, name: "pointer" }], body: { kind: "Block" as const, statements: read } },
    { kind: "LambdaExpression" as const, parameters: [{ kind: "Parameter" as const, name: "pointer" }, { kind: "Parameter" as const, name: "value" }], body: { kind: "Block" as const, statements: write } },
  ].map(expression => ({ kind: "Argument", expression })) };
}

function numeric(value: number): CsharpExpression { return { kind: "NumericLiteralExpression", value }; }
