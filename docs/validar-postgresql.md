# Validar o PostgreSQL do IRIS

No computador onde o IRIS roda, entre na pasta clonada e instale as dependências (`npm ci`, se ainda não estiverem instaladas). Com `DATABASE_URL` vazia (padrão do `.env.example`), `npm run db:check` solicita a senha do usuário `iris` no terminal, sem exibi-la, e testa o banco `iris` em `IRIS_DB_HOST:IRIS_DB_PORT` (padrão `localhost:5432`). A senha não é salva. Se preferir usar uma `DATABASE_URL`, configure-a no `.env` local; ela tem prioridade e contém a senha, então não a compartilhe.

Execute `npm run db:check`. A checagem conecta ao PostgreSQL e consulta somente metadados e contagens; não altera tabelas ou documentos. Ela indica se o banco conectado tem o nome esperado, se existem tabelas essenciais e quantos documentos, trechos e consultas estão salvos. Com outro nome de banco exclusivo, use `npm run db:check -- --expected-db=NOME_DO_BANCO`.

Para iniciar a aplicação apontando para esse mesmo banco, execute `start.ps1` na pasta do projeto pelo PowerShell. O script também solicita a senha sem exibi-la e a mantém somente no ambiente dos processos enquanto o IRIS estiver aberto.

Resultados possíveis:

- `DATABASE_URL não está configurada`: em execução sem terminal interativo, o diagnóstico não pode solicitar a senha; execute `npm run db:check` em um terminal ou configure a URL no `.env`.
- `Conexão PostgreSQL: OK`, banco esperado `OK` e todas as tabelas `OK`: o armazenamento do IRIS foi confirmado no PostgreSQL.
- Banco diferente do esperado: confira se a conexão não aponta para um banco do SOFIA ou do LUMINA; a checagem não faz migração nem modifica a conexão.
- Tabelas ausentes: confirme que o servidor IRIS foi iniciado com esta mesma URL; as tabelas são criadas na inicialização.
- Falha de conexão: confira se o servidor, porta, usuário e senha estão corretos no seu ambiente, sem enviá-los no chat.

No IRIS em execução, a tela **Configurações → Armazenamento** também informa `PostgreSQL` ou `SQLite local`. No modo `AUTH_MODE=native`, a inicialização falha se a conexão PostgreSQL configurada falhar; no desenvolvimento com outro modo o servidor pode recorrer a SQLite e registra um aviso. Esta checagem não testa o seu PostgreSQL remotamente e não move dados do SQLite ou dos bancos antigos.
