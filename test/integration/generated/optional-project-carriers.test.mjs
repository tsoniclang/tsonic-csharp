import assert from "node:assert/strict";
import test from "node:test";
import { optionalProjectCarriersSource } from "../../../../tsonic/test/fixtures/optional-project-carriers.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { csharpProgramSourceFiles } from "../../helpers/program-source-files.mjs";

for (const surface of [undefined, "js"]) {
  const lane = surface ?? "native";
  test(`optional project positions preserve live derived identity in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: optionalProjectCarriersSource });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = [...compiled.artifacts].filter(([path]) => path.endsWith(".cs")).map(([, text]) => text).join("\n");
    assert.doesNotMatch(emitted, /InvokeDynamic|ReadDynamicSlot|Unsafe\.|dynamic\b|GetType\(|Activator\./u);
    executeCsharpConstruction(compiled, `optional-project-carriers-${lane}`);
  });
  test(`project declaration templates retain their own binders across optional aliases in ${lane}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
class Base<Value> {
  value: Value;
  constructor(value: Value) { this.value = value; }
  read(): Value { return this.value; }
}
class Child extends Base<number> { extra(): number { return this.value + 1; } }
type Maybe<Value> = Base<Value> | undefined;
function retain<Value>(value: Maybe<Value>): Maybe<Value> { return value; }
export function run(): boolean {
  const numeric = new Child(7);
  const textual = new Base<string>("kept");
  const first: Maybe<number> = retain<number>(numeric);
  const second: Maybe<string> = retain<string>(textual);
  if (first === undefined || second === undefined) return false;
  numeric.value = 9;
  textual.value = "changed";
  return first === numeric && second === textual && first.read() === 9 && second.read() === "changed" &&
    numeric.extra() === 10 && retain<number>(undefined) === undefined;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    const program = compiled.result.program;
    const ast = program.source.ast;
    const declaration = csharpProgramSourceFiles(program).flatMap(file => ast.statements(file)).find(node =>
      node !== undefined && ast.is.IsClassDeclaration(node) && ast.text(ast.name(node)) === "Base");
    const definition = program.projectTypes.definitionContainingDeclaration(declaration);
    assert.equal(definition !== undefined, true, "the checked generic class has its actual native declaration");
    const templates = program.objectShapes.knownShapes().filter(shape => shape.targetType.kind === "target-named" &&
      shape.targetType.id === definition.id && shape.targetType.typeArguments?.length === definition.typeParameterBindings.length &&
      shape.targetType.typeArguments.every((argument, index) => argument.kind === "type-parameter" &&
        argument.identity === definition.typeParameterBindings[index].identity));
    assert.equal(templates.length, 1, "one canonical native generic declaration template");
    assert.equal(templates[0].targetType.typeArguments.every(argument => argument.csharpConstraints?.kind === "resolved" &&
      argument.csharpConstraints.constraints.length === 0), true,
    "the actual unconstrained native quantifiers carry resolved evidence, not missing placeholder metadata");
    executeCsharpConstruction(compiled, `optional-project-template-binders-${lane}`);
  });
}
