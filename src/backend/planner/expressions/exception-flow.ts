import {
  type Node,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { CsharpPlanningContext } from "../context.js";
import type { CsharpExpression, CsharpTypeNode } from "../../target-ast/roslyn/index.js";
import {
  csharpExceptionTargetType,
  csharpTsThrownValueExceptionTargetType,
  isCsharpClosedJsRuntimeCarrier,
} from "../../../target-model/types/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";

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
  "Tsonic.CSharp.Runtime.Error",
  "Tsonic.CSharp.Runtime.TypeError",
  "Tsonic.CSharp.Runtime.RangeError",
  "Tsonic.CSharp.Runtime.TsValue",
  "Tsonic.CSharp.Runtime.TsObject",
  "Tsonic.CSharp.Runtime.TsArray",
  "Tsonic.CSharp.Runtime.TsFunction",
]);

export function isCsharpJsThrowableValueCarrier(carrier: TargetTypeRef | undefined): boolean {
  if (carrier === undefined) {
    return false;
  }
  if (isCsharpClosedJsRuntimeCarrier(carrier)) {
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

export function isExactUnmodifiedCatchRethrow(
  throwStatement: Node,
  _expression: Node,
  input: CsharpPlanningContext,
): boolean {
  return input.program.operations.exactCatchRethrow(throwStatement);
}
