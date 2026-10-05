import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const files = {
  "left.ts": `export interface CookieOptions { left: string }
    export function label(options: CookieOptions): string { return options.left; }
    export class Entry<T> {
      value: T;
      constructor(value: T) { this.value = value; }
      static zero(): Entry<number> { return new Entry<number>(1); }
    }
    export enum Status { Done = 1 }
    export function completed(value: Status): boolean { return value === Status.Done; }`,
  "right.ts": `export interface CookieOptions { right: number }
    export function label(options: CookieOptions): number { return options.right; }
    export class Entry<T> {
      value: T;
      constructor(value: T) { this.value = value; }
      static zero(): Entry<number> { return new Entry<number>(2); }
    }
    export enum Status { Done = 2 }
    export function completed(value: Status): boolean { return value === Status.Done; }`,
};

for (const surface of [undefined, "js"]) {
  test(`same authored C# module type names retain distinct native declarations on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files, sourceText: `
      import { Entry as LeftEntry, Status as LeftStatus, label as leftLabel, completed as leftCompleted } from "./left.js";
      import { Entry as RightEntry, Status as RightStatus, label as rightLabel, completed as rightCompleted } from "./right.js";
      export function run(): boolean {
        const left = new LeftEntry<number>(3);
        const right = new RightEntry<string>("right");
        return left.value === 3 && right.value === "right" && LeftEntry.zero().value === 1 && RightEntry.zero().value === 2 &&
          leftLabel({ left: "left" }) === "left" && rightLabel({ right: 4 }) === 4 &&
          leftCompleted(LeftStatus.Done) && rightCompleted(RightStatus.Done);
      }
    ` });
    executeCsharpConstruction(compiled, `module-type-scopes-${surface ?? "native"}`);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.equal((source.match(/public interface CookieOptions\b/gu) ?? []).length, 2);
    assert.equal((source.match(/public class Entry<T>\b/gu) ?? []).length, 2);
    assert.doesNotMatch(source, /\b(?:CookieOptions_[0-9]+|Entry_[0-9]+|cookie_options)\b/u);
  });

  test(`same authored C# module names do not merge incompatible contracts on ${surface ?? "native"}`, () => {
    const checked = checkCsharpSource({ surface, files, sourceText: `
      import { label } from "./left.js";
      import type { CookieOptions } from "./right.js";
      export function invalid(options: CookieOptions): string { return label(options); }
    ` });
    assert.notEqual(checked.sourceDiagnosticsText, "", "incompatible exact declaration remains a source error");
    assert.match(checked.sourceDiagnosticsText, /left|assignable|CookieOptions/u);
  });
}
