import assert from "node:assert/strict";
import test from "node:test";

import {
  compileCsharpSource,
} from "../../../helpers/direct-csharp-session.mjs";

test("provider-owned CLR enums retain intrinsic C# equality and bitwise operations", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { JsonValueKind } from "@tsonic/dotnet/System.Text.Json.js";
      export function isObject(kind: JsonValueKind): boolean {
        return kind === JsonValueKind.Object;
      }
      export function isNotObject(kind: JsonValueKind): boolean {
        return kind !== JsonValueKind.Object;
      }
      export function combine(left: JsonValueKind, right: JsonValueKind): JsonValueKind {
        return left | right;
      }
      export function complement(kind: JsonValueKind): JsonValueKind {
        return ~kind;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.equal(compiled.artifacts.get("src/Index.cs"), `namespace Tsonic.Generated
{
    public static class Index
    {
        public static bool isObject(System.Text.Json.JsonValueKind kind)
        {
            return kind == System.Text.Json.JsonValueKind.Object;
        }
        public static bool isNotObject(System.Text.Json.JsonValueKind kind)
        {
            return kind != System.Text.Json.JsonValueKind.Object;
        }
        public static System.Text.Json.JsonValueKind combine(System.Text.Json.JsonValueKind left, System.Text.Json.JsonValueKind right)
        {
            return left | right;
        }
        public static System.Text.Json.JsonValueKind complement(System.Text.Json.JsonValueKind kind)
        {
            return ~kind;
        }
    }
}
`);
});

test("provider-returned CLR enums retain intrinsic equality with enum constants", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { DateTime, DayOfWeek } from "@tsonic/dotnet/System.js";
      export function isMonday(value: DateTime): boolean {
        return value.DayOfWeek === DayOfWeek.Monday;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /return value\.DayOfWeek == System\.DayOfWeek\.Monday;/,
  );
});

test("provider-selected JSON deserialization uses an exact constructible project shape", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { JsonSerializer } from "@tsonic/dotnet/System.Text.Json.js";
      import type { int } from "@tsonic/csharp/types.js";
      export interface Input { title: string; count: int; }
      export function parse(json: string): Input | undefined {
        const value = JsonSerializer.Deserialize<Input>(json);
        return value;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
  assert.ok(source);
  assert.ok(shapes);
  const selectedCarrier = source.match(
    /JsonSerializer\.Deserialize<(InputShape_[0-9a-f]{12,64})>\(json\)/,
  )?.[1];
  assert.ok(selectedCarrier);
  assert.equal(source.includes("JsonSerializer.Deserialize<Input>(json)"), false);
  assert.equal(source.includes("Input? value ="), true);
  assert.equal(
    shapes,
    `namespace Tsonic.Generated
{
    public class ${selectedCarrier} : Input
    {
        public required int count
        {
            get;
            set;
        }
        public required string title
        {
            get;
            set;
        }
    }
}
`,
  );
});

test("provider collection values do not become project-owned object shapes", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { List } from "@tsonic/dotnet/System.Collections.Generic.js";
      import { JsonSerializer } from "@tsonic/dotnet/System.Text.Json.js";
      import type { int } from "@tsonic/csharp/types.js";
      export interface Item { id: int; }
      export function serialize(items: List<Item>): string {
        return JsonSerializer.Serialize<List<Item>>(items);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  assert.match(
    compiled.artifacts.get("src/Index.cs") ?? "",
    /System\.Text\.Json\.JsonSerializer\.Serialize<System\.Collections\.Generic\.List<Item>>\(items\)/,
  );
  assert.equal(compiled.artifacts.has("generated/TsonicObjectShapes.cs"), false);
});

