import type { ExtensionFactSubject, Node, ReadonlySourceFactResolver, SourceFile } from "@tsonic/tsts";
import { readTsonicDataLayout, readTsonicRawMemoryOperation } from "@tsonic/source-core/facts";
import type { TsonicRawMemoryOperationFact } from "@tsonic/source-core/facts";
import type { CsharpPolicyContext } from "../../context.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";
import { csharpRuntimeRawPointerTargetType } from "../../../target-model/types/runtime-carriers.js";
import { csharpNullableReferenceTargetType } from "../../../target-model/types/nullable.js";

export type CsharpSourceRawAddressOperation = Extract<TsonicRawMemoryOperationFact,
  { readonly operation: "byte-offset" | "raw-to-address-integer" | "address-integer-to-raw" }>;

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

export type CsharpRawAddressSelection =
  | { readonly kind: "rejected"; readonly operation: CsharpSourceRawAddressOperation["operation"]; readonly reason: string }
  | { readonly kind: "raw-address"; readonly method: "Address" | "FromAddress" | "Offset" | "OffsetUnsigned";
      readonly width: 32 | 64; readonly resultType: TargetTypeRef;
      readonly arguments: readonly { readonly expression: Node; readonly sourceType: TargetTypeRef;
        readonly parameterType: TargetTypeRef }[] };

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
