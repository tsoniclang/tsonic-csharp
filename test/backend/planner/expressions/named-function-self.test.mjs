import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { lexicalSelfBindingSource } from "../../../../../tsonic/test/fixtures/lexical-self-binding.mjs";

for (const surface of ["native", "js"]) {
  test(`named self uses a fixed native method while an arrow retains written storage in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: lexicalSelfBindingSource });
    assertCsharpCompilationSucceeded(compiled);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof source, "string");
    assert.match(source, /static double (__tsonic_self_\d+)\(double count\)[\s\S]*?return count == 0(?:\.0)? \? 1(?:\.0)? : \1\(count - 1(?:\.0)?\);/u);
    assert.match(source, /new Func<double, double>\(__tsonic_self_\d+\)/u);
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
    assert.equal((source.match(/new Func<double, double>/gu) ?? []).length, 1);
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
    const compiled = compileCsharpSource({ surface, sourceText: `
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
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const source = compiled.artifacts.get("src/Index.cs");
    assert.equal(typeof source, "string");
    const retained = source.match(/ObjectShape_capture_\w+ (__tsonic_value\d+) = (__tsonic_captures\d+);/u);
    assert.equal(retained !== null, true, "one alias to the current native owner");
    const method = source.match(/double __tsonic_self_\d+\(double count\)([\s\S]*?)\n\s*__tsonic_self_\d+Value =/u);
    assert.equal(method !== null, true, "fixed native recursive method");
    assert.equal(method[1].includes(`${retained[1]}.value0`), true, "body reads the retained activation");
    assert.equal(method[1].includes(`${retained[2]}.value0`), false, "body never reads the rotating frame local");
    assert.equal((source.match(/new Func<double, double>\(__tsonic_self_\d+\)/gu) ?? []).length, 1);
    assert.match(method[1], /object\.ReferenceEquals\(same, __tsonic_self_\d+Value\)/u);
  });
}
