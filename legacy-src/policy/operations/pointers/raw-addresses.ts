import type { CsharpRawAddressSelection, CsharpSourceRawAddressOperation } from "../../../target-model/records/raw-addresses.js";
import type { ExtensionFactSubject, Node, ReadonlySourceFactResolver, SourceFile } from "@tsonic/tsts";
import { readTsonicDataLayout, readTsonicRawMemoryOperation } from "@tsonic/source-core/facts";

import type { CsharpPolicyContext } from "../../model/context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpRuntimeRawPointerTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpNullableReferenceTargetType } from "../../../target-model/types/carriers/nullable.js";

export function readCsharpSourceRawAddress(
  facts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceRawAddressOperation | undefined {
  const fact = facts === undefined ? undefined : readTsonicRawMemoryOperation(facts, subject);
  return fact?.operation === "byte-offset" || fact?.operation === "raw-to-address-integer" ||
    fact?.operation === "address-integer-to-raw" ? fact : undefined;
}

export function csharpRawAddressResultType(fact: CsharpSourceRawAddressOperation): TargetTypeRef {
  return fact.operation === "raw-to-address-integer"
    ? csharpSourcePrimitiveTargetType(fact.addressWidth === 32 ? "uint32" : "uint64")
    : csharpNullableReferenceTargetType(csharpRuntimeRawPointerTargetType());
}

export function selectCsharpRawAddress(
  input: CsharpPolicyContext,
  node: Node,
  sourceFile: SourceFile,
): CsharpRawAddressSelection | undefined {
  const fact = readCsharpSourceRawAddress(input.sourceFacts, node);
  if (fact === undefined) return undefined;
  const reject = (reason: string): CsharpRawAddressSelection => ({ kind: "rejected", operation: fact.operation, reason });
  const operands = fact.operation === "byte-offset"
    ? [{ expression: fact.rawExpression, type: fact.rawType }, { expression: fact.offsetExpression, type: fact.offsetType }]
    : fact.operation === "raw-to-address-integer" ? [{ expression: fact.rawExpression, type: fact.rawType }]
      : [{ expression: fact.addressExpression, type: fact.addressType }];
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
    const sourceType = input.types.resolveSelectedValue(operand.expression, operand.type, sourceFile);
    return sourceType === undefined ? undefined : Object.freeze({ expression: operand.expression, sourceType, parameterType });
  });
  if (parameters.some(parameter => parameter === undefined)) return reject("A raw address operand has no closed C# value carrier.");
  return Object.freeze({ kind: "raw-address", width: abi.addressWidth,
    method: fact.operation === "raw-to-address-integer" ? "Address"
      : fact.operation === "address-integer-to-raw" ? "FromAddress"
        : fact.offsetSignedness === "unsigned" ? "OffsetUnsigned" : "Offset",
    resultType: csharpRawAddressResultType(fact), arguments: Object.freeze(parameters.filter(parameter => parameter !== undefined)) });
}
