import assert from "node:assert/strict";
import test from "node:test";
import { assertNativeLoopRefusals } from "../../../helpers/native-loop-refusals.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { lexicalSelfBindingSource } from "../../../../../tsonic/test/fixtures/lexical-self-binding.mjs";

for (const surface of ["native", "js"]) {
  test(`named self uses a fixed native method while an arrow retains written storage in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: lexicalSelfBindingSource });
    assertCsharpCompilationSucceeded(compiled);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof source, "string");
    assert.match(source, /static double (__tsonic_self_\d+)\(double count\)[\s\S]*?return count == 0(?:\.0|D)? \? 1(?:\.0|D)? : \1\(count - 1(?:\.0|D)?\);/u);
    assert.match(source, /Func<double, double> selected = __tsonic_self_\d+;/u);
    assert.doesNotMatch(source, /new Func<double, double>\(__tsonic_self_\d+\)/u);
    assert.doesNotMatch(source, /\boriginal\(/u);
  });

  test(`named self value references share one delegate and exact captures in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function create(seed: number): (count: number) => number {
        return function original(count: number): number {
          const before = original;
          if (before !== original) return -1;
          return count === 0 ? seed : original(count - 1);
        };
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof source, "string");
    assert.match(source, /Func<double, double> (__tsonic_self_\d+Value) = default\(Func<double, double>\)!;/u);
    assert.match(source, /Func<double, double> before = __tsonic_self_\d+Value;/u);
    assert.match(source, /object\.ReferenceEquals\(before, __tsonic_self_\d+Value\)/u);
    assert.equal((source.match(/__tsonic_self_\d+Value = __tsonic_self_\d+;/gu) ?? []).length === 1 &&
      !/new Func<double, double>/u.test(source), true, "the same self slot binds its method group once");
    assert.doesNotMatch(source, /__TsonicCapture_/u);
  });

  test(`unused inner names and shadowed declarations are not rebound as self in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function run(): number {
        const original = (): number => 99;
        const selected = function original(count: number): number {
          const nested = (): number => {
            const original = (): number => 41;
            return original();
          };
          return count === 0 ? nested() : original(count - 1);
        };
        const unused = function unreferenced(): number { return 1; };
        return selected(2) + original() + unused();
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof source, "string");
    assert.equal((source.match(/static double __tsonic_self_\d+\(/gu) ?? []).length, 1);
    assert.doesNotMatch(source, /\bunreferenced\(/u);
  });

  test(`self references in native nested closures preserve their lexical owner in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function create(seed: number): (count: number) => number {
        return function original(count: number): number {
          const nested = (): number => original(count - 1);
          return count === 0 ? seed : nested();
        };
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof source, "string");
    assert.match(source, /double __tsonic_self_\d+\(double count\)/u);
    assert.doesNotMatch(source, /static double __tsonic_self_/u);
    assert.doesNotMatch(source, /\boriginal\(/u);
    assert.doesNotMatch(source, /__TsonicCapture_/u);
  });

  test(`named self values retain the current counted-loop frame in ${surface}`, () => {
    const sourceText = `
      export function create(): (count: number) => number {
        let selected = (count: number): number => -1;
        for (let index = 0; index < 3; index++) {
          selected = function original(count: number): number {
            const same = original;
            const identity = (): boolean => same === original;
            if (!identity()) return -1;
            return count === 0 ? index : original(count - 1);
          };
          index += 1;
        }
        return selected;
      }
    `;
    const refused = compileCsharpSource({ surface, sourceText });
    assertNativeLoopRefusals(refused, [{ message: "the loop variable is captured by a closure and also written in the loop; use a separate variable.", text: "index += 1", occurrence: 0 }]);
    const compiled = compileCsharpSource({ surface, sourceText: sourceText.replace("          index += 1;\n", "") });
    assertCsharpCompilationSucceeded(compiled);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof source, "string");
    executeCsharpConstruction(compiled, `native-loop-self-${surface}`, false, false, [], `
var selected = Tsonic.Generated.Index.create();
if (selected(0) != 2 || selected(1) != 2 || selected(4) != 2) throw new System.Exception("native loop self activation, mutation and recursion");
`);
    const retained = source.match(/double (__tsonic_value\d+) = index;/u);
    assert.equal(retained !== null, true, "one native per-iteration captured local");
    const method = source.match(/^(?<indent>[ \t]*)double __tsonic_self_\d+\(double count\)\s*\{(?<body>[\s\S]*?)^\k<indent>\}/mu);
    assert.equal(method !== null, true, "fixed native recursive method");
    assert.equal(method.groups.body.includes(retained[1]), true, "body reads its native per-iteration activation");
    assert.doesNotMatch(method.groups.body, /\bindex\b/u, "body never captures the header control variable");
    assert.equal((source.match(/__tsonic_self_\d+Value = __tsonic_self_\d+;/gu) ?? []).length === 1 && !/new Func<double, double>\(__tsonic_self_\d+\)/u.test(source), true);
    assert.match(method.groups.body, /object\.ReferenceEquals\(same, __tsonic_self_\d+Value\)/u);
  });
}
