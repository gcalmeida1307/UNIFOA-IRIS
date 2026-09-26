# Migração incremental do SOFIA para o IRIS

| Capacidade | Estado no IRIS | Próximo trabalho verificável |
| --- | --- | --- |
| Direito, medicina e infraestrutura | Módulos já existem na base LUMINA | Inventariar documentos do SOFIA, direitos de uso e versões; importar por domínio, testar consultas com página correta. |
| OCR, PDF e XLSX | Extração existente no LUMINA | Testar o Vade Mecum integral e planilhas reais; contagem e cálculo devem operar sobre todas as linhas, nunca sobre amostras de RAG. |
| Políticas de acesso | Escopos por domínio existentes | Comparar com políticas do SOFIA; negar consulta cruzada e auditar antes de integrar fontes internas. |
| Zabbix e RCA | Ainda não migrados | Adaptador de leitura com contrato de evidência, testes com alertas reais e ações externas explicitamente autorizadas. |
| Provedores e MCP | Adaptadores no LUMINA | Migrar apenas capacidades necessárias, uma por vez, medindo cobertura, custo e latência. |

## Contrato de evidência

Cada resultado deve carregar domínio, documento e versão, página ou linha, trecho, origem, instante de captura e permissão. A resposta não deve promover uma conclusão se a fonte citada não sustentar a afirmação. Em comparações, recuperar os dois lados explicitamente; se um faltar, explicar a lacuna.

## Critérios antes de demonstrar como produto jurídico

1. “Como funciona o usucapião?” não pode usar texto sobre jornada de trabalho. Deve admitir via extrajudicial quando documentada e evitar afirmações universais sobre ônus.
2. “Cláusula 2ª, § 1º, da CCT × art. 444, parágrafo único, da CLT” deve consultar apenas os dois PDFs escolhidos, citar ambos e distinguir salário de diploma superior.
3. “Assédio × importunação” deve recuperar os dispositivos pertinentes e a CCT quando relevante, sem cruzar dados privados entre módulos.
4. Perguntas sobre planilhas exigem contagem integral e resultado reproduzível. Alerta Zabbix deve identificar horário, host, trigger e leituras antes de sugerir causa.

Promova cada integração somente após testes de resposta, relevância de fontes, permissões, tempo e custo. O avaliador por modelo ajuda a revisar, mas não prova correção jurídica.
