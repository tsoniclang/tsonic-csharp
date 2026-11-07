// Struct markers (nextgen C-2542). Emission programs are unchanged. The marker representation comes from
// representation/declared.ts: the struct fact of the declaration plus the project-type catalog's own struct definition.
// Field-call generic arguments come from facts.instantiations (G4). A missing or foreign authority is refused or is an
// invariant failure; C# never rebuilds it from shape equality or a raw Source replay (I4).
import assert from "node:assert/strict";
import test from "node:test";
import { structFactKey } from "@tsonic/tsts";
import { compileCsharpSource, compileCsharpAnalysisTarget, assertCsharpCompilationSucceeded } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { hostProgram, fixtureProjectTypes, representationServices, representations, represented } from "../../../representation/host-fixture.mjs";
import { mixedWidthRecordSource } from "../../../../../tsonic/test/fixtures/mixed-width-records.mjs";
import { emptyMemoryRecordProofFiles } from "../../../../../tsonic/test/fixtures/empty-memory-records.mjs";
import { memoryAbiCapability } from "../../../helpers/memory-abi.mjs";
import { targetTypeRefEquals } from "../../../../dist/target-model/types/equality.js";

const sourceText = `
  import { struct, field } from "@tsonic/core/lang.js";
  import type { int32 } from "@tsonic/core/types.js";
  const Packet: { value: int32 } = struct({ value: field<int32>() });
  export function run(): boolean {
    const original: typeof Packet = { value: 1 };
    let copy: typeof Packet = original;
    copy.value = 2;
    const unrelated: { value: int32 } = { value: 3 };
    const alias = unrelated;
    alias.value = 4;
    return original.value === 1 && copy.value === 2 && unrelated.value === 4;
  }
`;

function sourceNodes(source) {
  const nodes = [];
  const visit = node => { nodes.push(node); source.syntax.forEachChild(node, child => { if (child !== undefined) visit(child); }); };
  source.sourceFiles.filter(file => !source.syntax.isDeclarationFile(file)).forEach(visit);
  return nodes;
}

