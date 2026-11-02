import assert from "node:assert/strict";
import test from "node:test";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  const label = surface ?? "native";
  test(`native Error synthetic JSON writer and projection share only real inherited project storage (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export class BaseFailure extends Error { inherited: number = 17; }
      export class Failure extends BaseFailure { code: number = 19; detail: string = "own"; }
      export class Container { error: Failure; constructor(error: Failure) { this.error = error; } }
      export function make(): Failure { return new Failure("original"); }
      export function contain(value: Failure): Container { return new Container(value); }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts.values()].join("\n");
    assert.match(emitted, /__tsonicWriteJson/u);
    assert.match(emitted, /__tsonicJsonValue/u);
    assert.doesNotMatch(emitted, /Tsonic\.CSharp\.Runtime\.Error\b|ErrorObject|System\.Reflection/u);
    executeCsharpConstruction(compiled, `native-error-json-frontier-${label}`, false, false, [], `
using System;
using System.Linq;
using System.Text.Json;
using Tsonic.CSharp.Js;
using Generated = Tsonic.Generated.Index;
var original = Generated.make();
var writer = JSON.stringify(original);
var projection = JSON.stringify(((IJsonValue)original).__tsonicJsonValue(""));
if (writer != projection) throw new Exception("writer/projection property set or order");
using var document = JsonDocument.Parse(writer);
var root = document.RootElement;
var keys = root.EnumerateObject().Select(property => property.Name).ToArray();
if (keys.Length != 3 || !keys.Contains("inherited") || !keys.Contains("code") || !keys.Contains("detail") ||
    root.GetProperty("inherited").GetInt32() != 17 || root.GetProperty("code").GetInt32() != 19 ||
    root.GetProperty("detail").GetString() != "own") throw new Exception("real project storage");
var container = Generated.contain(original);
if (!ReferenceEquals(container.error, original)) throw new Exception("containing slot identity");
using var nested = JsonDocument.Parse(JSON.stringify(container));
if (nested.RootElement.GetProperty("error").GetRawText() != writer) throw new Exception("containing Error slot serialization");
if (original.Message != "original" || original.StackTrace is not null || original.GetType().Name != "Failure")
    throw new Exception("JSON must not mutate or capture native Exception state");
`);
  });

  test(`native Error spread and rest preserve own and inherited project fields with one source evaluation (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      class BaseFailure extends Error { inherited: number = 17; }
      class Failure extends BaseFailure { code: number = 19; detail: string = "own"; }
      let order: string = "";
      function selected(value: Failure, key: string): Failure { order += key; return value; }
      export function run(): boolean {
        const original = new Failure("original");
        const spread = { ...selected(original, "spread;") };
        const { code, ...rest } = selected(original, "rest;");
        return code === 19 && spread.code === 19 && spread.inherited === 17 && spread.detail === "own" &&
          rest.inherited === 17 && rest.detail === "own" && order === "spread;rest;" &&
          original.message === "original" && original.stack === undefined && original.name === "Failure";
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    assert.doesNotMatch([...compiled.artifacts.values()].join("\n"), /ErrorObject|Tsonic\.CSharp\.Runtime\.Error\b/u);
    executeCsharpConstruction(compiled, `native-error-spread-rest-${label}`);
  });

  test(`native Error custom toJSON retains its selected override and property-key ABI (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      let calls: number = 0;
      let seen: string = "";
      class Failure extends Error {
        code: number = 17;
        toJSON(key: string): { selected: number } { calls += 1; seen = key; return { selected: this.code }; }
      }
      export class Container { constructor(readonly error: Failure) {} }
      export function make(): Container { return new Container(new Failure("original")); }
      export function callCount(): number { return calls; }
      export function selectedKey(): string { return seen; }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-custom-json-${label}`, false, false, [], `
using System;
using Generated = Tsonic.Generated.Index;
var container = Generated.make();
var text = Tsonic.CSharp.Js.JSON.stringify(container);
if (text != "{\\\"error\\\":{\\\"selected\\\":17}}" || Generated.callCount() != 1 || Generated.selectedKey() != "error" ||
    container.error.StackTrace is not null) throw new Exception("native custom JSON identity, key or evaluation count");
`);
  });

  if (surface === "js") test(`closed own-set helpers keep containing Error slots and their exact native identity (${label})`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
      export function run(): boolean {
        const original = new Error("original");
        const container = { error: original };
        const assigned = Object.assign({}, container);
        return Object.keys(container).join(",") === "error" && Object.hasOwn(container, "error") &&
          Object.values(container)[0] === original && Object.entries(container)[0][1] === original &&
          assigned.error === original && original.message === "original" && original.stack === undefined;
      }
    ` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `native-error-containing-own-set-${label}`);
  });
}
