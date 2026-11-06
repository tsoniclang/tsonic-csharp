import assert from "node:assert/strict";
import test from "node:test";
import { acceptedEffectiveSource, assertArrayOccurrences, assertNativeEffectiveRefusal, assertPrimitiveOccurrences, assertPublishedRefusal, compileEffectiveSource, projectNodes } from "../../helpers/source-effective-types.mjs";

const header = 'import type { int8, int32, int64, uint32, float32 } from "@tsonic/core/types.js";';

for (const surface of ["native", "js"]) {
  for (const [name, body, arrays, values, companionBody] of [
    ["default is int64 on every surface", "const items = [1, 2]; return items[0] === 1;", [["items", "int64"]], []],
    ["one concrete parameter fills aliases backwards and forwards", "const original = [1, 2]; const alias = original; sum(alias); return original[0] === 1;", [["original", "float64"], ["alias", "float64"]], []],
    ["mutable declaration alias shares the same type", "const original = [1, 2]; let alias = original; sum(alias); return original[0] === 1;", [["original", "float64"], ["alias", "float64"]], []],
    ["typed initialization is a concrete use", "const pending = [1, 2]; const selected: number[] = pending; return selected[0] === 1;", [["pending", "float64"]], []],
    ["creation containment links the actual scalar", "const item = 1; const items = [item, 2]; sum(items); return items[0] === 1;", [["items", "float64"]], [["item", "float64"]]],
    ["iteration destructuring rest and spread retain the same element group", "const items = [1, 2]; const [head, ...tail] = items; const copied = [...tail]; sum(copied); return head === 1;", [["items", "float64"], ["tail", "float64"], ["copied", "float64"]], [["head", "float64"]]],
    ["a concrete type assertion fills its original local", "const items = [1, 2]; const selected = items as number[]; return selected[0] === 1;", [["items", "float64"], ["selected", "float64"]], []],
    ["compound declared right side fills the binding", "let total = 0; total += price; return total === price;", [], [["total", "float64"]]],
    ["compound open right side is only a write check", "const items = [1, 2]; let total = 0; for (const item of items) total += item; return total === 3;", [["items", "int64"]], [["total", "int64"], ["item", "int64"]]],
    ["literal updates never fill", "let count = 1; count += 2; count++; count--; return count === 3;", [], [["count", "int64"]]],
    ["element writes retain the original default", "let items = [1, 2]; items[0] = 3; return items[0] === 3;", [["items", "int64"]], []],
    ["plain reassignment requires an explicit int32 array slot", "let items = [1, 2]; items = replacement; return items[0] === replacement[0];", [["items", "int32"]], [], "let items: int32[] = [1, 2]; items = replacement; return items[0] === replacement[0];"],
    ["arithmetic-derived locals are typed bottom up", "const firstValue = 3; const doubled = firstValue * 2; const shifted = doubled + 1; return shifted === 7;", [], [["firstValue", "int64"], ["doubled", "int64"], ["shifted", "int64"]]],
    ["all-literal arithmetic retains the folded integer leaf", "const milliseconds = 60 * 1000; return milliseconds === 60000;", [], [["milliseconds", "int64"]]],
    ["integer division remains integer on both surfaces", "const value = 7; const divided = value / 2; return divided === 3;", [], [["divided", "int64"]]],
    ["fractional literals retain double", "const value = 0.5; return value === 0.5;", [], [["value", "float64"]]],
    ["comparison cannot fill an integer from a double partner", "const value = 1; return value < price;", [], [["value", "int64"]]],
    ["string concatenation does not fill", 'const value = 1; const message = "count=" + value; return message !== "";', [], [["value", "int64"]]],
    ["unknown slots do not fill", "const items = [1, 2]; keep(items); return items[0] === 1;", [["items", "int64"]], []],
    ["explicit generic arguments fill the actual binder", "const items = [1, 2]; const value = first<int32>(items); return value === 1;", [["items", "int32"]], [["value", "int32"]]],
    ["two instances of one generic have independent types", "const integer = identity(1); const fraction = identity(0.5); return integer === 1 && fraction === 0.5;", [], [["integer", "int64"], ["fraction", "float64"]]],
    ["a shift count takes int64 without imposing its type on the left operand", "const left: int32 = 1; const amount = 1; const shifted = left << amount; return shifted === left + left;", [], [["left", "int32"], ["amount", "int64"], ["shifted", "int32"]]],
  ]) {
    const sourceText = `${header}
        function sum(values: number[]): void { void values; }
        function keep(input: unknown): void { void input; }
        function identity<T>(input: T): T { return input; }
        function first<T>(values: T[]): T { return values[0]; }
        export function run(price: number, replacement: int32[], wide: int64): boolean { ${body} }
      `;
    test(`${surface} effective types: ${name}`, () => {
      const compiled = compileEffectiveSource(surface, sourceText);
      if (companionBody !== undefined) {
        assertNativeEffectiveRefusal(compiled, surface === "native"
          ? "No exact C# implicit conversion relates 'array:1:source:int32' to 'array:1:source:int64'. Annotate `let items: int32[] = [1, 2]`."
          : "No exact C# implicit conversion relates 'target:Tsonic.CSharp.Js.JSArray`1<source:int32>' to 'target:Tsonic.CSharp.Js.JSArray`1<source:int64>'. Annotate `let items: int32[] = [1, 2]`.", "replacement");
        return;
      }
      acceptedEffectiveSource(compiled);
      for (const [binding, primitive] of arrays) assertArrayOccurrences(compiled, binding, primitive);
      for (const [binding, primitive] of values) assertPrimitiveOccurrences(compiled, binding, primitive);
    });
    if (companionBody !== undefined) test(`${surface} effective types: ${name} (annotated companion)`, () => {
      const compiled = compileEffectiveSource(surface, sourceText.replace(body, companionBody));
      const text = acceptedEffectiveSource(compiled);
      for (const [binding, primitive] of arrays) assertArrayOccurrences(compiled, binding, primitive);
      for (const [binding, primitive] of values) assertPrimitiveOccurrences(compiled, binding, primitive);
      assert.match(text, surface === "native" ? /\bint\[\] items\b/u : /\bJSArray<int> items\b/u);
    });
  }

  test(`${surface} a declared int32 shift count preserves an independent Native int64 left operand`, () => {
    const compiled = compileEffectiveSource(surface, `${header}
      export function run(): boolean {
        for (let wide = 1; wide < 2; wide++) {
          const amount: int32 = 1;
          const shifted = wide << amount;
          return shifted === wide + wide;
        }
        return false;
      }
    `);
    acceptedEffectiveSource(compiled);
    assertPrimitiveOccurrences(compiled, "wide", "int64", 3);
    assertPrimitiveOccurrences(compiled, "amount", "int32");
    assertPrimitiveOccurrences(compiled, "shifted", "int64");
  });

  for (const [name, code, sourceText, site] of [
    ["widening is a conflict at the later concrete use", "TSONIC_LOCAL_TYPE_CONFLICT", `${header}
      function small(value: int32): void { void value; }
      function wide(value: number): void { void value; }
      export function run(): void { const value = 1; small(value); wide(value); }`, "value"],
    ["inferred return fixes declaration typing", "TSONIC_LOCAL_TYPE_SIGNATURE", `${header}
      function sum(values: number[]): void { void values; }
      export function scores() { const values = [1, 2]; sum(values); return values; }`, "values"],
    ["inferred signature closure includes arithmetic dependencies", "TSONIC_LOCAL_TYPE_SIGNATURE", `${header}
      function takeDouble(value: number): void { void value; }
      export function run() { const value = 1; takeDouble(value); return value + 1; }`, "value"],
    ["body-local empty object needs a fill", "TSONIC_UNTYPED_OBJECT_LITERAL", "export function run(): boolean { const value = {}; return value !== undefined; }", "{}"],
    ["body-local empty array needs an element fill", "TSONIC_UNTYPED_ARRAY_LITERAL", "export function run(): boolean { const values = []; values[0] = 1; return values !== undefined; }", "[]"],
    ["mixed fixed elements fail at the literal", "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS", `${header}
      export function run(narrow: float32, signed: int32): void { const values = [narrow, signed]; void values; }`, "[narrow, signed]"],
    ["number-backed and bigint-backed fixed widths remain one numeric kind", "TSONIC_LOCAL_TYPE_MIXED_ELEMENTS", `${header}
      export function run(narrow: int32, wide: int64): void { const values = [narrow, wide]; void values; }`, "[narrow, wide]"],
    ["different concrete object identities conflict at the later use", "TSONIC_LOCAL_TYPE_CONFLICT", `${header}
      class First { value: int32 = 0; }
      class Second { value: int32 = 0; }
      function first(value: First): void { void value; }
      function second(value: Second): void { void value; }
      export function run(): void { const selected = { value: 1 }; first(selected); second(selected); }`, "selected"],
  ]) {
    test(`${surface} effective types refuse: ${name}`, () => {
      assertPublishedRefusal(compileEffectiveSource(surface, sourceText), code, site);
    });
  }

  test(`${surface} small-kind arithmetic feeding a local retains its published int32 result`, () => {
    const compiled = compileEffectiveSource(surface, `${header}
      export function run(left: int8, right: int8): boolean { const combined = left + right; return combined === 0; }`);
    acceptedEffectiveSource(compiled);
    assert.equal(compiled.targetSource.effectiveTypes.refusals().length, 0);
    assertPrimitiveOccurrences(compiled, "left", "int8");
    assertPrimitiveOccurrences(compiled, "right", "int8");
    assertPrimitiveOccurrences(compiled, "combined", "int32");
    const additions = projectNodes(compiled, (node, ast) => ast.is.IsBinaryExpression(node) && ast.operatorKindName(node) === "KindPlusToken");
    assert.equal(additions.length, 1, "the identical authored addition is retained");
    const outcome = compiled.targetSource.effectiveTypes.get(additions[0]);
    const native = compiled.result.program.records.valueRead.get(additions[0])?.value;
    assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "primitive" &&
      outcome.type.primitive === "int32", true, "the exact addition has one published Host int32");
    assert.equal(native?.kind === "source-primitive" && native.name === "int32", true,
      "the same addition's Native physical value represents that int32");
  });

  test(`${surface} a declared return fills the local without changing a signature`, () => {
    const compiled = compileEffectiveSource(surface, "export function run(): number[] { const values = [1, 2]; return values; }");
    acceptedEffectiveSource(compiled);
    assertArrayOccurrences(compiled, "values", "float64");
  });

  test(`${surface} captured compound writes keep the original root's declaration type`, () => {
    const compiled = compileEffectiveSource(surface, `
      export function run() {
        let total = 0;
        function add(): void { total += 1; }
        add();
        return total;
      }
    `);
    acceptedEffectiveSource(compiled);
    assertPrimitiveOccurrences(compiled, "total", "int64", 2);
  });

  test(`${surface} a concrete captured use cannot fill another callable's open group`, () => {
    const compiled = compileEffectiveSource(surface, `
      function takeDouble(value: number): void { void value; }
      export function run(): void {
        let value = 0;
        function fill(): void { takeDouble(value); }
        fill();
      }
    `);
    assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_SELF_REFERENCE", "takeDouble(value)");
  });

  test(`${surface} module defaults cannot narrow implicitly into a declared return`, () => {
    const compiled = compileEffectiveSource(surface, `${header}
      const moduleValue = 1;
      export function run(): int32 { return moduleValue; }
    `);
    assertNativeEffectiveRefusal(compiled, "No exact C# implicit conversion relates 'source:int64' to 'source:int32'. Annotate `const moduleValue: int32 = 1`.", "moduleValue");
  });

  test(`${surface} an annotated module binding retains the declared int32 emission`, () => {
    const compiled = compileEffectiveSource(surface, `${header}
      const moduleValue: int32 = 1;
      export function run(): int32 { return moduleValue; }
    `);
    const text = acceptedEffectiveSource(compiled);
    assertPrimitiveOccurrences(compiled, "moduleValue", "int32");
    assert.match(text, /\bint moduleValue\b/u);
  });

  for (const operator of ["?:", "??", "||", "&&"]) {
    test(`${surface} initializer ${operator} links both read arms without changing a selected call`, () => {
      const expression = operator === "?:" ? "flag ? left : right" : `left ${operator} right`;
      const sourceText = `${header}
        function sum(values: number[]): void { void values; }
        export function run(flag: boolean): boolean {
          const left = [1]; const right = [2]; const selected = ${expression};
          sum(selected); return left[0] === 1 && right[0] === 2;
        }
      `;
      let compiled = compileEffectiveSource(surface, sourceText);
      if (operator === "||" || operator === "&&") {
        assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_UNSUPPORTED", expression);
        assert.equal(compiled.result.diagnostics[0].message, "A logical operator requires exact bool operands.");
        compiled = compileEffectiveSource(surface, sourceText.replace(expression, "flag ? left : right"));
      }
      acceptedEffectiveSource(compiled);
      for (const name of ["left", "right", "selected"]) assertArrayOccurrences(compiled, name, "float64");
    });
  }

  test(`${surface} a data object's member fill leaves its other member at the default`, () => {
    const compiled = compileEffectiveSource(surface, `${header}
      function takeNumber(value: number): void { void value; }
      export function run(): boolean { const selected = { chosen: 1, unchanged: 2 }; takeNumber(selected.chosen); return selected.unchanged === 2; }
    `);
    acceptedEffectiveSource(compiled);
    const occurrences = projectNodes(compiled, (node, ast) => ast.is.IsIdentifier(node) && ast.text(node) === "selected");
    const shapes = occurrences.map(node => compiled.targetSource.effectiveTypes.get(node)).filter(outcome => outcome !== undefined);
    assert.equal(shapes.length >= 2, true, "the declaration and its actual member-use receiver have published types");
    for (const shape of shapes) {
      assert.equal(shape.kind !== "refused" && shape.type.kind === "shape", true, "the unfilled outer value retains its own shape");
      const chosen = shape.type.members.find(member => member.name === "chosen");
      const unchanged = shape.type.members.find(member => member.name === "unchanged");
      assert.equal(chosen?.type.primitive === "float64" && unchanged?.type.primitive === "int64", true,
        "a member-level demand does not retype independent members");
    }
  });

  test(`${surface} a readonly parameter checks but never fills the mutable array's width`, () => {
    const compiled = compileEffectiveSource(surface, `${header}
      function observe(values: readonly int32[]): void { void values; }
      export function run(): boolean { const selected = [1, 2]; observe(selected); return selected[0] === 1; }
    `);
    assertNativeEffectiveRefusal(compiled, surface === "native"
      ? "No exact C# implicit conversion relates 'array:1:source:int64' to 'array:1:source:int32'. Annotate `const selected: int32[] = [1, 2]`."
      : "No exact C# implicit conversion relates 'source:int64' to 'source:int32'. Annotate `const selected: int32[] = [1, 2]`.", "selected");
    const checks = compiled.targetSource.effectiveTypes.obligations().filter(obligation => obligation.kind === "read-only");
    assert.equal(checks.length, 1, "the actual readonly parameter produces an obligation rather than a fill");
  });

  test(`${surface} an annotated mutable array supplies the readonly parameter's int32 width`, () => {
    const compiled = compileEffectiveSource(surface, `${header}
      function observe(values: readonly int32[]): void { void values; }
      export function run(): boolean { const selected: int32[] = [1, 2]; observe(selected); return selected[0] === 1; }
    `);
    const text = acceptedEffectiveSource(compiled);
    assertArrayOccurrences(compiled, "selected", "int32");
    assert.match(text, surface === "native" ? /\bint\[\] selected\b/u : /\bJSArray<int> selected\b/u);
  });

  test(`${surface} typed object uses fill nested members without rebuilding aliases`, () => {
    const compiled = compileEffectiveSource(surface, `${header}
      class Inner { value: int32 = 0; }
      class Outer { count: number = 0; child: Inner = new Inner(); }
      function retain(value: Outer): Outer { return value; }
      export function run(): boolean {
        const original = { count: 1, child: { value: 20 } };
        const alias = original;
        const selected = retain(alias);
        return selected === alias && selected.child.value === 20;
      }
    `);
    const text = acceptedEffectiveSource(compiled);
    assert.equal((text.match(/new (?:Tsonic\.Generated\.)?Outer\b/gu) ?? []).length, 1, "the original outer allocation is selected once");
    assert.doesNotMatch(text, /DynamicInvoke|Activator|\.Clone\(|\.ToArray\(/u);
  });

  test(`${surface} loop counters publish the actual B8 provenance for checked native index conversion`, () => {
    const compiled = compileEffectiveSource(surface, `${header}
      export function run(values: int32[]): int32 {
        let sum: int32 = 0;
        for (let index = 0; index < ${surface === "js" ? "values.length" : "values.Length"}; index++) sum += values[index];
        return sum;
      }
    `);
    const text = acceptedEffectiveSource(compiled);
    assert.match(text, /long index = 0(?:L)?/u);
    if (surface === "native") {
      assert.match(text, /values\[index\]/u);
      assert.doesNotMatch(text, /checked\(\(int\)index\)/u,
        "Native T[] accepts long indices and is not an int32-only slot");
    }
    else {
      const accesses = projectNodes(compiled, (node, ast) => ast.is.IsElementAccessExpression(node));
      assert.equal(accesses.length, 1, "one original JSArray index operation is retained");
      const selected = compiled.result.program.records.selectedElement.get(accesses[0])?.target;
      assert.equal(selected?.kind === "resolved" && selected.targetMember.parameters[selected.targetParameterIndex]?.type.name === "int32", true,
        "the native JSArray index slot retains the accepted exact int32 runtime ABI");
      assert.match(text, /checked\(\(int\)index\)/u,
        "the published int64 counter reaches the native int32 slot through the existing checked index conversion");
    }
    const nodes = projectNodes(compiled, (node, ast) => ast.is.IsIdentifier(node) && ast.text(node) === "index");
    let published = 0;
    let owner;
    for (const node of nodes) {
      const outcome = compiled.targetSource.effectiveTypes.get(node);
      if (outcome === undefined) continue;
      assert.equal(outcome.kind !== "refused" && outcome.type.kind === "primitive" && outcome.type.primitive === "int64", true,
        "every actual counter occurrence has the Host int64 rule");
      const rule = outcome.provenance.fixedRule;
      assert.equal(rule?.kind === "loop-counter", true, "the checked-index authority is the real published B8 receipt");
      if (owner === undefined) owner = rule.declaration;
      assert.equal(rule.declaration === owner, true, "counter reads retain one original declaration rather than another loop matcher");
      published += 1;
    }
    assert.equal(published >= 3, true, "condition update and index occurrences have actual counter provenance");
  });

  for (const argumentWidth of ["int32", "int64"]) {
    test(`${surface} receiver-binder writes retain the original Box and its projected ${argumentWidth} metadata`, () => {
      const compiled = compileEffectiveSource(surface, `${header}
        class Box<T> { value: T; constructor(value: T) { this.value = value; } }
        class Receiver<T> { accept(value: Box<T>): void { void value; } }
        export function run(): boolean {
          const receiver = new Receiver<int32>();
          ${argumentWidth === "int64" ? `
            for (let wideValue = 7; wideValue < 8; wideValue++) {
              const original = new Box(wideValue);
              receiver.accept(original);
              return original.value === 7;
            }
            return false;
          ` : `
            const original = new Box<int32>(7 as int32);
            receiver.accept(original);
            return original.value === 7;
          `}
        }
      `);
      if (argumentWidth === "int32") acceptedEffectiveSource(compiled);
      else assertNativeEffectiveRefusal(compiled, "No exact C# implicit conversion relates 'source:int64' to 'source:int32'.", "original");
      const ast = compiled.targetSource.ast;
      const writes = compiled.targetSource.effectiveTypes.obligations().filter(obligation => {
        const call = obligation.association?.call?.call;
        const callee = call === undefined ? undefined : ast.as.AsCallExpression(call)?.Expression;
        return obligation.kind === "write-fit" && callee !== undefined && ast.is.IsPropertyAccessExpression(callee) && ast.text(ast.name(callee)) === "accept";
      });
      assert.equal(writes.length, 1, "the receiver-only binder parameter produces one actual write check, never a generic join");
      const write = writes[0];
      assert.equal(write.valueVariable?.node === write.value && ast.is.IsIdentifier(write.value) && ast.text(write.value) === "original", true,
        "the full Box value remains the original RHS rather than being retyped as its projected numeric argument");
      assert.equal(write.valueType?.kind === "primitive" && write.valueType.primitive === argumentWidth, true,
        "the projected descriptor carries the actual selected Native width");
      assert.equal(write.valueVariable.path.some(part => part.kind === "binder" && ast.is.IsTypeParameterDeclaration(part.declaration)), true,
        "the Source metadata retains the actual Box binder declaration without a runtime property path or filtering");
      assert.equal(write.association.binding === write.association.call.sourceArgumentBindings[0] &&
        write.association.parameter === write.association.call.sourceSelectedSignatureParameters[0], true,
        "the original checked binding and selected parameter associations are consumed unchanged");
    });
  }
}

for (const [name, code, sourceText, site] of [
  ["open find result", "TSONIC_LOCAL_TYPE_UNION", "export function run(): void { const values = [1, 2]; const found = values.find(value => value > 1); void found; }", "values.find(value => value > 1)"],
  ["changed accumulator result", "TSONIC_LOCAL_TYPE_ACCUMULATOR", "export function run(): void { const values = [1, 2]; const total = values.reduce((sum, value) => sum + 0.5, 0); void total; }", "sum + 0.5"],
  ["insertion cannot fill an empty receiver", "TSONIC_UNTYPED_ARRAY_LITERAL", "export function run(): void { const values = []; values.push(1); }", "[]"],
  ["lookup cannot fill an empty receiver", "TSONIC_UNTYPED_ARRAY_LITERAL", "export function run(): void { const values = []; values[0] = 1; values.includes(1); }", "[]"],
]) {
  test(`js effective types refuse: ${name}`, () => {
    assertPublishedRefusal(compileEffectiveSource("js", `${header}\n${sourceText}`), code, site);
  });
}

test("js effective types: callback index and declared double retain the admitted float64 calculation", () => {
  const compiled = compileEffectiveSource("js", `${header}\nexport function run(offset: number): void { const values = [1, 2]; const result = values.map((value, index) => index + offset); void result; }`);
  acceptedEffectiveSource(compiled);
  assert.equal(compiled.targetSource.effectiveTypes.refusals().length, 0);
  assertPrimitiveOccurrences(compiled, "index", "int32", 2);
  assertPrimitiveOccurrences(compiled, "offset", "float64", 2);
  assertArrayOccurrences(compiled, "result", "float64");
  const additions = projectNodes(compiled, (node, ast) => ast.is.IsBinaryExpression(node) && ast.operatorKindName(node) === "KindPlusToken");
  assert.equal(additions.length, 1);
  const addition = additions[0];
  const outcome = compiled.targetSource.effectiveTypes.get(addition);
  const native = compiled.result.program.records.valueRead.get(addition)?.value;
  assert.equal(outcome !== undefined && outcome.kind !== "refused" && outcome.type.kind === "primitive" &&
    outcome.type.primitive === "float64" && native?.kind === "source-primitive" && native.name === "float64", true,
    "the original fixed int32 ordinal plus fixed float64 offset has one admitted Host and Native float64 result");
});

test("js filter links its receiver while map arithmetic never takes a demand backwards", () => {
  const compiled = compileEffectiveSource("js", `${header}
    function sum(values: number[]): void { void values; }
    export function run(): boolean {
      const values = [1, 2];
      const filtered = values.filter(value => value > 1);
      sum(filtered);
      return filtered[0] === 2;
    }
  `);
  acceptedEffectiveSource(compiled);
  assertArrayOccurrences(compiled, "values", "float64");
  assertArrayOccurrences(compiled, "filtered", "float64");
  assertPrimitiveOccurrences(compiled, "value", "float64");
});

test("js map arithmetic refuses a different concrete result use rather than retyping its inputs", () => {
  const compiled = compileEffectiveSource("js", `${header}
    function sum(values: number[]): void { void values; }
    export function run(): void {
      const values = [1, 2];
      const mapped = values.map(value => value * 2);
      sum(mapped);
    }
  `);
  assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_CONFLICT", "mapped");
});

test("js unannotated receiver refuses a mismatched int32 accumulator without retyping its elements", () => {
  const compiled = compileEffectiveSource("js", `${header}
    export function run(): int32 {
      const values = [1, 2];
      const total = values.reduce((sum, value) => sum + value, 0);
      return total;
    }
  `);
  assertPublishedRefusal(compiled, "TSONIC_LOCAL_TYPE_ACCUMULATOR", "sum + value");
  assert.equal(compiled.result.diagnostics[0].message,
    "The accumulator's callback result differs from its non-cyclic source type. Write a matching seed such as '0.0' or annotate the accumulator.");
});

test("js annotated receiver keeps the original matching int32 accumulator and declared result", () => {
  const compiled = compileEffectiveSource("js", `${header}
    export function run(): int32 {
      const values: int32[] = [1, 2];
      const total = values.reduce((sum, value) => sum + value, 0);
      return total;
    }
  `);
  acceptedEffectiveSource(compiled);
  for (const name of ["sum", "value", "total"]) assertPrimitiveOccurrences(compiled, name, "int32");
  assertArrayOccurrences(compiled, "values", "int32");
  assert.match(compiled.artifacts.get("src/Index.cs"), /\bint run\(\)/u);
});

test("js receiver-only argument places publish write checks without linking or filling", () => {
  const compiled = compileEffectiveSource("js", `${header}
    export function run(): boolean {
      const values = [1, 2];
      values.push(3);
      const present = values.includes(3);
      const at = values.indexOf(3);
      return present && at === 2;
    }
  `);
  acceptedEffectiveSource(compiled);
  assertArrayOccurrences(compiled, "values", "int64");
  const checks = compiled.targetSource.effectiveTypes.obligations().filter(row => row.kind === "write-fit");
  assert.equal(checks.length, 3, "insertion includes and indexOf are classified by their receiver binder, not member-name filling");
  for (const check of checks) {
    assert.equal(check.association?.call !== undefined && check.association.binding !== undefined && check.association.parameter !== undefined, true,
      "each chosen write keeps the original call binding and selected parameter association");
  }
});

test("js Map tuple inference keeps distinct key and value declaration binders", () => {
  const compiled = compileEffectiveSource("js", `${header}
    export function run(): boolean {
      const selected = new Map([[1, "a"]]);
      return selected.get(1) === "a";
    }
  `);
  const text = acceptedEffectiveSource(compiled);
  const occurrences = projectNodes(compiled, (node, ast) => ast.is.IsIdentifier(node) && ast.text(node) === "selected");
  const outcomes = occurrences.map(node => compiled.targetSource.effectiveTypes.get(node)).filter(outcome => outcome !== undefined);
  assert.equal(outcomes.length >= 2, true, "the same constructed map and its real receiver read are published");
  for (const outcome of outcomes) {
    assert.equal(outcome.kind !== "refused" && outcome.type.kind === "declared", true);
    assert.equal(outcome.type.typeArguments.length === 2 && outcome.type.typeArguments[0].primitive === "int64" &&
      outcome.type.typeArguments[1].kind === "string", true, "the tuple's key and value retain their own binder positions");
  }
  assert.match(text, /Map<long, string>/u);
});
