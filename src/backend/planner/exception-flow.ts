import type { TargetTypeRef } from "@tsonic/tsts";
import type { CsharpExpression, CsharpTypeNode } from "../roslyn/syntax.js";
import {
  csharpExceptionTargetType,
  csharpTsThrownValueExceptionTargetType,
  isCsharpAnyRuntimeCarrier,
  isCsharpClosedCompatRuntimeCarrier,
} from "../../source/csharp-source-semantics/target-types.js";
import { csharpTypeFromTargetTypeRef } from "./target-types.js";

const tsValueSupportedSourcePrimitives = new Set([
  "bool",
  "int8",
  "uint8",
  "int16",
  "uint16",
  "int32",
  "uint32",
  "int64",
  "uint64",
  "float32",
  "float64",
  "decimal",
]);

const tsValueSupportedTargetNamedTypes = new Set([
  "System.String",
  "System.Boolean",
  "System.Byte",
  "System.SByte",
  "System.Int16",
  "System.UInt16",
  "System.Int32",
  "System.UInt32",
  "System.Int64",
  "System.UInt64",
  "System.Single",
  "System.Double",
  "System.Decimal",
  "Tsonic.CSharp.Js.Error",
  "Tsonic.CSharp.Js.TypeError",
  "Tsonic.CSharp.Js.RangeError",
  "Tsonic.CSharp.Js.TsValue",
  "Tsonic.CSharp.Js.TsObject",
  "Tsonic.CSharp.Js.TsArray",
  "Tsonic.CSharp.Js.TsFunction",
]);

export function isCsharpCompatThrowableValueCarrier(carrier: TargetTypeRef | undefined): boolean {
  if (carrier === undefined) {
    return false;
  }
  if (isCsharpAnyRuntimeCarrier(carrier) || isCsharpClosedCompatRuntimeCarrier(carrier)) {
    return true;
  }
  if (carrier.kind === "source-primitive") {
    return tsValueSupportedSourcePrimitives.has(carrier.name);
  }
  return carrier.kind === "target-named" && tsValueSupportedTargetNamedTypes.has(carrier.id);
}

export function csharpCatchExceptionType(): CsharpTypeNode | undefined {
  return csharpTypeFromTargetTypeRef(csharpExceptionTargetType());
}

export function csharpThrownValueFromExpression(expression: CsharpExpression): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(csharpTsThrownValueExceptionTargetType());
  return type === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: type,
          name: "from",
        },
        arguments: [{ kind: "Argument", expression }],
      };
}

export function csharpThrownValueToValueExpression(expression: CsharpExpression): CsharpExpression | undefined {
  const type = csharpTypeFromTargetTypeRef(csharpTsThrownValueExceptionTargetType());
  return type === undefined
    ? undefined
    : {
        kind: "InvocationExpression",
        callee: {
          kind: "SimpleMemberAccessExpression",
          receiver: type,
          name: "toValue",
        },
        arguments: [{ kind: "Argument", expression }],
      };
}
