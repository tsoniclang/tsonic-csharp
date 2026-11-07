import assert from "node:assert/strict";
import test from "node:test";
import { acceptedEffectiveSource, assertArrayOccurrences, assertPrimitiveOccurrences, compileEffectiveSource, projectNodes } from "../../helpers/source-effective-types.mjs";

const widths = Object.freeze([
  { source: "int32", target: "int" },
  { source: "int64", target: "long" },
  { source: "float32", target: "float" },
]);

for (const width of widths) {
  const zero = width.source === "int64" ? "0n" : "0";
  for (const surface of ["native", "js"]) {
    test(`${surface} declared ${width.source} survives first and inline generic arguments`, () => {
      const compiled = compileEffectiveSource(surface, `
        import type { ${width.source} } from "@tsonic/core/types.js";
        function first<T>(values: T[]): T { return values[0]; }
        function apply<T>(value: T, use: (item: T) => T): T { return use(value); }
        export function run(input: ${width.source}[]): ${width.source} {
          const selected = first(input);
          return apply(selected, item => item);
        }
      `);
      const text = acceptedEffectiveSource(compiled);
      assert.match(text, new RegExp(`first<${width.target}>`, "u"));
      assert.match(text, new RegExp(`apply<${width.target}>`, "u"));
      assertArrayOccurrences(compiled, "input", width.source);
      assertPrimitiveOccurrences(compiled, "selected", width.source);
      assertPrimitiveOccurrences(compiled, "item", width.source);
    });
  }

  test(`js declared ${width.source} survives map filter forEach and reduce without changing the receiver binder`, () => {
    const compiled = compileEffectiveSource("js", `
      import type { ${width.source} } from "@tsonic/core/types.js";
      export function run(input: ${width.source}[]): ${width.source} {
        const mapped = input.map(value => value);
        const filtered = mapped.filter(value => value > 0);
        let observed: ${width.source} = ${zero};
        filtered.forEach(value => { observed += value; });
        const reduced = filtered.reduce((accumulator, value) => accumulator + value, ${zero} as ${width.source});
        return reduced + observed;
      }
    `);
    const text = acceptedEffectiveSource(compiled);
    assert.match(text, new RegExp(`JSArray<${width.target}>`, "u"));
    for (const name of ["input", "mapped", "filtered"]) assertArrayOccurrences(compiled, name, width.source);
    for (const name of ["value", "accumulator", "reduced", "observed"]) assertPrimitiveOccurrences(compiled, name, width.source);
    const calls = projectNodes(compiled, (node, ast) => ast.is.IsCallExpression(node));
    const generic = calls.map(node => compiled.targetSource.facts.instantiations.at(node)).filter(value => value !== undefined);
    assert.equal(generic.length >= 4, true, "the actual selected generic calls publish their instantiations");
    for (const call of generic) {
      const identities = [...call.receiver, ...call.method].map(row => row.declaration);
      assert.equal(new Set(identities).size, identities.length, "receiver and method binders retain distinct declared identities");
    }
  });
}

for (const surface of ["native", "js"]) {
  test(`${surface} a declared receiver fills the linked zip argument at the original call`, () => {
    const compiled = compileEffectiveSource(surface, `
      import type { int32 } from "@tsonic/core/types.js";
      function zip<T>(left: T[], right: T[]): T[] { void left; return right; }
      export function run(input: int32[]): int32 {
        const pending = [1, 2];
        const joined = zip(input, pending);
        return joined[0];
      }
    `);
    acceptedEffectiveSource(compiled);
    for (const name of ["input", "pending", "joined"]) assertArrayOccurrences(compiled, name, "int32");
  });
}

test("js declared find retains one absence and publishes its exact narrowed read", () => {
  const compiled = compileEffectiveSource("js", `
    import type { int32 } from "@tsonic/core/types.js";
    export function run(input: int32[]): int32 {
      const found = input.find(value => value > 0);
      if (found === undefined) return 0;
      return found;
    }
  `);
  const text = acceptedEffectiveSource(compiled);
  assert.match(text, /int\? found/u);
  const occurrences = projectNodes(compiled, (node, ast) => ast.is.IsIdentifier(node) && ast.text(node) === "found");
  const outcomes = occurrences.map(node => compiled.targetSource.facts.values.type(node)).filter(value => value !== undefined);
  assert.equal(outcomes.some(value => value.kind !== "refused" && value.type.kind === "optional" &&
    value.type.value.kind === "primitive" && value.type.value.primitive === "int32"), true, "declared find result retains optional(int32)");
  assert.equal(outcomes.some(value => value.kind !== "refused" && value.type.kind === "primitive" && value.type.primitive === "int32"), true,
    "the actual return read excludes the one absence without a width change");
});

test("js map index comes from its int32 source declaration rather than a profile implementation", () => {
  const compiled = compileEffectiveSource("js", `
    import type { int32 } from "@tsonic/core/types.js";
    export function run(): int32 {
      const values = [1, 2];
      const indices = values.map((value, index) => index);
      return indices[0];
    }
  `);
  acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "index", "int32");
  assertArrayOccurrences(compiled, "indices", "int32");
});

test("js seeded reduce keeps the receiver T separate from the accumulator U", () => {
  const compiled = compileEffectiveSource("js", `
    import type { int32, int64 } from "@tsonic/core/types.js";
    export function run(input: int32[]): int64 {
      return input.reduce((accumulator, value) => { void value; return accumulator; }, 0n as int64);
    }
  `);
  acceptedEffectiveSource(compiled);
  assertPrimitiveOccurrences(compiled, "value", "int32");
  assertPrimitiveOccurrences(compiled, "accumulator", "int64");
});
