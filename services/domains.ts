export const domains = [
  { id: 'almoxarifado', name: 'Almoxarifado', description: 'Materiais, inventário, compras e movimentações', icon: 'files', color: '#818cf8' },
  { id: 'departamento-pessoal', name: 'Departamento Pessoal', description: 'Admissões, folha, férias e rotinas trabalhistas', icon: 'users', color: '#f472b6' },
  { id: 'prefeitura', name: 'Administração Pública', description: 'Serviços públicos, contratos e prestação de contas', icon: 'building', color: '#60a5fa' },
  { id: 'geral', name: 'Conhecimento geral', description: 'Base transversal da organização', icon: 'sparkles', color: '#818cf8' },
  { id: 'medicina', name: 'Medicina', description: 'Documentos e protocolos clínicos', icon: 'heart', color: '#53c5d8' },
  { id: 'direito', name: 'Direito', description: 'Legislação e jurisprudência', icon: 'scale', color: '#f38ba8' },
  { id: 'infraestrutura', name: 'Infraestrutura', description: 'Redes, servidores e monitoramento', icon: 'server', color: '#59d5a3' },
  { id: 'financeiro', name: 'Financeiro', description: 'Indicadores e movimentações', icon: 'chart', color: '#f5cd77' },
  { id: 'contabilidade', name: 'Contabilidade', description: 'Relatórios e documentos', icon: 'book', color: '#70b4f4' },
  { id: 'pessoas', name: 'Gestão de Pessoas', description: 'Políticas e conhecimento de RH', icon: 'users', color: '#b89afa' },
  { id: 'secretaria', name: 'Secretaria', description: 'Processos e documentos', icon: 'files', color: '#8da6ff' },
  { id: 'empresarial', name: 'Gestão Empresarial', description: 'Planejamento e indicadores', icon: 'building', color: '#df9de8' }
] as const;
export const domainIds: string[] = domains.map(d => d.id);

/** Preserve existing IRIS identifiers; never merge DP into RH. */
export const sourceDomainMap: Record<string, string> = {
  ...Object.fromEntries(domainIds.map(id => [id, id])),
  'recursos-humanos': 'pessoas', 'gestao-empresarial': 'empresarial'
};
