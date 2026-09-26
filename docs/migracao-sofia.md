# Migração incremental do SOFIA para o IRIS

| Capacidade | Estado no IRIS | Próximo trabalho verificável |
| --- | --- | --- |
| Direito, medicina e infraestrutura | Módulos já existem na base LUMINA | Inventariar documentos do SOFIA, direitos de uso e versões; importar por domínio, testar consultas com página correta. |
| OCR, PDF e XLSX | Extração existente no LUMINA; contagem e soma integrais adicionadas | Testar o Vade Mecum integral e planilhas reais com várias abas, datas e fórmulas. |
| Contas e políticas de acesso | Solicitação, aprovação pela AG000001, ativação com 2FA, recuperação e escopos por domínio disponíveis no modo native | Configurar o primeiro administrador, testar a interface com PostgreSQL real e definir processo de entrega segura de tokens. Não copiar senhas nem tabelas de usuários do SOFIA. |
| Temas e avaliação | Agregação de termos repetidos, avaliações positivas/negativas e abstenções por módulo, visível só à administração global | Medir utilidade com consultas reais e revisar temas sem evidência; consultas individuais não aparecem no painel. |
| Zabbix e RCA | Consulta de problemas por host exato adicionada; RCA ainda pendente | Configurar credencial apenas de leitura, testar com alertas reais e cruzar métricas antes de sugerir causa. |
| Provedores e MCP | Adaptadores no LUMINA | Migrar apenas capacidades necessárias, uma por vez, medindo cobertura, custo e latência. |

O cadastro nativo agora está implementado, mas não autoriza migrar automaticamente identidades nem senhas dos bancos separados. O acervo do SOFIA continua selecionado manualmente por módulo. A expansão automática do acervo, a análise de causa raiz com métricas reais do Zabbix e integrações externas adicionais ainda não fazem parte desta entrega. A qualidade do resumo integral depende do modelo Ollama instalado e precisa de uma avaliação com documentos reais; seções sem aprovação de evidência são omitidas.

## Contrato de evidência

Cada resultado deve carregar domínio, documento e versão, página ou linha, trecho, origem, instante de captura e permissão. A resposta não deve promover uma conclusão se a fonte citada não sustentar a afirmação. Em comparações, recuperar os dois lados explicitamente; se um faltar, explicar a lacuna.

## Critérios antes de demonstrar como produto jurídico

1. “Como funciona o usucapião?” não pode usar texto sobre jornada de trabalho. Deve admitir via extrajudicial quando documentada e evitar afirmações universais sobre ônus.
2. “Cláusula 2ª, § 1º, da CCT × art. 444, parágrafo único, da CLT” deve consultar apenas os dois PDFs escolhidos, citar ambos e distinguir salário de diploma superior.
3. “Assédio × importunação” deve recuperar os dispositivos pertinentes e a CCT quando relevante, sem cruzar dados privados entre módulos.
4. Perguntas sobre planilhas exigem contagem integral e resultado reproduzível. Alerta Zabbix deve identificar horário, host, trigger e leituras antes de sugerir causa.

Promova cada integração somente após testes de resposta, relevância de fontes, permissões, tempo e custo. O avaliador por modelo ajuda a revisar, mas não prova correção jurídica.