for (const surface of ["native", "js"]) {
  test(`published struct marker keeps value storage distinct from an equal-shape reference in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = compiled.artifacts.get("src/Index.cs");
    assert.equal(emitted.includes("public struct Packet"), true, "the canonical marker creates the one declared value type");
    assert.equal(/Packet original\s*=/u.test(emitted), true, "the typeof component selects its declared carrier");
    assert.equal(/Packet copy\s*=/u.test(emitted), true, "copy storage retains the same marker declaration");
    assert.equal(/Packet unrelated\s*=/u.test(emitted), false, "shape equality cannot manufacture marker identity");
    executeCsharpConstruction(compiled, `published-struct-marker-${surface}`);
  });

  test(`missing canonical marker cannot promote an ordinary published shape in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText,
      compileTarget(request, observer) {
        const original = request.input.source;
        const sourceFacts = { ...original.sourceFacts,
          getFact(subject, key) { return key === structFactKey ? undefined : original.sourceFacts.getFact(subject, key); },
        };
        return compileCsharpAnalysisTarget({ ...request, input: { ...request.input, source: { ...original, sourceFacts } } }, observer);
      },
    });
    assert.equal(compiled.sourceDiagnosticsText, "", "the same Source program remains checked");
    assert.equal([...compiled.artifacts.values()].some(text => text.includes("public struct Packet")), false,
      "a missing marker is never replaced by a same-shape association");
  });

  test(`a marked component refuses missing and foreign catalog authority in ${surface}`, () => {
    const program = hostProgram(sourceText + `
      const Foreign: { value: int32 } = struct({ value: field<int32>() });
    `, { surface });
    const variable = name => program.named(name, node => program.ast.is.IsVariableDeclaration(node));
    const packet = variable("Packet");
    const foreign = variable("Foreign");
    for (const declaration of [packet, foreign]) assert.notEqual(program.host.sourceFacts.getFact(declaration, structFactKey), undefined,
      "both authorities are marked project declarations");
    const original = variable("original");
    const descriptor = program.slot(original);
    assert.equal(descriptor.kind === "declared" && descriptor.declaration === packet, true,
      "the Host publishes the typeof component as the marked declaration");
    const base = fixtureProjectTypes(program);
    const id = declaration => `global::Fixture.${program.ast.text(program.ast.name(declaration))}`;
    const struct = declaration => Object.freeze({ id: id(declaration), declaration, kind: "struct",
      sourceName: program.ast.text(program.ast.name(declaration)), outerTypeParameters: [], typeParameters: [],
      outerTypeProjections: [], typeProjections: [] });
    const target = declaration => base.targetTypeForDeclaration(foreign, []) && Object.freeze({ kind: "target-named", id: id(declaration),
      csharpAllowsRefLikeTypeArguments: Object.freeze([]) });
    const catalog = overrides => Object.freeze({ ...base,
      definitionForDeclaration: declaration => declaration === packet || declaration === foreign ? struct(declaration) : undefined,
      targetTypeForDeclaration: declaration => declaration === packet || declaration === foreign ? target(declaration) : undefined,
      ...overrides });
    const at = projectTypes => representations(representationServices(program, { profile: surface, projectTypes })).slot(original);
    assert.equal(represented(at(catalog({}))).id, id(packet), "the marked declaration's own struct is the carrier");
    for (const [label, overrides] of [
      ["missing declaration", { definitionForDeclaration: () => undefined }],
      ["missing target", { targetTypeForDeclaration: () => undefined }],
      ["foreign declaration", { definitionForDeclaration: () => struct(foreign) }],
      ["foreign target", { targetTypeForDeclaration: () => target(foreign) }],
    ]) {
      const selected = at(catalog(overrides));
      assert.equal(selected.kind === "csharp-refused" && selected.code === "CSHARP_STRUCT_DECLARATION", true,
        `${label}: a struct marker requires its own catalog authority`);
    }
  });

  for (const mode of ["missing", "foreign", "incomplete", "foreign-record"]) {
    test(`${mode} field-call instantiation cannot reconstruct a nested field ABI in ${surface}`, () => {
      let overridden = 0;
      let failure;
      let compiled;
      try {
        compiled = compileCsharpSource({ surface, sourceText: mixedWidthRecordSource,
          compileTarget(request, observer) {
            const original = request.input.source;
            const { facts, syntax } = original;
            const calls = sourceNodes(original).filter(node => syntax.is.IsCallExpression(node) &&
              facts.instantiations.at(node)?.method?.length === 1);
            const selected = calls.find(node => syntax.typeArguments(node).some(argument => argument !== undefined && syntax.is.IsTypeLiteralNode(argument)));
            const other = calls.find(node => node !== selected && syntax.typeArguments(node).length === 1);
            assert.equal(selected !== undefined && other !== undefined, true, "both instantiations come from distinct field calls");
            const instantiations = Object.freeze({ at(node) {
              if (node !== selected) return facts.instantiations.at(node);
              overridden += 1;
              const publication = facts.instantiations.at(selected);
              const foreign = facts.instantiations.at(other);
              return mode === "missing" ? undefined : mode === "foreign" ? foreign
                : mode === "incomplete" ? { ...publication, method: [] } : { ...foreign, use: selected };
            } });
            return compileCsharpAnalysisTarget({ ...request, input: { ...request.input,
              source: { ...original, facts: Object.freeze({ ...facts, instantiations }) } } }, observer);
          },
        });
      } catch (error) {
        failure = error;
      }
      assert.equal(overridden > 0, true, "the field-call instantiation is demanded");
      if (failure !== undefined) {
        assert.equal(failure.diagnostic?.code, "TSONIC_INTERNAL_ANALYSIS_INVARIANT",
          "a missing or foreign instantiation for a supported call is an invariant failure (I4)");
        return;
      }
      assert.equal(compiled.sourceDiagnosticsText, "", "the original source remains valid");
      assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error" && issue.source === "tsonic-csharp"), true,
        "the absent or foreign ABI is a .NET refusal, not structural reconstruction");
      assert.equal(compiled.artifacts.size, 0, "no raw Source replay replaces the field ABI");
    });
  }

  test(`an ordinary literal has no direct physical occurrence fact: its carrier is its Host descriptor in ${surface}`, () => {
    const files = emptyMemoryRecordProofFiles(surface === "js");
    const program = hostProgram('import type { int32 } from "@tsonic/core/types.js";\n' +
      files["index.ts"].replace("let visits = 0;", "let visits: int32 = 0;"),
    { surface, capabilities: [memoryAbiCapability("csharp")], files: { "schema.ts": files["schema.ts"] } });
    const ordinary = program.nodes.find(node => program.ast.is.IsObjectLiteralExpression(node) && program.ast.properties(node).length === 0);
    assert.notEqual(ordinary, undefined);
    const represent = representations(representationServices(program, { profile: surface,
      shapes: Object.freeze({ retainShape: shape => shape, resolveCallableValue: () => assert.fail("no callable value") }) }));
    const value = represent.value(ordinary);
    const logical = represent.type(program.type(ordinary), ordinary, "value");
    assert.equal(value.kind === "csharp-refused" ? value.code === logical.code : targetTypeRefEquals(value, logical), true,
      "only an occurrence fact (layout query, raw address, keep-alive, JS string) replaces the logical descriptor path");
  });

  test(`foreign and unmarked typeof components keep ordinary reference semantics in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: sourceText.replace("let copy: typeof Packet = original;",
      "let copy: typeof Packet = original; const foreign: { value: int32 } = { value: 7 }; const foreignAlias: typeof foreign = foreign; foreignAlias.value = 8;")
      .replace("return original.value === 1", "return foreign.value === 8 && original.value === 1") });
    assertCsharpCompilationSucceeded(compiled);
    assert.equal(/Packet foreign(?:Alias)?\s*=/u.test(compiled.artifacts.get("src/Index.cs")), false,
      "an unmarked declaration with identical field widths cannot select another declaration's marker");
    executeCsharpConstruction(compiled, `foreign-struct-marker-${surface}`);
  });

  test(`Host refusal precedes native marker representation in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText: sourceText.replace("const original: typeof Packet = { value: 1 };",
      "const original: typeof Packet = { value: 1 }; const rejected = !1;") });
    const issues = compiled.result.diagnostics.filter(issue => issue.category === "error");
    assert.equal(issues.length, 1, "the Host refusal is not replaced by a .NET publication");
    assert.equal(issues[0].code, "TSONIC_LOCAL_TYPE_UNSUPPORTED");
    assert.equal(issues[0].message, "Logical negation requires an exact bool operand.");
    const ast = compiled.source.ast;
    assert.equal(ast.getSourceText(ast.getSourceFile(issues[0].sourceNode)).slice(ast.pos(issues[0].sourceNode), ast.end(issues[0].sourceNode)).trim(), "!1");
    assert.equal(compiled.artifacts.size, 0, "no refused Source reaches a native artifact");
  });
}
