export const integrationCatalog = [
  { id: 'zabbix', name: 'Zabbix', category: 'Monitoramento', status: 'not_configured', description: 'Leitura de problemas por host, restrita ao módulo infraestrutura; configure token de leitura.' },
  { id: 'fhir', name: 'HL7 FHIR', category: 'Saúde', status: 'not_configured', description: 'Conectar por servidor MCP autorizado para medicina.' },
  { id: 'erp', name: 'ERP / Financeiro', category: 'Gestão', status: 'not_configured', description: 'Conectar por servidor MCP autorizado para o domínio correspondente.' },
  { id: 'institutional', name: 'APIs institucionais', category: 'Conhecimento', status: 'not_configured', description: 'Adicionar adaptador ou servidor MCP de leitura.' }
];
