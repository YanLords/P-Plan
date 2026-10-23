export interface ChangeGroup {
  title: string;
  items: string[];
}

/** `**gras**`, `` `code` `` et `_italique_` : on affiche du texte simple. */
const plain = (line: string) => line.replace(/\*\*|`|_/g, '').trim();

export interface ChangelogEntry {
  version: string;
  date: string;
  groups: ChangeGroup[];
}

/**
 * Section du journal des modifications pour une version donnée.
 * `text` est le CHANGELOG.md embarqué dans le binaire (`?raw`) : pas d'appel
 * réseau, et les nouveautés affichées sont celles du code réellement installé.
 * L'analyse est séparée de l'import pour rester testable hors de Vite.
 */
export function changelogFor(version: string, text: string): ChangelogEntry | null {
  if (!version) return null;
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start < 0) return null;

  const date = (lines[start].match(/(\d{4}-\d{2}-\d{2})/) ?? [])[1] ?? '';
  const groups: ChangeGroup[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## [')) break;
    if (line.startsWith('### ')) {
      groups.push({ title: line.slice(4).trim(), items: [] });
    } else if (line.startsWith('- ') && groups.length) {
      groups[groups.length - 1].items.push(plain(line.slice(2)));
    }
  }
  return { version, date, groups: groups.filter((g) => g.items.length > 0) };
}
