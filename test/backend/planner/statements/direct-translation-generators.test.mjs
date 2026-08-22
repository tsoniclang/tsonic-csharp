import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

function compileGenerator(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled.artifacts.get("src/Index.cs") ?? "";
}

test("synchronous generators lower through native C# iterators without Task machinery", () => {
  const source = compileGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    export function* ids(): Generator<int, string, unknown> {
      yield 1;
      yield 2;
      return "complete";
    }
  `);

  assert.match(source, /Tsonic\.CSharp\.Runtime\.Generator<int, string,/);
  assert.match(source, /System\.Collections\.Generic\.IEnumerable</);
  assert.match(source, /yield return/);
  assert.match(source, /string __tsonic_generatorReturn0 = default\(string\)!;/);
  assert.match(source, /__tsonic_generatorReturn0 = "complete";\s+goto __tsonic_generatorExit0;/);
  assert.match(source, /__tsonic_generatorExit0:\s+__tsonic_generator0\.Complete\(__tsonic_generatorReturn0\);/);
  assert.equal((source.match(/\.Complete\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /(?:Task|ValueTask)</);
});

test("synchronous generator yield expressions receive exact next values", () => {
  const source = compileGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    export function* counter(): Generator<int, string, int> {
      const increment: int = yield 0;
      yield increment + 1;
      return "complete";
    }
  `);

  assert.match(source, /ConsumeNext\(\)/);
  assert.match(source, /yield return increment \+ 1;/);
  assert.doesNotMatch(source, /default\(int\).*NextValue|Task/);
});

test("synchronous generator protocol exposes next return throw and discriminated completion", () => {
  const source = compileGenerator(`
    import { Exception } from "@tsonic/dotnet/System.js";
    import type { int } from "@tsonic/csharp/types.js";
    export function* counter(): Generator<int, string, int> {
      const increment: int = yield 1;
      yield increment;
      return "done";
    }
    export function useGenerator(): string {
      const generator = counter();
      const first = generator.next();
      const second = generator.next(7);
      const completed = generator.return("stopped");
      const thrown = counter();
      thrown.next();
      try { thrown.throw(new Exception("stop")); } catch {}
      return first.done === false && second.value === 7 && completed.done === true
        ? completed.value as string
        : "invalid";
    }
  `);

  assert.match(source, /\.Next\(/);
  assert.match(source, /\.Return\(/);
  assert.match(source, /\.Throw\(/);
  assert.match(source, /IteratorResult<int, string>/);
});

test("synchronous generators preserve lazy execution and locals across suspensions", () => {
  const source = compileGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    let starts: int = 0;
    export function* values(seed: int): Generator<int, int, int> {
      starts += 1;
      let current: int = seed;
      while (current < 5) {
        current += yield current;
      }
      return current;
    }
    export function startCount(): int {
      const generator = values(1);
      return starts;
    }
  `);

  assert.match(source, /Generator<int, int, int>/);
  assert.match(source, /yield return/);
  assert.doesNotMatch(source, /values\(int seed\)[\s\S]*starts \+= 1;[\s\S]*return new Tsonic\.CSharp\.Runtime\.Generator/s);
});

test("synchronous generator return and throw commands unwind non-yielding finally blocks", () => {
  const source = compileGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    let closed = false;
    export function* guarded(): Generator<int, string, int> {
      try {
        const next: int = yield 1;
        yield next;
        return "normal";
      } finally {
        closed = true;
      }
    }
  `);

  assert.match(source, /try/);
  assert.match(source, /finally/);
  assert.match(source, /closed = true/);
  assert.match(source, /yield return/);
  assert.match(source, /__tsonic_generatorReturn0 = "normal";\s+goto __tsonic_generatorExit0;/);
  assert.match(source, /finally[\s\S]*closed = true;[\s\S]*__tsonic_generatorExit0:/);
});

test("synchronous generator branches converge on one native completion tail", () => {
  const source = compileGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    export function* choose(first: boolean): Generator<int, string, unknown> {
      yield 1;
      if (first) {
        return "first";
      }
      return "second";
    }
  `);

  assert.equal((source.match(/goto __tsonic_generatorExit0;/g) ?? []).length, 2);
  assert.equal((source.match(/\.Complete\(/g) ?? []).length, 1);
});

test("generator fallthrough ignores nested returns and needs no synthetic label", () => {
  const source = compileGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    export function* values(): Generator<int, void, unknown> {
      const nested = (): int => {
        return 1;
      };
      yield nested();
    }
  `);

  assert.doesNotMatch(source, /__tsonic_generatorExit0/);
  assert.equal((source.match(/\.Complete\(/g) ?? []).length, 1);
});

test("synchronous generators reject return from a finally clause at the native boundary", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import type { int } from "@tsonic/csharp/types.js";
      export function* unsupported(): Generator<int, string, unknown> {
        try {
          yield 1;
        } finally {
          return "done";
        }
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.equal(compiled.targetDiagnostics.length, 1);
  assert.equal(compiled.targetDiagnostics[0]?.code, "CSHARP_UNSUPPORTED_GENERATOR_RETURN_REGION");
});

test("yield star forwards bidirectional commands and delegated return values", () => {
  const source = compileGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    function* inner(): Generator<int, string, int> {
      const sent: int = yield 1;
      yield sent;
      return "inner-complete";
    }
    export function* outer(): Generator<int, string, int> {
      const result: string = yield* inner();
      return result;
    }
  `);

  assert.match(source, /yield return/);
  assert.match(source, /\.Next\(/);
});

test("generic generator declarations preserve all three protocol type parameters", () => {
  const source = compileGenerator(`
    export function* exchange<TYield, TReturn, TNext>(
      initial: TYield,
      completed: TReturn,
    ): Generator<TYield, TReturn, TNext> {
      const next: TNext = yield initial;
      void next;
      return completed;
    }
  `);

  assert.match(source, /Generator<TYield, TReturn, TNext>/);
  assert.match(source, /ConsumeNext\(\)/);
});

test("generator methods and generator function expressions use the same native protocol", () => {
  const source = compileGenerator(`
    import type { int } from "@tsonic/csharp/types.js";
    export class Sequence {
      *values(): Generator<int, string, int> {
        const next: int = yield 1;
        yield next;
        return "method";
      }
    }
    export const expression = function* (): Generator<int, string, int> {
      const next: int = yield 2;
      yield next;
      return "expression";
    };
  `);

  assert.equal((source.match(/Generator<int, string, int>/g) ?? []).length >= 2, true);
  assert.doesNotMatch(source, /Task</);
});

for (const [name, body] of [
  ["yield inside catch", `try { throw new Error("x"); } catch { yield 1; }`],
  ["yield inside finally", `try { return "done"; } finally { yield 1; }`],
  ["yield inside try with catch", `try { yield 1; } catch { return "caught"; }`],
]) {
  test(`synchronous generators reject ${name} at the exact native boundary`, () => {
    const compiled = compileCsharpSource({
      sourceText: `
        import { Exception } from "@tsonic/dotnet/System.js";
        import type { int } from "@tsonic/csharp/types.js";
        export function* unsupported(): Generator<int, string, unknown> {
          ${body.replace('new Error("x")', 'new Exception("x")')}
          return "done";
        }
      `,
    });

    assert.equal(compiled.sourceDiagnosticsText, "");
    assert.equal(compiled.targetDiagnostics.length, 1);
    assert.equal(compiled.targetDiagnostics[0]?.code, "CSHARP_UNSUPPORTED_GENERATOR_SUSPENSION_REGION");
  });
}
