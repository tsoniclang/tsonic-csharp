import assert from "node:assert/strict";
import test from "node:test";
import { structFactKey } from "@tsonic/tsts";
import { compileCsharpSource, compileCsharpAnalysisTarget, assertCsharpCompilationSucceeded, withCsharpSessionRequest } from "../../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../../helpers/native-construction.mjs";
import { createCsharpProjectTypeCatalog } from "../../../../dist/analysis/project-types/catalog.js";
import { resolveCsharpSourceEffectiveType } from "../../../../dist/analysis/source-evidence/types/resolution/effective-types.js";
import { selectDirectSourceFacts } from "../../../../dist/analysis/source-evidence/types/resolution/semantic-types.js";
import { emptyMemoryRecordProofFiles } from "../../../../../tsonic/test/fixtures/empty-memory-records.mjs";
import { mixedWidthRecordSource } from "../../../../../tsonic/test/fixtures/mixed-width-records.mjs";
import { memoryAbiCapability } from "../../../helpers/memory-abi.mjs";

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

for (const surface of ["native", "js"]) {
  test(`published struct marker keeps value storage distinct from an equal-shape reference in ${surface}`, () => {
    const compiled = compileCsharpSource({ surface, sourceText });
    assertCsharpCompilationSucceeded(compiled);
    const emitted = compiled.artifacts.get("src/Index.cs");
    assert.equal(emitted.includes("public struct Packet"), true, "the canonical marker creates the one declared value type");
    assert.equal(/Packet original\s*=/u.test(emitted), true, "the exact typeof component selects its declared carrier");
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
    assert.equal(compiled.sourceDiagnosticsText, "", "the same original Source program remains checked");
    assert.equal([...compiled.artifacts.values()].some(text => text.includes("public struct Packet")), false,
      "a missing exact marker is never replaced by a same-shape association");
  });

  test(`an actual marked component refuses missing and foreign catalog authority in ${surface}`, () => {
    const measured = withCsharpSessionRequest({ surface, sourceText: sourceText + `
      const Foreign: { value: int32 } = struct({ value: field<int32>() });
    ` }, request => {
      const source = request.input.source;
      const ast = source.ast;
      const catalog = createCsharpProjectTypeCatalog({ ...source,
        enumConstants: source.semantics.enumConstants, semanticsFor: source.semantics.forNode });
      const packet = catalog.definitions.find(definition => definition.sourceName === "Packet");
      const foreign = catalog.definitions.find(definition => definition.sourceName === "Foreign");
      assert.equal(packet?.kind === "struct" && foreign?.kind === "struct", true,
        "both authorities are real checked, marked project declarations");
      const value = source.navigation.nodes.find(node => ast.is.IsVariableDeclaration(node) && ast.text(ast.name(node)) === "original");
      const outcome = value === undefined ? undefined : source.effectiveTypes.get(value);
      const query = outcome?.kind === "resolved" ? outcome.provenance.component?.authoredTypeNode : undefined;
      assert.equal(query !== undefined && ast.is.IsTypeQueryNode(query) &&
        source.navigation.sourceReferenceFor(ast.as.AsTypeQueryNode(query).ExprName)?.declaration === packet.declaration &&
        source.sourceFacts.getFact(packet.declaration, structFactKey) !== undefined, true,
        "the original query has a genuine canonical marker, not an unmarked foreign name");
      const catalogs = [
        { ...catalog, definitionForDeclaration: () => undefined },
        { ...catalog, targetTypeForDeclaration: () => undefined },
        { ...catalog, definitionForDeclaration: () => foreign },
        { ...catalog, targetTypeForDeclaration: () => catalog.targetTypeForDeclaration(foreign.declaration, []) },
      ];
      return catalogs.map(projectTypeCatalog => {
        const selection = resolveCsharpSourceEffectiveType({ host: { ...source, projectTypeCatalog },
          selectDirectSourceFacts() { return { kind: "not-applicable" }; },
        }, value, { depth: 0 });
        return selection !== undefined && selection.outcome.provenance.occurrence === value &&
          selection.outcome.provenance.component?.authoredTypeNode === query && selection.result === undefined;
      });
    });
    assertCsharpCompilationSucceeded(measured.compiled);
    assert.deepEqual(measured.value, [true, true, true, true],
      "missing declaration, missing target, foreign declaration and foreign target remain required failures");
  });

  for (const mode of ["missing", "foreign", "incomplete", "foreign-record"]) {
    test(`${mode} field-call publication cannot reconstruct a nested field ABI in ${surface}`, () => {
      let overridden = 0;
      const compiled = compileCsharpSource({ surface, sourceText: mixedWidthRecordSource,
        compileTarget(request, observer) {
          const original = request.input.source;
          const ast = original.ast;
          const calls = original.navigation.nodes.filter(node => ast.is.IsCallExpression(node) &&
            original.effectiveTypes.callInstantiation(node)?.method.length === 1);
          const selected = calls.find(node => ast.typeArguments(node).some(argument => argument !== undefined && ast.is.IsTypeLiteralNode(argument)));
          const foreign = calls.find(node => node !== selected && ast.typeArguments(node).length === 1);
          assert.equal(selected !== undefined && foreign !== undefined, true,
            "both publications come from actual distinct original field calls");
          const effectiveTypes = { ...original.effectiveTypes,
            callInstantiation(node) {
              if (node !== selected) return original.effectiveTypes.callInstantiation(node);
              overridden += 1;
              const publication = original.effectiveTypes.callInstantiation(selected);
              const other = original.effectiveTypes.callInstantiation(foreign);
              return mode === "missing" ? undefined : mode === "foreign" ? other
                : mode === "incomplete" ? { ...publication, method: [] }
                  : { ...other, call: { ...other.call, call: selected } };
            },
          };
          return compileCsharpAnalysisTarget({ ...request, input: { ...request.input,
            source: { ...original, effectiveTypes } } }, observer);
        },
      });
      assert.equal(compiled.sourceDiagnosticsText, "", "the complete original source remains valid and unchanged");
      assert.equal(overridden > 0, true, "the same exact field-call publication is actually demanded");
      assert.equal(compiled.result.diagnostics.some(issue => issue.category === "error" && issue.source === "tsonic-csharp"), true,
        "the absent or foreign ABI is a Native refusal, not unchecked structural reconstruction");
      assert.equal(compiled.result.program === undefined && compiled.artifacts.size === 0, true,
        "neither selectedMember.type nor a raw Source replay can replace the field ABI");
    });
  }

  test(`direct Native facts distinguish absence from an unrepresentable required operation in ${surface}`, () => {
    const files = emptyMemoryRecordProofFiles(surface === "js");
    const measured = withCsharpSessionRequest({ surface, capabilities: [memoryAbiCapability("csharp")],
      sourceText: 'import type { int32 } from "@tsonic/core/types.js";\n' + files["index.ts"].replace("let visits = 0;", "let visits: int32 = 0;"),
      files: { "schema.ts": files["schema.ts"] },
    }, request => {
      const source = request.input.source;
      const ast = source.ast;
      const operation = source.navigation.nodes.find(node => ast.is.IsCallExpression(node) &&
        ast.is.IsIdentifier(ast.as.AsCallExpression(node).Expression) &&
        ast.text(ast.as.AsCallExpression(node).Expression) === "allocateptr");
      const ordinary = source.navigation.nodes.find(node => ast.is.IsObjectLiteralExpression(node) && ast.properties(node).length === 0);
      assert.equal(operation !== undefined && ordinary !== undefined, true, "actual operation and ordinary shape subjects");
      const scope = { host: source,
        resolveTypedLocationOperationPointeeWithState() { return undefined; },
        resolveNodeWithState() { return undefined; },
        resolveTypeWithState() { assert.fail("the authored pointee does not permit a raw Source replay"); },
        resolveSelectedValueWithState() { return undefined; },
      };
      return [ordinary, operation].map(node => selectDirectSourceFacts(scope, [node], ast.getSourceFile(node), { depth: 0 }).kind);
    });
    assertCsharpCompilationSucceeded(measured.compiled);
    assert.deepEqual(measured.value, ["not-applicable", "unavailable"],
      "only genuinely absent physical facts permit the logical descriptor path");
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
    assert.equal(issues.length, 1, "the original Host refusal is not replaced by Native publication");
    assert.equal(issues[0].code, "TSONIC_LOCAL_TYPE_UNSUPPORTED");
    assert.equal(issues[0].message, "Logical negation requires an exact bool operand.");
    const ast = compiled.source.ast;
    assert.equal(ast.getSourceText(ast.getSourceFile(issues[0].sourceNode)).slice(ast.pos(issues[0].sourceNode), ast.end(issues[0].sourceNode)).trim(), "!1");
    assert.equal(compiled.artifacts.size, 0, "no refused Source reaches a native artifact");
  });
}
