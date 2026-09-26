import assert from 'node:assert/strict';
import test from 'node:test';
import { ZabbixReader } from '../integrations/zabbix.js';

test('Zabbix reader limits queries to an exact host and returns bounded problems', async () => {
  const calls: Array<{ url: string; method: string; body: any; auth: string | null }> = [];
  const fake = async (url: URL | RequestInfo, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push({ url: String(url), method: String(init?.method), body, auth: new Headers(init?.headers).get('Authorization') });
    return Response.json({ jsonrpc: '2.0', id: 1, result: body.method === 'host.get' ? [{ hostid: '42', host: 'TPCP04LAB001', name: 'Lab 1' }] : [{ eventid: '91', name: 'Disco 80%', severity: '3', clock: '1790410000' }] });
  };
  const result = await new ZabbixReader('https://zabbix.example.org/api_jsonrpc.php', 'secret', fake as typeof fetch).problemsForHost('TPCP04LAB001');
  assert.equal(result.problems[0].eventid, '91');
  assert.deepEqual(calls.map(c => c.body.method), ['host.get', 'problem.get']);
  assert.deepEqual(calls[0].body.params.filter, { host: ['TPCP04LAB001'] });
  assert.deepEqual(calls[1].body.params.hostids, ['42']);
  assert.equal(calls[1].body.params.limit, 50);
  assert.ok(calls.every(c => c.method === 'POST' && c.auth === 'Bearer secret'));
});
test('Zabbix reader rejects insecure remote URLs and mismatched hosts', async () => {
  assert.throws(() => new ZabbixReader('http://zabbix.example.org/api_jsonrpc.php', 'secret'), /HTTPS/);
  const fake = async () => Response.json({ result: [{ hostid: '42', host: 'another-host' }] });
  await assert.rejects(new ZabbixReader('https://zabbix.example.org/api_jsonrpc.php', 'secret', fake as typeof fetch).problemsForHost('TPCP04LAB001'), /Host não encontrado/);
});
