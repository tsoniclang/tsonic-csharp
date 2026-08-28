import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCsharpCompilationSucceeded,
  checkCsharpSource,
  compileCsharpSource,
} from "../../helpers/direct-csharp-session.mjs";

test("the JavaScript surface closes identity, binary, collection, Date, and object APIs", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      class Owner {
        value = 1;
      }

      export function identityAndBinary(): number {
        const fresh = Symbol("state");
        const registered = Symbol.for("state");
        const owner = new Owner();
        const weakMap = new WeakMap<Owner, symbol>();
        const weakSet = new WeakSet<Owner>();
        weakMap.set(owner, fresh);
        weakSet.add(owner);

        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        view.setUint32(0, 0x01020304, false);
        const words = new Uint32Array(buffer);
        const bytes = new Uint8Array(buffer);

        return (weakMap.get(owner) === fresh ? 1 : 0) +
          (weakSet.has(owner) ? 1 : 0) +
          (Symbol.keyFor(registered) === "state" ? 1 : 0) +
          view.getUint32(0, false) + words.length + bytes[0];
      }

      export function collectionsAndDate(): string {
        const left = new Set<number>([1, 2]);
        const right = new Set<number>([2, 3]);
        const union = left.union(right);
        const intersection = left.intersection(right);
        let seen = 0;
        const map = new Map<string, number>([["one", 1]]);
        map.forEach((value, key, selected) => {
          if (selected === map && key === "one") seen += value;
        });
        union.forEach((value, key, selected) => {
          if (selected === union && key === value) seen += value;
        });

        const date = new Date(Date.UTC(2023, 0, 31, 12, 30));
        date.setUTCMonth(1);
        date.setUTCHours(24, 5);
        const assigned = Object.assign({ count: seen }, { label: date.toUTCString() });
        const invalidJson = new Date(Number.NaN).toJSON() ?? "invalid";
        return assigned.label + invalidJson + intersection.size + left.isSubsetOf(union) +
          union.isSupersetOf(left) + left.isDisjointFrom(new Set<number>([9]));
      }
    `,
  });

  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /Tsonic\.CSharp\.Js\.Symbol/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.WeakMap/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.WeakSet/u);
  assert.match(source, /new Tsonic\.CSharp\.Js\.ArrayBuffer/u);
  assert.match(source, /new Tsonic\.CSharp\.Js\.DataView/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.Uint32Array/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.Set/u);
  assert.match(source, /Tsonic\.CSharp\.Js\.Date/u);
  assert.match(source, /Object\.assign/u);
});

test("JavaScript capability globals remain absent from the native C# source profile", () => {
  const checked = checkCsharpSource({
    sourceText: `
      export const symbol = Symbol("state");
      export const weak = new WeakMap<object, number>();
      export const buffer = new ArrayBuffer(8);
      export const formatter = new Intl.NumberFormat("en-US");
      export const timer = setTimeout(() => {}, 0);
    `,
  });

  assert.match(checked.sourceDiagnosticsText, /Cannot find name 'WeakMap'/u);
  assert.match(checked.sourceDiagnosticsText, /Cannot find name 'ArrayBuffer'/u);
  assert.match(checked.sourceDiagnosticsText, /Cannot find name 'Intl'/u);
  assert.match(checked.sourceDiagnosticsText, /Cannot find name 'setTimeout'/u);
});

test("the JavaScript surface closes Promise, Intl, JSON, console, and timer APIs", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      export async function asynchronous(): Promise<string> {
        const first = Promise.resolve(1);
        const second = Promise.resolve(2);
        const raced = await Promise.race([first, second]);
        const any = await Promise.any([Promise.reject<number>("no"), second]);
        const settled = await Promise.allSettled([first, Promise.reject<number>("no")]);
        const finalized = await first.finally(() => console.count("finally"));

        const date = new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(Date.UTC(2023, 5, 15));
        const number = new Intl.NumberFormat("en-US", {
          style: "percent",
          maximumFractionDigits: 1,
        }).format(0.125);
        const order = new Intl.Collator("en-US", { numeric: true })
          .compare("item2", "item10");
        const json = JSON.stringify(
          { keep: raced + any + finalized, drop: order },
          (key, value) => key === "drop" ? undefined : value,
          2,
        ) ?? "";

        const timer = setTimeout(() => console.timeLog("build", settled.length), 0);
        clearTimeout(timer);
        const interval = setInterval(() => console.debug(date), 1);
        clearInterval(interval);
        console.time("build");
        console.timeEnd("build");
        return date + number + json;
      }
    `,
  });

  assertCsharpCompilationSucceeded(compiled);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(source, /PromiseRuntime/u);
  assert.match(source, /IntlDateTimeFormat/u);
  assert.match(source, /IntlNumberFormat/u);
  assert.match(source, /IntlCollator/u);
  assert.match(source, /JSON\.stringify/u);
  assert.match(source, /Timers/u);
  assert.match(source, /Console/u);
});
