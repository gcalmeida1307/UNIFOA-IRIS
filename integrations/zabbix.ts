import { z } from 'zod';

const hostSchema = z.array(z.object({ hostid: z.string(), host: z.string(), name: z.string().optional() }));
const problemSchema = z.array(z.object({ eventid: z.string(), name: z.string(), severity: z.string(), clock: z.string(), acknowledged: z.string().optional() }));
export type ZabbixProblem = z.infer<typeof problemSchema>[number];

export class ZabbixReader {
  private url: URL;
  constructor(url: string, private token: string, private request: typeof fetch = fetch) {
    this.url = new URL(url);
    if (this.url.username || this.url.password || this.url.search || this.url.hash || !this.url.pathname.endsWith('/api_jsonrpc.php')) throw new Error('URL da API Zabbix inválida.');
    if (this.url.protocol !== 'https:' && !(this.url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(this.url.hostname))) throw new Error('Use HTTPS para consultar Zabbix remoto.');
    if (!token) throw new Error('Token de leitura do Zabbix não configurado.');
  }
  private async call(method: 'host.get' | 'problem.get', params: Record<string, unknown>): Promise<unknown> {
    const response = await this.request(this.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json-rpc', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }), signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Zabbix indisponível (HTTP ' + response.status + ').');
    const envelope = z.object({ result: z.unknown().optional(), error: z.object({ message: z.string() }).optional() }).parse(await response.json());
    if (envelope.error || !envelope.result) throw new Error('Consulta ao Zabbix falhou: ' + (envelope.error?.message ?? 'resposta inválida'));
    return envelope.result;
  }
  async problemsForHost(host: string): Promise<{ host: string; problems: ZabbixProblem[]; capturedAt: string }> {
    if (!/^[\w.:-]{1,128}$/.test(host)) throw new Error('Nome de host inválido.');
    const hosts = hostSchema.parse(await this.call('host.get', { output: ['hostid', 'host', 'name'], filter: { host: [host] } }));
    if (hosts.length !== 1 || hosts[0].host !== host) throw new Error('Host não encontrado de forma única no Zabbix.');
    const problems = problemSchema.parse(await this.call('problem.get', { output: ['eventid', 'name', 'severity', 'clock', 'acknowledged'], hostids: [hosts[0].hostid], recent: false, sortfield: ['eventid'], sortorder: 'DESC', limit: 50 }));
    return { host, problems, capturedAt: new Date().toISOString() };
  }
}
