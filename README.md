# IRIS

IRIS parte do código do [LUMINA](https://github.com/gcalmeida1307/mcp-lumina) para preservar o fluxo de planejar, recuperar, responder e revisar. O [SOFIA](https://github.com/gcalmeida1307/mpc-sofia-unifoa) é a referência para migrar acervo e integrações por domínio. Esta é uma **primeira etapa executável**, não a fusão integral dos dois sistemas.

## O que já funciona nesta base

- Conversa e módulos com acesso por domínio; ingestão de TXT, MD, CSV, JSON, PDF, DOCX e XLSX; OCR de PDF quando Poppler e Tesseract estão disponíveis.
- Recuperação lexical e semântica, geração com fontes, revisão e trilha de execução herdadas do LUMINA.
- Verificação adicional para perguntas com um assunto explícito: um trecho sem o assunto no título ou texto não entra só porque seu vetor é semelhante. Citações válidas permanecem junto das afirmações; uma citação inventada é removida e a revisão pode rejeitar a resposta.
- Contagem de linhas e soma de colunas em XLSX/CSV por leitura do arquivo original completo. Consultas ambíguas pedem arquivo, aba ou coluna. Valores não numéricos são informados e ignorados na soma.
- Consulta somente de leitura aos problemas de um host exato no Zabbix, restrita a usuários com acesso a `infraestrutura`, mediante `ZABBIX_API_URL` HTTPS e `ZABBIX_API_TOKEN`.
- No modo `AUTH_MODE=native`, o fluxo de contas do SOFIA: solicitação na tela de entrada, aprovação exclusiva pela conta AG000001, ativação com senha e 2FA, recuperação de senha com token e visualização administrativa de temas repetidos e avaliações por módulo. O fluxo usa o banco configurado para o IRIS; nenhuma conta do SOFIA é migrada automaticamente.

## Executar

Requer Node.js 24 ou superior. Copie `.env.example` para `.env`, configure o modelo e use `npm ci`, `npm test` e `npm run dev`. A geração por IA depende de um provedor configurado; sem ele, o sistema mostra trechos recuperados.

Para criar contas no PostgreSQL do IRIS, configure `AUTH_MODE=native`, `LUMINA_ENCRYPTION_KEY` com 32 bytes hexadecimais, `IRIS_ADMIN_EMAIL` e `IRIS_ADMIN_FIRST_PASSWORD` forte no `.env`. Na primeira inicialização, a conta AG000001 é criada com troca obrigatória de senha e 2FA. Depois do primeiro acesso, remova a senha inicial do arquivo `.env` e reinicie; o administrador existente não é recriado. Solicitações precisam ser aprovadas pela AG000001, que entrega a matrícula e o token de ativação por um canal seguro. A chave de cifragem deve permanecer estável para permitir a leitura dos dados já gravados.

## Integração do SOFIA

Veja [docs/migracao-sofia.md](docs/migracao-sofia.md). Nenhum documento do SOFIA foi copiado automaticamente. A importação precisa respeitar autorização, versão e tamanho dos arquivos; a aplicação e o índice não devem publicar dados institucionais só porque um repositório de origem é público.

Para inventariar arquivos locais já revisados do SOFIA, use `npm run import:sofia -- <caminho/knowledge/direito> direito --dry-run`. Em ambiente de desenvolvimento local, `AUTH_MODE=local npm run import:sofia -- <caminho/knowledge/direito> direito --import` importa apenas arquivos diretamente nessa pasta. Subpastas de links ficam de fora. Para instâncias em produção, use upload autenticado na interface.

Este código deriva do LUMINA no commit `96acad7a0a686a48cdadbab93a67835f2a84465c`. A comparação foi feita com o SOFIA no commit `1aa1a06a8d7c2bba41381f3326fac33a83db0187`.
# Sínteses extensas

Pedidos explícitos de resumo, síntese, redação, artigo ou relatório usam seções independentes com citações e revisão de evidências. Com o Ollama configurado, cada seção faz chamadas locais ao modelo e a resposta completa fica salva na conversa. O modo examina até quatro documentos pertinentes e até 48 trechos distribuídos entre eles por execução; quando há mais material, informa a cobertura parcial na própria resposta. Uma síntese extensa pode demorar mais do que uma pergunta direta. Para um documento específico, informe seu título na pergunta; a API também aceita `documentIds` (até cinco IDs, sujeitos ao domínio autorizado). O IRIS não deve afirmar que examinou integralmente um documento maior do que o limite.

Para percorrer integralmente os documentos escolhidos, abra **Pesquisa integral em segundo plano** no chat, selecione os arquivos e escreva a tarefa na caixa da pergunta. O avanço é gravado no banco após cada lote de seis trechos; uma reinicialização pausa a tarefa e o botão **Retomar** continua do último lote salvo. Se o documento mudar, crie uma nova pesquisa. Seções que não passarem na revisão são omitidas e identificadas no resultado. O tempo e o volume de texto crescem com o acervo, podendo chegar a muitas chamadas ao Ollama; a tarefa pode ser cancelada.

Os antigos 4.000 tokens eram um parâmetro `max_tokens` da chamada de resposta comum em `core/orchestrator/graph.ts`, enviado ao provedor selecionado, inclusive Ollama. Agora use `IRIS_RESPONSE_MAX_TOKENS` (padrão 8192) e `IRIS_SECTION_MAX_TOKENS` (padrão 4096). São tetos por chamada, não cobranças ou promessas de que um modelo consiga produzir esse tamanho. O limite de 4.000 **caracteres** da pergunta no chat é diferente. O modelo local ainda tem sua própria janela de contexto e restrições de memória; a pesquisa integral distribui os trechos em chamadas separadas. Para operar offline, use `LLM_PROVIDER=ollama` e embeddings no endpoint local ou somente busca textual, sem provedores de nuvem configurados.
