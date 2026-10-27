import type { Node } from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../../target-model/types/model.js";
import { targetTypeRefKey } from "../../../../target-model/types/equality.js";
import type { CsharpArrayLiteralEmission, CsharpArraySpreadEmission, CsharpBorrowedSequenceEmission, CsharpArrayLiteralRecords } from "../../../../target-model/records/operations/array-literals.js";
import type { CsharpBorrowedSequenceInput } from "../../../../target-model/records/storage/borrowed-sequences.js";
import { failTargetAnalysisInvariant } from "@tsonic/target-api/artifacts";

export function createCsharpArrayLiteralProducer() {
  const literals = new Map<Node, Map<string, CsharpArrayLiteralEmission>>();
  const spreads = new Map<Node, Map<string, CsharpArraySpreadEmission>>();
  const borrowed = new Map<CsharpBorrowedSequenceInput, Map<string, CsharpBorrowedSequenceEmission>>();
  let closed = false;
  const write = <Subject, Value>(table: Map<Subject, Map<string, Value>>, subject: Subject, carrier: TargetTypeRef, value: Value): void => {
    if (closed) failTargetAnalysisInvariant("tsonic-csharp", "Array emission records cannot change after sealing.");
    const key = targetTypeRefKey(carrier);
    const values = table.get(subject) ?? new Map<string, Value>();
    if (values.has(key)) failTargetAnalysisInvariant("tsonic-csharp", "An array emission request has one exact source producer.");
    values.set(key, Object.freeze(value)); table.set(subject, values);
  };
  const records: CsharpArrayLiteralRecords = Object.freeze({
    arrayLiteral: Object.freeze({ get: (node: Node, carrier: TargetTypeRef) => literals.get(node)?.get(targetTypeRefKey(carrier)) }),
    arraySpread: Object.freeze({ get: (node: Node, carrier: TargetTypeRef) => spreads.get(node)?.get(targetTypeRefKey(carrier)) }),
    borrowedSequenceEmission: Object.freeze({ get: (input: CsharpBorrowedSequenceInput, target: TargetTypeRef) => borrowed.get(input)?.get(targetTypeRefKey(target)) }),
  });
  return Object.freeze({ records,
    literal: (node: Node, carrier: TargetTypeRef, value: CsharpArrayLiteralEmission) => write(literals, node, carrier, value),
    spread: (node: Node, target: TargetTypeRef, value: CsharpArraySpreadEmission) => write(spreads, node, target, value),
    borrowed: (input: CsharpBorrowedSequenceInput, target: TargetTypeRef, value: CsharpBorrowedSequenceEmission) => write(borrowed, input, target, value),
    seal(): CsharpArrayLiteralRecords { closed = true; return records; },
  });
}
