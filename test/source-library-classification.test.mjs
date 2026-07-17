import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifySourceStandardLibraryType,
} from "../dist/source/csharp-source-semantics/source-type-classification.js";

test("source-library classification traverses selected declarations once", () => {
  const sourceFile = { Kind: 1, FileName: "/project/.tsonic/source-profiles/js/library.d.ts" };
  const declarationName = { Kind: 2 };
  const declaration = { Kind: 3 };
  const symbol = { Flags: 1, Name: "Array" };
  const type = { flags: 1 };
  let declarationQueries = 0;
  let sourceFileQueries = 0;

  const context = {
    compiler: {
      ast: {
        getSourceFile: (node) => {
          assert.equal(node, declaration);
          sourceFileQueries += 1;
          return sourceFile;
        },
        getFileName: (node) => {
          assert.equal(node, sourceFile);
          return sourceFile.FileName;
        },
        name: (node) => {
          assert.equal(node, declaration);
          return declarationName;
        },
        text: (node) => {
          assert.equal(node, declarationName);
          return "Array";
        },
      },
      checker: {
        getTypeSymbol: (subject) => {
          assert.equal(subject, type);
          return symbol;
        },
        getSymbolDeclarations: (subject) => {
          assert.equal(subject, symbol);
          declarationQueries += 1;
          return [declaration];
        },
      },
      typeShape: {
        isTypeReference: (subject) => {
          assert.equal(subject, type);
          return false;
        },
      },
    },
  };

  const expected = {
    name: "Array",
    category: "array",
    mutability: "mutable",
  };
  assert.deepEqual(classifySourceStandardLibraryType(type, context), expected);
  assert.deepEqual(classifySourceStandardLibraryType(type, context), expected);
  assert.equal(declarationQueries, 1);
  assert.equal(sourceFileQueries, 1);
});

test("source-library classification maps the selected PromiseLike profile declaration to the Promise carrier family", () => {
  const sourceFile = { Kind: 1, FileName: "/project/.tsonic/source-profiles/js/library.d.ts" };
  const declarationName = { Kind: 2 };
  const declaration = { Kind: 3 };
  const symbol = { Flags: 1, Name: "PromiseLike" };
  const type = { flags: 1 };
  const context = {
    compiler: {
      ast: {
        getSourceFile: () => sourceFile,
        getFileName: () => sourceFile.FileName,
        name: () => declarationName,
        text: () => "PromiseLike",
      },
      checker: {
        getTypeSymbol: () => symbol,
        getSymbolDeclarations: () => [declaration],
      },
      typeShape: {
        isTypeReference: () => false,
      },
    },
  };

  assert.deepEqual(classifySourceStandardLibraryType(type, context), {
    name: "PromiseLike",
    category: "promise",
  });
});
