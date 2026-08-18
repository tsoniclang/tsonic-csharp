import assert from "node:assert/strict";
import test from "node:test";
import { compileCsharpSource } from "../../../helpers/direct-csharp-session.mjs";

test("implicit project constructors forward exact provider constructor relations", () => {
  const compiled = compileCsharpSource({ sourceText: `
    import { Exception } from "@tsonic/dotnet/System.js";
    export class CustomError extends Exception {}
    export function consume(value: Exception): void {}
    export function run(): void { consume(new CustomError("boom")); }
  ` });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static void consume(System.Exception value)
        {
        }
        public static void run()
        {
            consume(new CustomError("boom"));
        }
    }
    public class CustomError : System.Exception
    {
        public CustomError() : base()
        {
        }
        public CustomError(string? message) : base(message)
        {
        }
        public CustomError(string? message, System.Exception? innerException) : base(message, innerException)
        {
        }
    }
}
`);
});
