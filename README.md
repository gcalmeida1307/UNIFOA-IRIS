# IRIS

IRIS parte do código do [LUMINA](https://github.com/gcalmeida1307/mcp-lumina) para preservar o fluxo de planejar, recuperar, responder e revisar. O [SOFIA](https://github.com/gcalmeida1307/mpc-sofia-unifoa) é a referência para migrar acervo e integrações por domínio. Esta é uma **primeira etapa executável**, não a fusão integral dos dois sistemas.

## O que já funciona nesta base

- Conversa e módulos com acesso por domínio; ingestão de TXT, MD, CSV, JSON, PDF, DOCX e XLSX; OCR de PDF quando Poppler e Tesseract estão disponíveis.
- Recuperação lexical e semântica, geração com fontes, revisão e trilha de execução herdadas do LUMINA.
- Verificação adicional para perguntas com um assunto explícito: um trecho sem o assunto no título ou texto não entra só porque seu vetor é semelhante. Citações válidas permanecem junto das afirmações; uma citação inventada é removida e a revisão pode rejeitar a resposta.

## Executar

Requer Node.js 24 ou superior. Copie `.env.example` para `.env`, configure o modelo e use `npm ci`, `npm test` e `npm run dev`. A geração por IA depende de um provedor configurado; sem ele, o sistema mostra trechos recuperados.

## Integração do SOFIA

Veja [docs/migracao-sofia.md](docs/migracao-sofia.md). Nenhum documento do SOFIA foi copiado automaticamente. A importação precisa respeitar autorização, versão e tamanho dos arquivos; a aplicação e o índice não devem publicar dados institucionais só porque um repositório de origem é público.

Este código deriva do LUMINA no commit `96acad7a0a686a48cdadbab93a67835f2a84465c`. A comparação foi feita com o SOFIA no commit `1aa1a06a8d7c2bba41381f3326fac33a83db0187`.
