export function maskNonCode(text) {
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
