# Entrega local — 26/09/2026

O projeto de trabalho está em `C:\Users\glauco.almeida\Documents\UNIFOA-IRIS`. O servidor local foi iniciado em http://127.0.0.1:8081. A aplicação mantém a identidade visual e o mecanismo de chat do LUMINA, com banco e autenticação próprios do IRIS.

## Uso

Entre com sua conta do IRIS e o código 2FA. Para iniciar após reiniciar o computador, abra PowerShell na pasta do projeto e execute `./start.ps1`. PostgreSQL e Ollama devem estar disponíveis. O script compila e inicia a aplicação; não execute uma segunda instância na mesma porta. A porta 8080 já estava ocupada e o processo existente foi preservado.

As pastas originais Downloads\UNIFOA-IRIS, Documents\LUMINA e Documents\sofia foram preservadas. A entrega foi feita localmente, sem publicação das alterações no GitHub.

## Validação concluída

- Dependências instaladas com `npm ci`; compilação de produção e checagem TypeScript aprovadas.
- 72 testes automatizados aprovados, sem falhas.
- Teste real do provedor OpenAI, modelo gpt-4o-mini, usando a configuração funcional do LUMINA: pergunta em português sobre documento de teste em inglês, resposta em português com citação e revisão aprovada. A pergunta seguinte manteve o contexto e também foi aprovada. Evidência: `work/validation/chat-real.json`.
- Tesseract com por+eng e Poppler: extração real de imagem JPEG e PDF contendo somente imagem aprovada. Evidência: `work/validation/ocr-real.json`.
- 120 documentos prontos e 30.496 trechos. Nenhum arquivo original ausente e nenhuma divergência entre a contagem de trechos declarada e o banco. Evidência: `work/validation/corpus-final.json`.
- API `/api/health` respondeu `status: ok`; página inicial HTTP 200; consulta a documentos sem autenticação HTTP 401. Tela de entrada carregada no navegador.

## Migração e melhorias

O acervo do LUMINA forneceu 66 documentos ausentes. Três índices de arquivos idênticos foram reconciliados com a versão funcional do LUMINA, incluindo um documento anteriormente com falha. O SOFIA forneceu outros cinco documentos; treze já estavam presentes. Manifestações detalhadas estão em `work/migration/`.

Foram acrescentados os domínios almoxarifado, departamento pessoal e administração pública; planejamento de busca em português e inglês; correção de continuidade de conversa e das citações exigidas pela revisão; distinção entre pergunta sobre artigo de lei e solicitação de redação de artigo; cálculos e filtros suportados em tabelas; seleção de documentos no chat; interface de administração de usuários e consulta Zabbix; mascaramento de padrões de dados pessoais nas mensagens ao modelo externo; OCR de imagens e PDF em português e inglês.

Backup anterior à migração: `work/backups/2026-09-26T16-53-49-187Z/iris.dump`, acompanhado da configuração privada. Esses arquivos contêm dados sensíveis e não devem ser publicados. A chave de cifragem e a identidade do banco IRIS foram preservadas.

## Limites e pendências

Esta entrega valida a instalação e os cenários descritos; não representa uma certificação de qualidade 10/10 ou garantia de respostas sempre corretas. A validação real do chat usou documentos sintéticos isolados, sem alterar o acervo de produção. O fluxo completo de login com 2FA e operações administrativas não foi exercitado com a conta do usuário.

Integrações externas, como Zabbix, FHIR e Tasy, não estão homologadas nesta entrega; dependem de configuração, implementação quando ausente e testes no ambiente correspondente. Não foi feita uma cópia integral de todas as funcionalidades do SOFIA: versões históricas, capturas web e candidatos gerados foram excluídos da promoção automática ao acervo. O mascaramento é baseado em padrões e não garante anonimização integral. Consultas tabulares fora das operações suportadas e avaliações extensas de qualidade por domínio ainda exigem trabalho específico.

Os testes de compilação emitiram apenas avisos sobre tamanho dos pacotes JavaScript; otimização de carregamento continua possível. A instalação não foi configurada como serviço automático do Windows.