test("provider arguments retain an object literal's contextual project interface relation", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { JsonSerializer } from "@tsonic/dotnet/System.Text.Json.js";
      export interface ErrorResponse { error: string; }
      export function serializeError(message: string): string {
        return JsonSerializer.Serialize<ErrorResponse>({ error: message });
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  const shapes = compiled.artifacts.get("generated/TsonicObjectShapes.cs");
  assert.ok(source);
  assert.ok(shapes);
  const selectedCarrier = source.match(
    /JsonSerializer\.Serialize<ErrorResponse>\(new (ErrorResponseShape_[0-9a-f]{12,64})/,
  )?.[1];
  assert.ok(selectedCarrier);
  assert.match(shapes, new RegExp(`public class ${selectedCarrier} : ErrorResponse`, "u"));
});

test("JS structural views retain one closed value carrier through assertions, flow, mutation, identity, and literals", () => {
  const compiled = compileCsharpSource({
    surface: "js",
    sourceText: `
      export function parse(json: string): string | undefined {
        const obj = JSON.parse(json) as { title?: unknown };
        if (typeof obj.title !== "string") return undefined;
        return obj.title;
      }
      export function update(json: string): string {
        const obj = JSON.parse(json) as { title?: unknown };
        obj.title = 1;
        return typeof obj.title;
      }
      export function identity(json: string): boolean {
        const raw = JSON.parse(json);
        const left = raw as { title?: unknown };
        const right = raw as { title?: unknown };
        return left === right;
      }
      export function create(): string {
        const obj: { title?: unknown } = {
          title: JSON.parse("\\\"created\\\""),
        };
        return typeof obj.title;
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs");
  assert.ok(source);
  assert.equal(source, `namespace Tsonic.Generated
{
    public static class Index
    {
        public static string? parse(string json)
        {
            Tsonic.CSharp.Runtime.TsValue obj = Tsonic.CSharp.Js.JSON.parse(json);
            if (Tsonic.CSharp.Runtime.TsValue.ApplyDynamicTypeof(obj.ReadDynamicSlot("title")) != "string")
            {
                return null;
            }
            return Tsonic.CSharp.Runtime.TsValue.CastDynamic<string>(obj.ReadDynamicSlot("title"));
        }
        public static string update(string json)
        {
            Tsonic.CSharp.Runtime.TsValue obj = Tsonic.CSharp.Js.JSON.parse(json);
            obj.WriteDynamicSlot("title", Tsonic.CSharp.Runtime.TsValue.from((double)1));
            return Tsonic.CSharp.Runtime.TsValue.ApplyDynamicTypeof(obj.ReadDynamicSlot("title"));
        }
        public static bool identity(string json)
        {
            Tsonic.CSharp.Runtime.TsValue raw = Tsonic.CSharp.Js.JSON.parse(json);
            Tsonic.CSharp.Runtime.TsValue left = raw;
            Tsonic.CSharp.Runtime.TsValue right = raw;
            return Tsonic.CSharp.Runtime.TsValue.ApplyDynamicBinaryBoolean(left, "===", right);
        }
        public static string create()
        {
            Tsonic.CSharp.Runtime.TsValue obj = Tsonic.CSharp.Runtime.TsValue.CreateDynamicObject("title", Tsonic.CSharp.Js.JSON.parse("\\\"created\\\""));
            return Tsonic.CSharp.Runtime.TsValue.ApplyDynamicTypeof(obj.ReadDynamicSlot("title"));
        }
    }
}
`);
  assert.equal(compiled.artifacts.has("generated/TsonicObjectShapes.cs"), false);
  assert.equal(source.includes("dynamic"), false);
  assert.equal(source.includes("System.Reflection"), false);
});

test("broad value object literals lower directly into nested closed JS-value carriers", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      export function createUnknown(): unknown {
        return { value: 1, child: { label: "ready" } };
      }
      export function createAny(): any {
        return { enabled: true };
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  const source = compiled.artifacts.get("src/Index.cs") ?? "";
  assert.match(
    source,
    /TsValue createUnknown\(\)[\s\S]*TsValue\.CreateDynamicObject\("value", Tsonic\.CSharp\.Runtime\.TsValue\.from\(\(int\)1\), "child", Tsonic\.CSharp\.Runtime\.TsValue\.CreateDynamicObject\("label", Tsonic\.CSharp\.Runtime\.TsValue\.from\("ready"\)\)\)/u,
  );
  assert.match(
    source,
    /TsValue createAny\(\)[\s\S]*TsValue\.CreateDynamicObject\("enabled", Tsonic\.CSharp\.Runtime\.TsValue\.from\(true\)\)/u,
  );
  assert.equal(compiled.artifacts.has("generated/TsonicObjectShapes.cs"), false);
});
