import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const source = `export function typedMethodNumber(): number {
  const o: { m(x: number): number } = { m(x: number = 5): number { return x; } };
  return o.m(3);
}
export function typedMethodText(): string {
  const o: { m(x: string): string } = { m(x: string = "d"): string { return x; } };
  return o.m("p");
}
export function typedMethodOptional(): number {
  const o: { m(x?: number): number } = { m(x: number = 5): number { return x; } };
  return o.m() + o.m(3);
}
export function typedArrowProperty(): number {
  const o: { m: (x: number) => number } = { m: (x: number = 5): number => x };
  return o.m(3);
}
export function typedLocalArrow(): number {
  const g: (x: number) => number = (x: number = 5): number => x;
  return g(3);
}
function apply(fn: (x: number) => number): number {
  return fn(2);
}
export function contextualCallback(): number {
  return apply((x: number = 5): number => x);
}
export function run(): boolean {
  return typedMethodNumber() === 3 && typedMethodText() === "p" && typedMethodOptional() === 8 &&
    typedArrowProperty() === 3 && typedLocalArrow() === 3 && contextualCallback() === 2;
}
`;

for (const surface of ["native", "js"]) {
  test(`parameter defaults lower against the selected delegate parameter type (${surface})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: source });
    assertCsharpCompilationSucceeded(compiled);
    const output = [...compiled.artifacts.values()].join("\n");
    // C-0745/C-0746: method-only slots retain their native body; literals follow RULINGS 2026-10-22.
    const defaultLiteral = surface === "js" ? "5D" : "5";
    assert.equal(new RegExp(`public double m\\(double\\? (__tsonic_param\\d+)\\)\\s*\\{\\s*double x = \\1 \\?\\? ${defaultLiteral};`, "u").test(output), true,
      "a nullable selected delegate parameter still applies the default");
    assert.equal(/\(double (__tsonic_param\d+)\)[^\n]*\n?[^\n]*\1 \?\? 5/u.test(output), false,
      "a non-nullable selected delegate parameter is never coalesced");
    executeCsharpConstruction(compiled, `selected-delegate-parameter-defaults-${surface}`);
  });
}
