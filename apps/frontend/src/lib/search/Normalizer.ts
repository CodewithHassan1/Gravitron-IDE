export class Normalizer {
  static normalize(text: string): string {
    // Basic normalization: lowercases, removes diacritics.
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  static getAcronym(text: string): string {
    // E.g. "CommandPaletteStore" -> "cps", "command-palette" -> "cp"
    const words = text.split(/[-_/\sA-Z]/).filter(Boolean);
    const capitals = text.match(/[A-Z]/g) || [];
    
    // If it's mostly camelCase or PascalCase
    if (capitals.length > 0 && words.length <= capitals.length + 1) {
      const pascalAcronym = text.charAt(0) + capitals.join('');
      return this.normalize(pascalAcronym);
    }

    return words.map(w => w.charAt(0)).join('').toLowerCase();
  }
}
