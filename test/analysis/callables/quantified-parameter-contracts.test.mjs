import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

const cases = [
  ["authored field signature", `
    export class Owner {
      identity: <Context>(value: Context) => Context = <Authored>(value: Authored): Authored => value;
    }
    export function run(): string { return new Owner().identity("value"); }
  `],
  ["reassigned generic callable", `
    export class Owner { identity = <Original>(value: Original): Original => value; }
    export function run(): string {
      const owner = new Owner();
      const retained = owner.identity;
      owner.identity = <Replacement>(value: Replacement): Replacement => value;
      return retained("first") + owner.identity("second");
    }
  `],
  ["outer payload and independent invocation binder", `
    export function create<Outer>(outer: Outer) {
      return <Inner>(value: Inner): { outer: Outer; value: Inner } => ({ outer, value });
    }
    export function run(): boolean {
      const value = create(3)("value");
      return value.outer === 3 && value.value === "value";
    }
  `],
];

for (const surface of ["native", "js"]) {
  for (const [name, sourceText] of cases) test(`quantified native body keeps its own binder on ${surface}: ${name}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    assert.equal(program !== undefined, true, "the complete source binder contract is admitted before publication");
    let checked = 0;
    const visit = node => {
      if ((program.source.ast.is.IsArrowFunction(node) || program.source.ast.is.IsFunctionExpression(node)) &&
          program.source.ast.typeParameters(node).length > 0) {
        const contract = program.records.callableDeclaration.get(node)?.contract;
        assert.equal(contract?.kind === "source", true, "the actual source generic declaration owns its contract");
        assert.equal(contract.nativeSignature.methodTypeParameterIdentities.length > 0, true,
          "the authored quantified native signature is not erased into its contextual alias");
        for (const parameter of contract.nativeParameters) {
          if (parameter.targetParameter.type.kind !== "type-parameter") continue;
          assert.equal(contract.nativeSignature.methodTypeParameterIdentities.includes(parameter.targetParameter.type.identity), true,
            "an authored invocation parameter uses the declaration's own exact quantifier");
          checked += 1;
        }
      }
      program.source.ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
    };
    program.source.navigation.sourceFiles.forEach(visit);
    assert.equal(checked > 0, true, "the witness observes actual quantified native parameter records");
  });
}

const contextualInputs = [
  ["async alias input", `
    import type { int32 } from "@tsonic/core/types.js";
    interface AsyncCallback<Input, Output = Input> { (value: Input): Promise<Output>; }
    export const checked: AsyncCallback<int32> = async value => {
      if (value < 0) throw new Error("negative");
      return value;
    };
    export async function run(): Promise<boolean> { return await checked(7) === 7; }
  `],
  ["explicit this is not an input slot", `
    import type { int32 } from "@tsonic/core/types.js";
    interface Callback<Input> { (this: void, value: Input): Input; }
    export const checked: Callback<int32> = function(value) { return value; };
    export function run(): boolean { return checked(7) === 7; }
  `],
  ["narrowed optional input", `
    import type { int32 } from "@tsonic/core/types.js";
    type Callback = (value: int32 | undefined) => int32;
    export const checked: Callback = value => value === undefined ? 3 : value;
    export function run(): boolean { return checked(undefined) === 3 && checked(7) === 7; }
  `],
  ["own quantifier and exact contextual integer", `
    import type { int32 } from "@tsonic/core/types.js";
    type Callback = <Context>(value: Context, count: int32) => Context;
    export const checked: Callback = <Authored>(value, count) => {
      const native: int32 = count;
      return value;
    };
    export function run(): boolean { return checked("kept", 7) === "kept"; }
  `],
];

for (const surface of ["native", "js"]) for (const [name, sourceText] of contextualInputs) {
  test(`unannotated parameter keeps its contextual native input on ${surface}: ${name}`, { timeout: 240_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `contextual-native-input-${name.replaceAll(" ", "-")}-${surface}`, true,
      false, [], name === "async alias input"
        ? "if (!await Tsonic.Generated.Index.run()) throw new System.Exception(\"native contextual input\");"
        : "if (!Tsonic.Generated.Index.run()) throw new System.Exception(\"native contextual input\");");
  });
}
