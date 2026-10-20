export const csharpNativePrefixOperators = Object.freeze({
  "unary-plus": "+", "unary-negation": "-", "logical-not": "!", "ones-complement": "~",
} as const);

export const csharpNativeBinaryOperators = Object.freeze({
  addition: "+", subtraction: "-", multiplication: "*", division: "/", modulus: "%", "bitwise-and": "&",
  "bitwise-or": "|", "exclusive-or": "^", "left-shift": "<<", "right-shift": ">>", "unsigned-right-shift": ">>>",
  equality: "==", inequality: "!=", "less-than": "<", "less-than-or-equal": "<=", "greater-than": ">", "greater-than-or-equal": ">=",
} as const);
