// The six void cases (c2529 acceptance, A11, ported to the nextgen facts, C-2542). A `void` arm in a union is
// absence: the Host publishes one optional descriptor for each parameter and return, and C# represents it as the
// established nullable domain: `uint64 | void` -> `ulong?`, `T | void` -> `T?`, `Promise<void> | void` -> `Task?`.
import assert from "node:assert/strict";
import test from "node:test";
import { hostProgram, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { csharpNullableTargetType, getCsharpNullableElementTargetType } from "../../../../dist/target-model/types/carriers/nullable.js";
import { csharpSourcePrimitiveTargetType } from "../../../../dist/target-model/types/carriers/scalar-types.js";
import { targetTypeRefEquals, targetTypeRefKey } from "../../../../dist/target-model/types/equality.js";

const sourceText = [
  'import type { uint64 } from "@tsonic/core/types.js";',
  "declare function wideParameter(value: uint64 | void): void;",
  "declare function genericParameter<Value extends object>(value: Value | void): void;",
  "declare function taskParameter(value: Promise<void> | void): void;",
  "export function wideReturn(value: uint64, take: boolean): uint64 | void { if (take) return value; }",
  "export function genericReturn<Value extends object>(value: Value, take: boolean): Value | void { if (take) return value; }",
  "export function taskReturn(value: Promise<void>, take: boolean): Promise<void> | void { if (take) return value; }",
].join("\n");

test("C2529 / A11: six Source void parameter and return publications are optional and represent as nullable", () => {
  const program = hostProgram(sourceText);
  const represent = representations(representationServices(program));
  const rows = ["wide", "generic", "task"].flatMap(domain => ["Parameter", "Return"].map(position => {
    const declaration = program.named(`${domain}${position}`);
    const occurrence = position === "Parameter" ? program.ast.parameters(declaration)[0] : declaration;
    const descriptor = position === "Parameter" ? program.type(occurrence) : program.callableReturn(declaration);
    const carrier = represented(position === "Parameter" ? represent.value(occurrence) : represent.callableReturn(declaration));
    return { domain, position, descriptor, carrier, occurrence };
  }));
  assert.equal(rows.length, 6, "three domains each cover parameter and return");
  for (const row of rows) {
    assert.equal(row.descriptor.kind, "optional", `${row.domain}${row.position}: the void arm is published as absence (A11)`);
    assert.notEqual(row.descriptor.value.kind, "union", `${row.domain}${row.position}: one present payload, no residual void arm`);
    const payload = represented(represent.type(row.descriptor.value, row.occurrence, "value"));
    assert.equal(targetTypeRefEquals(row.carrier, csharpNullableTargetType(payload)), true,
      `${row.domain}${row.position}: the established nullable domain over the exact payload`);
    assert.notEqual(getCsharpNullableElementTargetType(row.carrier), undefined);
  }
  for (const row of rows.filter(selected => selected.domain === "wide")) {
    assert.equal(targetTypeRefEquals(row.carrier, csharpNullableTargetType(csharpSourcePrimitiveTargetType("uint64"))), true,
      "uint64 | void -> ulong? (the native width survives)");
  }
  for (const row of rows.filter(selected => selected.domain === "generic")) {
    assert.equal(getCsharpNullableElementTargetType(row.carrier).kind, "type-parameter", "Value | void -> Value?");
  }
  for (const row of rows.filter(selected => selected.domain === "task")) {
    assert.match(targetTypeRefKey(getCsharpNullableElementTargetType(row.carrier)), /System\.Threading\.Tasks\.Task/u,
      "Promise<void> | void -> Task?");
  }
  const parameterCarriers = rows.filter(row => row.position === "Parameter").map(row => targetTypeRefKey(row.carrier));
  const returnCarriers = rows.filter(row => row.position === "Return").map(row => targetTypeRefKey(row.carrier));
  assert.deepEqual(parameterCarriers.map((key, index) => key === returnCarriers[index] || rows[index * 2].domain === "generic"),
    [true, true, true], "parameter and return of a concrete domain share one carrier");
});
