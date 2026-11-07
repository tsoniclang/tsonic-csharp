import type { CsharpRawAddressSelection } from "../../../target-model/records/storage/raw-addresses.js";
import type { Node } from "@tsonic/tsts";
import { readTsonicDataLayout } from "@tsonic/source-core/facts";

import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpRuntimeRawPointerTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType } from "../../../target-model/types/carriers/nullable.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

import { readCsharpSourceRawAddress } from "../../../source/extension/raw-addresses.js";
import { csharpRawAddressResultType } from "../../../policy/operations/pointers/raw-addresses.js";
export function selectCsharpRawAddress(
  input: CsharpPolicyContext,
  node: Node,
): CsharpRawAddressSelection | undefined {
  const fact = readCsharpSourceRawAddress(input.sourceFacts, node);
  if (fact === undefined) return undefined;
  const reject = (reason: string): CsharpRawAddressSelection => ({ kind: "rejected", operation: fact.operation, reason });
  const operands = fact.operation === "byte-offset"
    ? [{ expression: fact.rawExpression }, { expression: fact.offsetExpression }]
    : fact.operation === "raw-to-address-integer" ? [{ expression: fact.rawExpression }]
      : [{ expression: fact.addressExpression }];
  const arguments_ = input.ast.arguments(node);
  const abi = input.sourceFacts === undefined ? undefined : readTsonicDataLayout(input.sourceFacts, fact.dataLayoutExpression);
  if (fact.call !== node || arguments_.length !== operands.length + 1 ||
    operands.some((operand, index) => operand.expression !== arguments_[index]) ||
    arguments_[arguments_.length - 1] !== fact.dataLayoutExpression || abi === undefined ||
    fact.operation !== "byte-offset" && fact.addressWidth !== abi.addressWidth) {
    return reject("Raw address arithmetic requires exact operand bindings and the finalized registered address ABI.");
  }
  const raw = csharpNullableReferenceTargetType(csharpRuntimeRawPointerTargetType());
  const parameters = operands.map((operand, index) => {
    const parameterType = fact.operation === "address-integer-to-raw"
      ? csharpSourcePrimitiveTargetType("uint64")
      : index === 0 ? raw : csharpSourcePrimitiveTargetType(
        fact.operation === "byte-offset" && fact.offsetSignedness === "unsigned" ? "uint128" : "int128");
    const sourceType = input.types.value(operand.expression);
    return sourceType.kind === "csharp-refused" ? undefined : Object.freeze({ expression: operand.expression, sourceType, parameterType,
      cast: !targetTypeRefEquals(sourceType, parameterType) });
  });
  if (parameters.some(parameter => parameter === undefined)) return reject("A raw address operand has no closed C# value carrier.");
  return Object.freeze({ kind: "raw-address", width: abi.addressWidth,
    method: fact.operation === "raw-to-address-integer" ? "Address"
      : fact.operation === "address-integer-to-raw" ? "FromAddress"
        : fact.offsetSignedness === "unsigned" ? "OffsetUnsigned" : "Offset",
    resultType: csharpRawAddressResultType(fact), arguments: Object.freeze(parameters.filter(parameter => parameter !== undefined)) });
}
