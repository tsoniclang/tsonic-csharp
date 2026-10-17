import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

function thenCalls(compiled) {
  const { ast, sourceFiles } = compiled.source;
  const calls = [];
  const visit = node => {
    if (ast.is.IsCallExpression(node)) {
      const file = ast.getSourceFile(node);
      const text = ast.getSourceText(file).slice(ast.pos(node), ast.end(node)).trim();
      if (text.startsWith("pending.then")) calls.push(node);
    }
    ast.forEachChild(node, child => { if (child !== undefined) visit(child); });
  };
  for (const file of sourceFiles) if (!ast.isDeclarationFile(file)) visit(file);
  return calls.map(node => compiled.result.program.records.selectedCall.get(node));
}

for (const owner of ["Promise", "PromiseLike"]) {
  for (const [name, reaction, result] of [
    ["inferred", "then(value => value + 1)", 8],
    ["explicit", "then<number>(value => value + 1)", 8],
    ["async-reaction", "then(value => Promise.resolve(value + 1))", 8],
  ]) {
    test(`canonical ${owner}.then keeps the native continuation contract (${name})`, { timeout: 240_000 }, () => {
      const compiled = compileCsharpSource({ surface: "js", sourceText: `
        export async function run(): Promise<boolean> {
          const pending: ${owner}<number> = Promise.resolve(7);
          return await pending.${reaction} === ${result};
        }` });
      assertCsharpCompilationSucceeded(compiled);
      const calls = thenCalls(compiled);
      assert.equal(calls.length, 1, "the exact checked continuation call is present");
      assert.equal(calls[0].target?.kind, "resolved", "the canonical library call selects a native operation");
      const member = calls[0].target.call.targetMember;
      assert.equal(member.id.startsWith("Tsonic.CSharp.Js.PromiseRuntime.then:"), true,
        "Promise and PromiseLike share the same existing native continuation owner");
      assert.equal(member.typeParameters.length, 1, "the selected native TResult slot is explicit");
      assert.equal(member.typeParameters[0].csharpAllowsRefLike, false,
        "the actual native helper's ordinary TResult permission remains false");
      executeCsharpConstruction(compiled, `promise-like-${owner}-${name}`, true, false, [],
        "Tsonic.CSharp.Js.JsEventLoop.Run(async () => { if (!await Tsonic.Generated.Index.run()) throw new System.Exception(\"PromiseLike continuation\"); });");
    });
  }
}

test("generic PromiseLike reaction retains the project binder rather than the default-library binder", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    function react<Value>(value: Value): PromiseLike<Value> {
      const pending: PromiseLike<number> = Promise.resolve(0);
      return pending.then(() => value);
    }
    export async function run(): Promise<boolean> { return await react(7) === 7; }` });
  assertCsharpCompilationSucceeded(compiled);
  const calls = thenCalls(compiled);
  assert.equal(calls.length, 1, "one selected generic reaction");
  const selected = calls[0].target.call.targetMethodTypeArguments;
  assert.equal(selected.length, 1, "one actual native result type argument");
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(/\bTResult[12]\b/u.test(output), false, "default-library binders never leak into generated C#");
  executeCsharpConstruction(compiled, "promise-like-project-binder", true, false, [],
    "Tsonic.CSharp.Js.JsEventLoop.Run(async () => { if (!await Tsonic.Generated.Index.run()) throw new System.Exception(\"project generic identity\"); });");
});

test("a project declaration named PromiseLike does not acquire the canonical library operation", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ surface: "js", sourceText: `
    interface PromiseLike<Value> { then(callback: (value: Value) => number): number; }
    class Local implements PromiseLike<number> {
      then(callback: (value: number) => number): number { return callback(7); }
    }
    export function run(): boolean {
      const pending = new Local(); return pending.then(value => value + 1) === 8;
    }` });
  assertCsharpCompilationSucceeded(compiled);
  const calls = thenCalls(compiled);
  assert.equal(calls.length, 1, "the actual project method is checked");
  assert.equal(calls.some(call => call.target?.kind === "resolved" &&
    call.target.call.targetMember.id.startsWith("Tsonic.CSharp.Js.PromiseRuntime.")), false,
  "the canonical source-profile identity is never inferred from the spelling then or PromiseLike");
  executeCsharpConstruction(compiled, "promise-like-user-shadow");
});

test("native direct await remains native and does not import the JS continuation runtime", { timeout: 240_000 }, () => {
  const compiled = compileCsharpSource({ sourceText: `
    async function value(): Promise<number> { return 7; }
    export async function run(): Promise<boolean> { return await value() === 7; }` });
  assertCsharpCompilationSucceeded(compiled);
  const output = [...compiled.artifacts.values()].join("\n");
  assert.equal(output.includes("PromiseRuntime"), false, "the no-JS native await path has no compatibility continuation helper");
  executeCsharpConstruction(compiled, "promise-like-native-control", true);
});
