import { readArchitectureTypeScript } from "../../../tsonic/test/architecture/tooling/typescript-source.mjs";

export function createSourceSyntaxIndex(sourceFiles) {
  const files = new Map(sourceFiles);
  const source = readArchitectureTypeScript(files);
  const expressions = new Map([...files.keys()].map(file => [file, []]));
  const typeReferences = new Map([...files.keys()].map(file => [file, []]));
  for (const file of source.sourceFiles) {
    const path = source.ast.getFileName(file).slice("/architecture/".length);
    const ranges = expressions.get(path);
    const references = typeReferences.get(path);
    if (ranges === undefined || references === undefined) throw new Error(`Foreign source syntax file: ${path}`);
    const visit = node => {
      if (source.ast.is.IsRegularExpressionLiteral(node)) {
        ranges.push({ start: source.ast.pos(node), end: source.ast.end(node) });
      } else {
        if (source.ast.is.IsTypeReferenceNode(node)) {
          const name = source.ast.as.AsTypeReferenceNode(node).TypeName;
          const range = source.ast.authoredRange(name);
          if (source.ast.is.IsIdentifier(name) && range.kind === "authored") {
            references.push(Object.freeze({ name: source.ast.text(name), start: range.start, end: range.end }));
          }
        }
        source.ast.forEachChild(node, visit);
      }
    };
    visit(file);
  }
  const indexed = new Map([...files].map(([file, text]) => [file, Object.freeze({
    code: maskNonCode(text, expressions.get(file)),
    typeReferences: Object.freeze(typeReferences.get(file)),
  })]));
  return file => {
    const syntax = indexed.get(file);
    if (syntax === undefined) throw new Error(`Source syntax requires its exact input file: ${file}`);
    return syntax;
  };
}

function maskNonCode(text, ranges) {
  text = maskRegularExpressionLiterals(text, ranges);
  const output = text.split("");
  const stack = [{ kind: "code", templateExpression: false, braceDepth: 0 }];
  const mask = (index) => {
    if (output[index] !== "\n" && output[index] !== "\r") {
      output[index] = " ";
    }
  };

  for (let index = 0; index < text.length; index += 1) {
    const frame = stack[stack.length - 1];
    const character = text[index];
    const next = text[index + 1];
    if (frame.kind === "line-comment") {
      if (character === "\n") {
        stack.pop();
      } else {
        mask(index);
      }
      continue;
    }
    if (frame.kind === "block-comment") {
      mask(index);
      if (character === "*" && next === "/") {
        mask(index + 1);
        index += 1;
        stack.pop();
      }
      continue;
    }
    if (frame.kind === "quote") {
      mask(index);
      if (character === "\\") {
        mask(index + 1);
        index += 1;
      } else if (character === frame.delimiter) {
        stack.pop();
      }
      continue;
    }
    if (frame.kind === "template") {
      mask(index);
      if (character === "\\") {
        mask(index + 1);
        index += 1;
      } else if (character === "`") {
        stack.pop();
      } else if (character === "$" && next === "{") {
        mask(index + 1);
        index += 1;
        stack.push({ kind: "code", templateExpression: true, braceDepth: 0 });
      }
      continue;
    }
    if (frame.templateExpression && character === "}") {
      if (frame.braceDepth === 0) {
        mask(index);
        stack.pop();
      } else {
        frame.braceDepth -= 1;
      }
      continue;
    }
    if (frame.templateExpression && character === "{") {
      frame.braceDepth += 1;
      continue;
    }
    if (character === "/" && next === "/") {
      mask(index);
      mask(index + 1);
      index += 1;
      stack.push({ kind: "line-comment" });
    } else if (character === "/" && next === "*") {
      mask(index);
      mask(index + 1);
      index += 1;
      stack.push({ kind: "block-comment" });
    } else if (character === "'" || character === '"') {
      mask(index);
      stack.push({ kind: "quote", delimiter: character });
    } else if (character === "`") {
      mask(index);
      stack.push({ kind: "template" });
    }
  }
  return output.join("");
}

function maskRegularExpressionLiterals(text, ranges) {
  const encoded = Buffer.from(text);
  const parts = [];
  let previous = 0;
  for (const range of ranges.sort((left, right) => left.start - right.start)) {
    parts.push(encoded.subarray(previous, range.start).toString("utf8"),
      encoded.subarray(range.start, range.end).toString("utf8").replace(/[^\r\n]/g, " "));
    previous = range.end;
  }
  parts.push(encoded.subarray(previous).toString("utf8"));
  return parts.join("");
}
