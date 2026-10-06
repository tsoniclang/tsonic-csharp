import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, checkCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const files = {
  "left.ts": `import { struct, field } from "@tsonic/core/lang.js";
    export const Packet = struct({ value: field<string>() });
    export function packet(value: typeof Packet): string { return value.value; }
    export interface CookieOptions { left: string }
    export function label(options: CookieOptions): string { return options.left; }
    export class Entry<T> {
      value: T;
      constructor(value: T) { this.value = value; }
      static label: string = "left";
      static zero(): Entry<number> { return new Entry<number>(1); }
      static identity<Value>(value: Value): Value { return value; }
    }
    export enum Status { Done = 1 }
    export function completed(value: Status): boolean { return value === Status.Done; }`,
  "right.ts": `import { struct, field } from "@tsonic/core/lang.js";
    export const Packet = struct({ value: field<number>() });
    export function packet(value: typeof Packet): number { return value.value; }
    export interface CookieOptions { right: number }
    export function label(options: CookieOptions): number { return options.right; }
    export class Entry<T> {
      value: T;
      constructor(value: T) { this.value = value; }
      static label: string = "right";
      static zero(): Entry<number> { return new Entry<number>(2); }
      static identity<Value>(value: Value): Value { return value; }
    }
    export enum Status { Done = 2 }
    export function completed(value: Status): boolean { return value === Status.Done; }`,
};

for (const surface of [undefined, "js"]) {
  test(`same authored C# module type names retain distinct native declarations on ${surface ?? "native"}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, files, sourceText: `
      import { Entry as LeftEntry, Status as LeftStatus, label as leftLabel, completed as leftCompleted } from "./left.js";
      import { Entry as RightEntry, Status as RightStatus, label as rightLabel, completed as rightCompleted } from "./right.js";
      import * as leftModule from "./left.js";
      import * as rightModule from "./right.js";
      import type { int64 } from "@tsonic/core/types.js";
      export function run(): boolean {
        const left = new LeftEntry<number>(3);
        const right = new RightEntry<string>("right");
        const inferredLeft = new LeftEntry("left");
        const inferredRight = new RightEntry(4);
        const exact: int64 = 9007199254740993n;
        const inferredWide = new LeftEntry(exact);
        return left.value === 3 && right.value === "right" && LeftEntry.zero().value === 1 && RightEntry.zero().value === 2 &&
          inferredLeft.value === "left" && inferredRight.value === 4 && LeftEntry.label === "left" && RightEntry.label === "right" &&
          LeftEntry.identity("left") === "left" && (RightEntry).identity(5) === 5 &&
          inferredWide.value === exact &&
          new leftModule.Entry("namespace").value === "namespace" &&
          leftModule.packet({ value: "packet" }) === "packet" && rightModule.packet({ value: 7 }) === 7 &&
          leftLabel({ left: "left" }) === "left" && rightLabel({ right: 4 }) === 4 &&
          leftCompleted(LeftStatus.Done) && rightCompleted(RightStatus.Done) &&
          leftCompleted(leftModule.Status.Done) && rightCompleted(rightModule.Status.Done);
      }
    ` });
    executeCsharpConstruction(compiled, `module-type-scopes-${surface ?? "native"}`);
    const source = [...compiled.artifacts.values()].join("\n");
    assert.equal((source.match(/public interface CookieOptions\b/gu) ?? []).length, 2);
    assert.equal((source.match(/public class Entry<T>(?=\s|:)/gu) ?? []).length, 2);
    assert.equal((source.match(/public struct Packet\b/gu) ?? []).length, 2);
    assert.doesNotMatch(source, /\b(?:CookieOptions_[0-9]+|Entry_[0-9]+|cookie_options)\b/u);
    assert.doesNotMatch(source, /\(\(T argument0\) =>/u);
    assert.match(source, /new __TsonicModule_[\da-f]+\.Entry<string>\("left"\)/u);
    assert.match(source, /new __TsonicModule_[\da-f]+\.Entry<double>\(4\)/u);
    assert.match(source, /new __TsonicModule_[\da-f]+\.Entry<long>\(exact\)/u);
    assert.match(source, /__TsonicModule_[\da-f]+\.Status\.Done/u);
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
