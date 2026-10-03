export class Tokenizer {
  static tokenize(text: string): string[] {
    // Split by spaces to allow out-of-order matching for separate terms
    return text.split(/\s+/).filter(Boolean);
  }

  static getSegments(text: string): string[] {
    // Split by common separators (camelCase, snake_case, slashes)
    // E.g., "src/components/CommandPalette" -> ["src", "components", "Command", "Palette"]
    return text.split(/[-_/\\]|(?=[A-Z])/).filter(Boolean);
  }
}
