import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { plan } from '../agents/planner.js';
import { retrieve } from '../rag/retrieval.js';
import { answerInstructions, answerSchema, formatCitedAnswer, validCitations } from '../llmops/evidence.js';
import { generate } from '../llmops/provider.js';
import { config, generationEnabled } from '../../gateway/config.js';
import type { Store } from '../../data/storage/database.js';
import type { ComparativeFinding, ConversationTurn, Evidence, Principal, Run, RunReview, TraceStep } from '../types.js';
import { mergeEvidence } from '../rag/retrieval.js';
import { contextualizeQuestion, conversationPrompt, isAnswerCorrection, relevantMemories } from './context.js';
import { socialReply } from './dialogue.js';
import { canonicalizeConfusables, sanitizeUntrustedText } from '../../data/processing/text.js';
import { reviewAnswer } from '../llmops/review.js';
import { evaluateRun } from '../llmops/evaluation.js';
import { answerGroundedness, answerReviews } from '../../observability/telemetry.js';
import { analyzeStructured, isStructuredQuestion } from '../structured/analysis.js';
import { requestsExtendedWriting, writeExtended } from './longform.js';
import { domainPolicy } from '../../services/domain-policy.js';
import { comparisonIntent, comparisonSources, comparisonReport, validComparisonFindings } from './comparison.js';
const needsStructuredAnalysis = (question: string) => /\b(compare|comparar|comparação|confront|relação|relacione|cruz|cruze|diferen[çc]a|diverg|converg|s[íi]ntese|resum|explique|detalh|risco|causa|consequ[êe]ncia|impacto|pontos? (em comum|distint)|entre .*document)/iu.test(question);
const State = Annotation.Root({
  queries: Annotation<string[]>(), sources: Annotation<Evidence[]>(), answer: Annotation<string>(),
  citations: Annotation<number[]>(), accepted: Annotation<boolean>(), attempts: Annotation<number>(),
  findings: Annotation<ComparativeFinding[]>(), comparison: Annotation<boolean>(), abstain: Annotation<boolean>(), review: Annotation<RunReview | undefined>(), inputTokens: Annotation<number>(), outputTokens: Annotation<number>()
});
export async function orchestrate(store: Store, principal: Principal, question: string, domain: string, agent: boolean, history: ConversationTurn[] = [], conversationId?: string, onStep?: (step: TraceStep) => void, documentIds?: string[]): Promise<Run> {
  const start = Date.now(), runId = crypto.randomUUID(), steps: TraceStep[] = [];
  let tick = start;
  function step(name: string, detail: string) {
    const now = Date.now(); const item = { name, detail, ms: now - tick };
    steps.push(item); onStep?.(item); tick = now;
  }
  const llm = generationEnabled();
  const greeting = socialReply(question);
  if (greeting) {
    step('Conversar', 'Interação social; nenhuma afirmação documental ou chamada ao provedor.');
    const run: Run = { id: crypto.randomUUID(), owner: principal.id, domain, conversationId, question, createdAt: new Date().toISOString(), answer: greeting, sources: [], steps, mode: 'extractive', status: 'completed', durationMs: Date.now() - start, inputTokens: 0, outputTokens: 0 };
    await store.saveRun(run); await store.audit(principal.id, 'query.completed', run.id);
    return run;
  }
  const normalizedQuestion = canonicalizeConfusables(sanitizeUntrustedText(question));
  const contextualQuery = contextualizeQuestion(normalizedQuestion, history);
  const conversationContext = conversationPrompt(history, normalizedQuestion);
  const availableDocuments = typeof store.documents === 'function' ? (await store.documents(domain)).filter(doc => doc.status === 'ready') : [];
  if (documentIds?.length) {
    const available = new Set(availableDocuments.map(doc => doc.id));
    if (documentIds.some(id => !available.has(id))) throw new Error('Documento selecionado indisponível neste domínio.');
  }
  const requiredComparisonIds = comparisonSources(normalizedQuestion, availableDocuments, documentIds);
  // Comparing two concepts inside one document needs no second source. The
  // two-source gate applies only when documents themselves are contrasted.
  const comparing = requiredComparisonIds.length >= 2 || comparisonIntent(normalizedQuestion) && /\b(?:dois? documentos?|arquivos?|fontes?|pdfs?)\b/iu.test(normalizedQuestion);
  if (isStructuredQuestion(normalizedQuestion)) {
    const outcome = await analyzeStructured(contextualQuery, (await store.documents(domain)).filter(doc => !documentIds || documentIds.includes(doc.id)));
    step('Analisar planilha', outcome.detail);
    const run: Run = {
      id: runId, owner: principal.id, domain, conversationId, question, createdAt: new Date().toISOString(),
      answer: outcome.answer, sources: outcome.document ? [{ id: outcome.document.id, documentId: outcome.document.id, title: outcome.document.name, text: outcome.detail, chunk: 1, score: 1 }] : [],
      steps, mode: 'extractive', status: outcome.verified ? 'completed' : 'abstained', durationMs: Date.now() - start, inputTokens: 0, outputTokens: 0, workflow: 'structured-analysis-v1'
    };
    await store.saveRun(run); await store.audit(principal.id, 'query.' + run.status, run.id);
    return run;
  }
  if (llm && requestsExtendedWriting(normalizedQuestion) && !comparing) {
    const result = await writeExtended(store, contextualQuery, domain, runId, documentIds);
    step('Sintetizar', `Examinados ${result.examined}/${result.total} trechos de ${result.documents}/${result.totalDocuments} documentos. Seções validadas: ${result.reviews.filter(review => review.verdict === 'pass').length}.`);
    const completed = result.reviews.some(review => review.verdict === 'pass');
    const run: Run = {
      id: runId, owner: principal.id, domain, conversationId, question, createdAt: new Date().toISOString(),
      answer: result.answer, sources: result.sources, steps, mode: 'model',
      status: completed ? 'completed' : 'abstained', workflow: 'extended-evidence-v1',
      durationMs: Date.now() - start, model: config.LLM_MODEL, inputTokens: result.inputTokens, outputTokens: result.outputTokens
    };
    await store.saveRun(run); await store.saveEvaluation?.(evaluateRun(run)); await store.audit(principal.id, 'query.' + run.status, run.id);
    return run;
  }
  const correction = isAnswerCorrection(normalizedQuestion);
  const documentNames = availableDocuments.map(document => document.name);
  const researchMemory = typeof store.memories === 'function' ? await store.memories(principal.id, domain) : [];
  const memoryContext = relevantMemories(contextualQuery, researchMemory).map(memory => `Pergunta: ${memory.question}\nResposta anterior: ${memory.answer}`);
  const workflow = new StateGraph(State)
    .addNode('plan', async () => {
      const structured = agent || needsStructuredAnalysis(normalizedQuestion);
      const p = await plan(contextualQuery, structured || llm, documentNames, memoryContext);
      const queries = [...new Set([contextualQuery, ...p.queries])].slice(0, 5);
      step('Planejar', structured ? queries.length + ' consulta(s); análise estruturada restrita à base autorizada. ' + JSON.stringify(queries) : 'Consulta documental direta.');
      return { queries, comparison: comparing, inputTokens: p.inputTokens, outputTokens: p.outputTokens, attempts: 0 };
    })
    .addNode('retrieve', async state => {
      const primary = await retrieve(store, state.queries[0], domain, documentIds);
      const batches = [primary, ...(await Promise.all(state.queries.slice(1).map(query => retrieve(store, query, domain, documentIds))))];
      let sources = mergeEvidence(batches, 10);
      // Give each explicitly named/selected source its own retrieval attempt.
      // Broad ranking over a large corpus can otherwise return just one side.
      if (state.comparison && requiredComparisonIds.length >= 2) {
        const scoped = await Promise.all(requiredComparisonIds.slice(0, 5).map(async id => {
          const results = await Promise.all(state.queries.map(query => retrieve(store, query, domain, [id])));
          return mergeEvidence(results, 2);
        }));
        const priority = scoped.flat();
        sources = [...new Map([...priority, ...sources].map(item => [item.id, item])).values()].slice(0, 10);
      }
      step('Recuperar', sources.length + ' trecho(s) de ' + new Set(sources.map(source => source.documentId)).size + ' documento(s) no domínio ' + domain + '. Consultas: ' + state.queries.length + '. Documentos: ' + [...new Set(sources.map(source => source.title))].join(' | '));
      return { sources };
    })
    .addNode('generate', async state => {
      if (!state.sources.length) {
        step('Responder', 'Abstenção: nenhuma evidência relevante.');
        return { answer: 'Não encontrei evidências suficientes nos documentos deste domínio para responder. Adicione uma fonte ou reformule a pergunta.', abstain: true, citations: [], accepted: true };
      }
      if (!llm) {
        step('Responder', 'Modo sem chave: trechos recuperados, sem síntese por IA.');
        return { answer: 'Encontrei estes trechos na base de conhecimento. A síntese por IA ficará disponível após configurar o provedor.\n\n' + state.sources.slice(0, 3).map((s, i) => '[' + (i + 1) + '] ' + s.text).join('\n\n'), citations: state.sources.slice(0, 3).map((_, i) => i + 1), findings: [], abstain: false, accepted: true };
      }
      const result = await generate([
        { role: 'system', content: answerInstructions + '\n' + domainPolicy(domain) + (state.comparison ? '\nExamine separadamente cada documento citado. Cada confronto exige dois trechos de documentos distintos e uma conclusão condicionada. Preencha findings para cada confronto; se faltar qualquer lado, abstenha-se da conclusão. Cite títulos, páginas quando fornecidas e condições de aplicação, sem inventar números de página. Textos de outros documentos podem contextualizar, mas não substituir as duas fontes do confronto.' : '') },
        { role: 'user', content: JSON.stringify({ question: contextualQuery, userMessage: normalizedQuestion, feedbackMode: correction, conversation: conversationContext, researchMemory: memoryContext, sources: state.sources.map((s, i) => ({ citation: i + 1, documentId: s.documentId, document: s.title, passage: s.chunk, page: s.page, text: s.text })), retry: state.attempts > 0 ? 'A resposta anterior falhou na verificação de evidências. Use apenas afirmações diretamente sustentadas.' : undefined }) }
      ], config.IRIS_RESPONSE_MAX_TOKENS);
      const parsed = answerSchema.safeParse(result.data);
      step('Gerar', 'Resposta estruturada recebida; aguardando verificação.');
      const findings = parsed.success && state.comparison ? validComparisonFindings(parsed.data.findings, state.sources, requiredComparisonIds) : [];
      const answer = parsed.success && parsed.data.abstain ? 'Não há evidências suficientes dos dois lados para concluir este confronto nos documentos recuperados.'
        : state.comparison && findings.length ? comparisonReport(findings, state.sources)
        : parsed.success && parsed.data.citations.length ? formatCitedAnswer(parsed.data.answer, parsed.data.citations)
        : parsed.success ? parsed.data.answer : '';
      const citations = state.comparison && findings.length ? [...new Set(findings.flatMap(finding => [finding.leftCitation, finding.rightCitation]))] : parsed.success ? parsed.data.citations : [];
      return { answer, citations, findings, abstain: parsed.success ? parsed.data.abstain : false, accepted: false, attempts: state.attempts + 1, inputTokens: state.inputTokens + result.inputTokens, outputTokens: state.outputTokens + result.outputTokens };
    })
    .addNode('judge', async state => {
      if (state.accepted || state.abstain) {
        step('Verificar', state.abstain ? 'Abstenção preservada.' : 'Trechos literais com origem identificada.');
        return { accepted: true };
      }
      const inline = [...state.answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]));
      if (!validCitations(state.citations, state.sources.length) || !inline.length || inline.some(n => !state.citations.includes(n))) {
        step('Verificar', 'Citações ausentes ou inválidas.');
        return { accepted: false };
      }
      const documentIds = new Set(state.sources.map(source => source.documentId));
      const completeFindings = validComparisonFindings(state.findings, state.sources, requiredComparisonIds);
      if (state.comparison && (documentIds.size < 2 || !completeFindings.length)) {
        step('Verificar', 'Cobertura comparativa insuficiente: ' + documentIds.size + ' documento(s), ' + completeFindings.length + ' confronto(s) verificável(is).');
        return { accepted: false };
      }
      const review = await reviewAnswer(normalizedQuestion, state.answer, state.citations, state.sources, runId);
      const accepted = review.verdict === 'pass';
      step('Verificar', accepted ? 'Revisor independente aceitou todas as afirmações.' : `Revisor independente: ${review.verdict}; cobertura ${(review.coverage * 100).toFixed(0)}%.`);
      return { accepted, review };
    })
    .addEdge(START, 'plan').addEdge('plan', 'retrieve').addEdge('retrieve', 'generate').addEdge('generate', 'judge')
    .addConditionalEdges('judge', state => state.accepted || state.attempts >= 2 ? END : 'generate');
  const graph = workflow.compile();
  const result = await graph.invoke({ queries: [], sources: [], answer: '', citations: [], findings: [], comparison: false, accepted: false, attempts: 0, abstain: false, review: undefined, inputTokens: 0, outputTokens: 0 }, { recursionLimit: 12 });
  const abstained = result.abstain || !result.accepted;
  const reviewReason = !result.accepted && result.review?.claims.length
    ? '\n\nMotivo da revisão: ' + result.review.claims.filter(claim => claim.verdict !== 'pass').slice(0, 2).map(claim => claim.reason).join(' | ')
    : '';
  const run: Run = {
    id: runId, owner: principal.id, domain, conversationId, question, createdAt: new Date().toISOString(),
    answer: result.accepted ? result.answer : comparing ? 'Não consegui comprovar o confronto com trechos dos dois documentos. Selecione as fontes e especifique cláusula, artigo ou assunto para restringir a busca.' + reviewReason : 'Não foi possível validar uma resposta com as evidências disponíveis. Consulte as fontes ou reformule a pergunta.' + reviewReason,
    sources: result.sources, steps, mode: llm ? 'model' : 'extractive', review: result.review, workflow: 'document-answer-v1',
    status: abstained ? 'abstained' : 'completed', durationMs: Date.now() - start,
    model: llm ? config.LLM_MODEL : undefined, inputTokens: result.inputTokens, outputTokens: result.outputTokens
  };
  await store.saveRun(run);
  const evaluation = evaluateRun(run);
  await store.saveEvaluation?.(evaluation);
  if (run.review) { await store.saveReview?.(run.review); answerReviews.inc({ verdict: run.review.verdict }); answerGroundedness.observe(run.review.coverage); }
  if (run.status === 'completed' && run.sources.length && typeof store.saveMemory === 'function') {
    await store.saveMemory({ id: run.id, owner: run.owner, domain: run.domain, question: run.question, answer: run.answer, sourceIds: run.sources.map(source => source.id), createdAt: run.createdAt, state: 'candidate', confidence: run.review?.coverage ?? 0 });
  }
  await store.audit(principal.id, 'query.' + run.status, run.id);
  return run;
}
