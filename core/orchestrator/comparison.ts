import type { ComparativeFinding, Evidence } from '../types.js';

function words(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function comparisonIntent(question: string) {
  return /\b(compar|confront|relac|cruz|diferen|diverg|converg|contrad|conflit|incompat|discrep|brech|irregular|problema|risco|versus|vs\b|frente a|face a|a luz de|sob a otica|quando olhamos|em relacao a|pontos? em comum)/u.test(words(question));
}

/** Match user-mentioned filenames without confusing short generic names with subjects. */
export function namedDocuments(question: string, documents: { id: string; name: string }[]) {
  const normalized = ' ' + words(question) + ' ';
  return documents.filter(document => {
    const base = words(document.name.replace(/\.[^.]+$/, ''));
    if (base.length < 4) return false;
    return normalized.includes(' ' + base + ' ') || base.split(' ').some(token => token.length >= 4 && /[a-z]/.test(token) && normalized.includes(' ' + token + ' '));
  }).map(document => document.id);
}

export function comparisonSources(question: string, documents: { id: string; name: string }[], selectedIds?: string[]) {
  if (!comparisonIntent(question)) return [];
  const named = namedDocuments(question, documents);
  if (named.length >= 2) return named;
  if (selectedIds && selectedIds.length >= 2) return selectedIds;
  return [];
}

export function validComparisonFindings(findings: ComparativeFinding[], sources: Evidence[], requiredIds: string[] = []) {
  const valid = findings.filter(finding => {
    const left = sources[finding.leftCitation - 1], right = sources[finding.rightCitation - 1];
    return left && right && left.documentId !== right.documentId;
  });
  const covered = new Set(valid.flatMap(finding => [sources[finding.leftCitation - 1].documentId, sources[finding.rightCitation - 1].documentId]));
  return requiredIds.every(id => covered.has(id)) ? valid : [];
}

/** Evidence excerpts come from stored originals, never model-written quotations. */
export function comparisonReport(findings: ComparativeFinding[], sources: Evidence[]) {
  const label = (source: Evidence) => `${source.title}, ${source.page ? 'p. ' + source.page : 'trecho ' + source.chunk}`;
  const sections = findings.map((finding, index) => {
    const left = sources[finding.leftCitation - 1], right = sources[finding.rightCitation - 1];
    return `### Confronto ${index + 1}\n\n` +
      `**Fonte A (${label(left)}) [${finding.leftCitation}]:** ${left.text.slice(0, 450)}\n\n` +
      `**Fonte B (${label(right)}) [${finding.rightCitation}]:** ${right.text.slice(0, 450)}\n\n` +
      `**Relação:** ${finding.relation}\n\n**Condições e limites:** ${finding.condition}\n\n**Conclusão condicionada:** ${finding.conclusion}`;
  }).join('\n\n');
  return sections + '\n\nCobertura: esta análise considera somente os trechos recuperados nesta consulta; não atesta a leitura integral dos documentos nem a inexistência de outros conflitos.';
}
