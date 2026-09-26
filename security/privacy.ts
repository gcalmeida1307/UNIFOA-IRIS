/** Request-scoped pseudonyms. No mapping is persisted or shared across users. */
export class ExternalRedaction {
  private originals = new Map<string, string>();
  private tokens = new Map<string, string>();
  clean(text: string): string {
    const hide = (value: string) => {
      if (this.originals.has(value)) return value;
      let token = this.tokens.get(value);
      if (!token) { token = `__IRIS_PRIVATE_${this.tokens.size + 1}__`; this.tokens.set(value, token); this.originals.set(token, value); }
      return token;
    };
    return text
      .replace(/(?:Bearer\s+[\w.\-+/=]{16,}|sk-(?:proj-)?[\w-]{16,})/g, hide)
      .replace(/[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,}/g, hide)
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, hide)
      .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, hide)
      .replace(/(?:\+55\s*)?\(\d{2}\)\s*9?\d{4}[-\s]?\d{4}\b/g, hide)
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, hide)
      .replace(/\b(?:CPF|CNPJ|paciente|patient|nome completo|matrícula|prontuário)\s*[:=]\s*([^\n,;"}]+)/gi, (all, value: string) => all.replace(value, hide(value)));
  }
  restore<T>(value: T): T {
    if (typeof value === 'string') return value.replace(/__IRIS_PRIVATE_\d+__/g, token => this.originals.get(token) ?? token) as T;
    if (Array.isArray(value)) return value.map(item => this.restore(item)) as T;
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.restore(item)])) as T;
    return value;
  }
}
