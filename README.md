# LUMINA

Este é o [projeto final LUMINA](https://github.com/gcalmeida1307/UNIFOA-LUMINA), construído a partir do [LUMINA anterior](https://github.com/gcalmeida1307/mcp-lumina) e de capacidades selecionadas do [SOFIA](https://github.com/gcalmeida1307/mpc-sofia-unifoa). O banco PostgreSQL existente continua com o nome interno `iris`: renomeá-lo não é necessário para mudar a identidade do aplicativo e poderia interromper o acesso às contas já migradas.

## Endereço local

A instalação validada está em `C:\Users\glauco.almeida\Documents\UNIFOA-IRIS`, com acesso em **http://127.0.0.1:8081**. Para iniciar novamente, execute `start.ps1` nessa pasta; não abra uma segunda instância se o servidor já estiver ativo. A porta 8080 estava ocupada e foi preservada. Não é necessário editar o arquivo hosts. Este endereço funciona apenas neste computador. Consulte [a entrega e os testes](docs/ENTREGA-LOCAL.md).

## O que já funciona nesta base

- Conversa e módulos com acesso por domínio; ingestão de TXT, MD, CSV, JSON, PDF, DOCX e XLSX; OCR de PDF quando Poppler e Tesseract estão disponíveis.
- PDFs mistos têm OCR por página quando a camada de texto daquela página é insuficiente. Imagens suportadas passam pelo Tesseract; `IRIS_OCR_LANGUAGES=por+eng` exige os dois idiomas instalados. Mais de 120 páginas digitalizadas no mesmo PDF exigem dividir o arquivo para evitar processamento sem limite. Os trechos novos guardam a página real de cada PDF.
- Confrontos entre documentos funcionam em qualquer módulo: perguntas como “quais problemas em A à luz de B?” acionam busca nos dois arquivos e exigem, na resposta, trechos originais com documento, página ou número do trecho e condições da conclusão. A ausência de um lado resulta em abstenção. Selecione explicitamente os arquivos no chat para eliminar ambiguidades. Documentos já indexados mantêm o índice anterior: após backup, exclua e envie novamente o arquivo pela interface para obter a nova extração e os metadados de página. Um upload idêntico sem a exclusão é reconhecido como duplicado.
- Recuperação lexical e semântica, geração com fontes, revisão e trilha de execução herdadas do LUMINA.
- Verificação adicional para perguntas com um assunto explícito: um trecho sem o assunto no título ou texto não entra só porque seu vetor é semelhante. Citações válidas permanecem junto das afirmações; uma citação inventada é removida e a revisão pode rejeitar a resposta.
- Contagem de linhas e soma de colunas em XLSX/CSV por leitura do arquivo original completo. Consultas ambíguas pedem arquivo, aba ou coluna. Valores não numéricos são informados e ignorados na soma.
- Consulta somente de leitura aos problemas de um host exato no Zabbix, restrita a usuários com acesso a `infraestrutura`, mediante `ZABBIX_API_URL` HTTPS e `ZABBIX_API_TOKEN`.
- No modo `AUTH_MODE=native`, o fluxo de contas do SOFIA: solicitação na tela de entrada, aprovação exclusiva pela conta AG000001, ativação com senha e 2FA, recuperação de senha com token e visualização administrativa de temas repetidos e avaliações por módulo. O fluxo usa o banco configurado para o IRIS; nenhuma conta do SOFIA é migrada automaticamente.

## Executar

Requer Node.js 24 ou superior. Copie `.env.example` para `.env`, configure o modelo e use `npm ci`, `npm test` e `npm run dev`. A geração por IA depende de um provedor configurado; sem ele, o sistema mostra trechos recuperados.

Para criar contas no PostgreSQL do IRIS, configure `AUTH_MODE=native`, `LUMINA_ENCRYPTION_KEY` com 32 bytes hexadecimais, `IRIS_ADMIN_EMAIL` e `IRIS_ADMIN_FIRST_PASSWORD` forte no `.env`. Na primeira inicialização, a conta AG000001 é criada com troca obrigatória de senha e 2FA. Depois do primeiro acesso, remova a senha inicial do arquivo `.env` e reinicie; o administrador existente não é recriado. Solicitações precisam ser aprovadas pela AG000001, que entrega a matrícula e o token de ativação por um canal seguro. A chave de cifragem deve permanecer estável para permitir a leitura dos dados já gravados.

## Contas existentes do LUMINA

Se o LUMINA usa `AUTH_MODE=native` e PostgreSQL, as contas podem ser migradas para o banco exclusivo do IRIS preservando os hashes das senhas. A rotina recriptografa nome, e-mail e segredo 2FA com a chave do IRIS, recalcula o índice de e-mail e mantém código, permissões e estado da conta. Não copia sessões, tokens de recuperação nem documentos; ninguém precisa informar senhas de usuários. Ela nunca altera o banco do LUMINA.

Deixe a instalação do IRIS parada durante a importação. Guarde um backup do banco `iris` e configure no `.env` do IRIS `DATABASE_URL`, `AUTH_MODE=native` e `LUMINA_ENCRYPTION_KEY` (a chave do IRIS, que deve continuar estável). No PowerShell da pasta IRIS, execute primeiro a prévia, apontando para o `.env` **local** do LUMINA:

```powershell
npm run import:lumina-users -- "--lumina-env=C:\caminho\do\LUMINA\.env" --dry-run
```

Se ela informar contas compatíveis e ausência de conflitos, importe com `--apply` no lugar de `--dry-run`. O programa lê as credenciais e as chaves exclusivamente desses arquivos locais, não as imprime e não os altera. Não envie os `.env`, hashes ou resultados com identificadores pessoais. Caso já exista no IRIS uma conta com o mesmo código ou e-mail, a importação para antes de gravar; resolva o conflito com uma decisão explícita. Se a conta `AG000001` não existir na origem, a primeira inicialização em `native` ainda exigirá `IRIS_ADMIN_EMAIL` e `IRIS_ADMIN_FIRST_PASSWORD` para criá-la. Após importar, inicie o IRIS e verifique o acesso de uma conta de teste com a senha e o 2FA atuais do LUMINA; as sessões antigas precisarão de novo login. A migração cria contas independentes: mudanças futuras de senha ou permissões em um sistema não sincronizam automaticamente com o outro.

## Integração do SOFIA

### Migrar os documentos do LUMINA

O LUMINA armazena registros em `documents`, trechos para RAG em `chunks` e originais em `DATA_DIR/objects` ou no bucket S3 configurado. A rotina abaixo copia os três componentes para o IRIS sem alterar a origem. Ela preserva módulo, dono, identificadores, página, texto, vetores e origem da fonte. Documentos com estado `failed` ou `processing` são contados na prévia e ignorados; não podem ser consultados no LUMINA. Conversas, memórias, contas e índices de relações não são documentos e não são copiados por esta rotina.

Pare os dois servidores, faça backup do banco `iris` e dos arquivos originais do IRIS, e execute na pasta `UNIFOA-IRIS`:

```powershell
npm run import:lumina-documents -- "--lumina-env=C:\caminho\do\LUMINA\.env" --dry-run
```

Use o caminho real do `.env` do LUMINA. Se a prévia confirmar que todos os arquivos e trechos consultáveis estão disponíveis e não há conflitos, repita com `--apply`. O script lê as configurações locais dos dois projetos sem imprimi-las. Um arquivo equivalente (mesmo módulo, hash do conteúdo e da origem, contagem de trechos e arquivo original presente) com ID diferente é contado como já existente, sem ser duplicado. Arquivos com o mesmo ID e conteúdo diferente, ou com trechos/arquivo de destino incompletos, continuam bloqueando a migração. O script interrompe a prévia caso um arquivo esteja ausente ou haja conflito; não substitua arquivos ou registros manualmente. Após a cópia, o LUMINA pode reconstruir em segundo plano relações e embeddings quando estiver configurado com um modelo diferente. Teste uma consulta em cada módulo e a leitura de uma planilha original. Mantenha estáveis os caminhos `DATA_DIR` e o bucket de destino; o banco sozinho não contém os arquivos originais.

Para manter os documentos que já constam no destino e copiar somente os que não apresentam colisão de ID/hash, acrescente `--skip-existing` depois de `--dry-run` na prévia e depois de `--apply` na execução. A prévia informa quantos documentos da origem serão ignorados por conflito. Essa opção não corrige registros incompletos no destino; confira se os arquivos existentes podem ser abertos e consultados. A ausência de arquivo original na origem, trechos incompletos na origem ou colisão de arquivo sem registro correspondente continuam bloqueando a execução. Faça backup antes de usar `--apply`.

Veja [docs/migracao-sofia.md](docs/migracao-sofia.md). Nenhum documento do SOFIA foi copiado automaticamente. A importação precisa respeitar autorização, versão e tamanho dos arquivos; a aplicação e o índice não devem publicar dados institucionais só porque um repositório de origem é público.

Para inventariar arquivos locais já revisados do SOFIA, use `npm run import:sofia -- <caminho/knowledge/direito> direito --dry-run`. Em ambiente de desenvolvimento local, `AUTH_MODE=local npm run import:sofia -- <caminho/knowledge/direito> direito --import` importa apenas arquivos diretamente nessa pasta. Subpastas de links ficam de fora. Para instâncias em produção, use upload autenticado na interface.

Este código deriva do LUMINA no commit `96acad7a0a686a48cdadbab93a67835f2a84465c`. A comparação foi feita com o SOFIA no commit `1aa1a06a8d7c2bba41381f3326fac33a83db0187`.
# Sínteses extensas

Pedidos explícitos de resumo, síntese, redação, artigo ou relatório usam seções independentes com citações e revisão de evidências. Com o Ollama configurado, cada seção faz chamadas locais ao modelo e a resposta completa fica salva na conversa. O modo examina até quatro documentos pertinentes e até 48 trechos distribuídos entre eles por execução; quando há mais material, informa a cobertura parcial na própria resposta. Uma síntese extensa pode demorar mais do que uma pergunta direta. Para um documento específico, informe seu título na pergunta; a API também aceita `documentIds` (até cinco IDs, sujeitos ao domínio autorizado). O IRIS não deve afirmar que examinou integralmente um documento maior do que o limite.

Para percorrer integralmente os documentos escolhidos, abra **Pesquisa integral em segundo plano** no chat, selecione os arquivos e escreva a tarefa na caixa da pergunta. O avanço é gravado no banco após cada lote de seis trechos; uma reinicialização pausa a tarefa e o botão **Retomar** continua do último lote salvo. Se o documento mudar, crie uma nova pesquisa. Seções que não passarem na revisão são omitidas e identificadas no resultado. O tempo e o volume de texto crescem com o acervo, podendo chegar a muitas chamadas ao Ollama; a tarefa pode ser cancelada.

Os antigos 4.000 tokens eram um parâmetro `max_tokens` da chamada de resposta comum em `core/orchestrator/graph.ts`, enviado ao provedor selecionado, inclusive Ollama. Agora use `IRIS_RESPONSE_MAX_TOKENS` (padrão 8192) e `IRIS_SECTION_MAX_TOKENS` (padrão 4096). São tetos por chamada, não cobranças ou promessas de que um modelo consiga produzir esse tamanho. O limite de 4.000 **caracteres** da pergunta no chat é diferente. O modelo local ainda tem sua própria janela de contexto e restrições de memória; a pesquisa integral distribui os trechos em chamadas separadas. Para operar offline, use `LLM_PROVIDER=ollama` e embeddings no endpoint local ou somente busca textual, sem provedores de nuvem configurados.
