# Relatorio de Diagnostico de Memoria - API/Worker

## Escopo
- Uso de memoria em runtime para API e Worker (idle e durante processamento de PR).
- Observado via Docker stats; foco no pipeline de code review (nao build ou escala).

## Sintomas observados
- RSS idle em torno de ~2GB para API e Worker, estavel sem requests.
- Durante processamento de PR, memoria sobe para ~4-5GB por servico.

## Configuracoes relevantes (baseline)
### Heap do Node / runtime
- A imagem dev define `NODE_OPTIONS=--max-old-space-size=4096`.
  `docker/Dockerfile.dev`
- O compose dev sobrescreve por servico (`api` 1200, `worker` 800, `webhooks` 400).
  `docker-compose.dev.yml`
- O compose dev tambem define `--max-semi-space-size` (64/16), impactando o young gen.
  `docker-compose.dev.yml`
- O comando dev do worker tambem define 2048 para heap.
  `package.json`
- O entrypoint prod auto-ajusta o heap para 85% do limite do cgroup quando nao setado.
  `docker/prod-entrypoint.sh`

### Watch mode / webpack
- `nest start --watch` usa builder webpack e mantem grafos grandes em memoria.
  `package.json`
  `nest-cli.json`

### Concorrencia de jobs do worker
- Prefetch do RabbitMQ padrao 60. Isso permite muitos PRs em voo.
  `libs/core/infrastructure/config/loaders/workflow-queue.loader.ts`
  `libs/core/infrastructure/queue/rabbitmq.module.ts`
  `libs/core/workflow/infrastructure/workflow-job-consumer.service.ts`

## Visao geral do pipeline (code review do PR)
Etapas incluem:
- ValidateNewCommits -> ResolveConfig -> ValidateConfig -> FetchChangedFiles ->
  LoadExternalContext -> FileContextGate -> InitialComment -> KodyFineTuning ->
  AST -> PR-level analysis -> File analysis -> Comments -> Aggregate -> Finalize.
  `libs/ee/codeReview/strategies/code-review-pipeline.strategy.ee.ts`

Estruturas-chave vivem no contexto do pipeline:
- `changedFiles`, `externalPromptContext`, `sharedContextPack`, `augmentationsByFile`,
  `validSuggestions`, `clusterizedSuggestions`, etc.
  `libs/code-review/pipeline/context/code-review-pipeline.context.ts`

## Onde a memoria cresce (principais fontes)
1) Conteudo completo do arquivo carregado para cada arquivo alterado
- `PullRequestHandlerService.getChangedFiles` busca conteudo para cada arquivo,
  sem limite de concorrencia e salva em `fileContent`.
  `libs/code-review/infrastructure/adapters/services/pullRequestManager.service.ts`
- Alguns providers ja incluem conteudo (ex: Bitbucket `content`), entao
  `fileContent` vira duplicacao em memoria.
  `libs/platform/infrastructure/adapters/services/bitbucket.service.ts`
  `libs/core/infrastructure/config/types/general/codeReview.type.ts`

2) Double fetch de arquivos alterados
- `ResolveConfigStage` chama `getChangedFiles` para resolver config.
  `libs/code-review/pipeline/stages/resolve-config.stage.ts`
- `FetchChangedFilesStage` chama `getChangedFiles` novamente.
  `libs/code-review/pipeline/stages/fetch-changed-files.stage.ts`
- Isso cria duas listas grandes em memoria em momentos proximos.

3) Expansao de patch e duplicacao
- `FetchChangedFilesStage` gera `patchWithLinesStr` (diff com numeros de linha)
  e mantem o `patch` original.
  `libs/code-review/pipeline/stages/fetch-changed-files.stage.ts`
- `BaseFileReviewContextPreparation` pode recomputar `patchWithLinesStr` se faltar.
  `libs/code-review/infrastructure/adapters/services/code-analysis/file/base-file-review.abstract.ts`

4) Payloads de prompt do LLM sao grandes
- `LLMAnalysisService.prepareAnalysisContext` inclui `fileContent` ou
  `relevantContent`, `patchWithLinesStr` e camadas externas.
  `libs/code-review/infrastructure/adapters/services/llmAnalysis.service.ts`
- Prompts incluem `suggestionsContext` como JSON.stringify das sugestoes.
  O campo `llmPrompt` e salvo nas sugestoes e pode ser grande.
  `libs/core/infrastructure/config/types/general/codeReview.type.ts`

5) Analise cross-file / PR-level e chunking
- A etapa PR-level prepara todos os diffs em uma lista.
  `libs/code-review/pipeline/stages/process-files-pr-level-review.stage.ts`
- `CrossFileAnalysisService` usa token chunking que serializa cada item
  (JSON.stringify) e processa chunks em paralelo (max 10).
  `libs/code-review/infrastructure/adapters/services/crossFileAnalysis.service.ts`
  `libs/core/infrastructure/services/tokenChunking/tokenChunking.service.ts`

6) Contexto externo e evidencias MCP
- Referencias externas sao carregadas em `externalPromptContext` e `contextLayers`.
  `libs/code-review/pipeline/stages/load-external-context.stage.ts`
  `libs/ai-engine/infrastructure/adapters/services/orchestration/promptContextLoader.service.ts`
- Aumentacao de contexto por arquivo usa MCP e guarda evidencias por arquivo.
  `libs/code-review/pipeline/stages/file-context-gate.stage.ts`
  `libs/ai-engine/infrastructure/adapters/services/context/file-context-augmentation.service.ts`
  `libs/agents/infrastructure/services/kodus-flow/contextEvidenceAgent.provider.ts`

7) Kody fine tuning (embeddings + clustering)
- Carrega sugestoes embedded e roda `kmeans` em memoria.
  `libs/ee/codeReview/stages/kody-fine-tuning.stage.ts`
  `libs/kodyFineTuning/infrastructure/adapters/services/kodyFineTuning.service.ts`

8) Analise AST (quando habilitada)
- Tarefas AST sao inicializadas e podem retornar conteudo completo como fallback.
  `libs/ee/codeReview/stages/code-analysis-ast.stage.ts`
  `libs/ee/codeReview/fileReviewContextPreparation/file-review-context-preparation.service.ts`

9) Concorrencia amplifica picos
- Preparacao por arquivo usa `pLimit(20)`, mas a analise roda em paralelo por batch
  com `Promise.allSettled` em 20-30 arquivos.
  `libs/code-review/pipeline/stages/process-files-review.stage.ts`
- Chunking cross-file usa `maxConcurrentChunks = 10`.
  `libs/code-review/infrastructure/adapters/services/crossFileAnalysis.service.ts`
- Prefetch do worker permite multiplos PRs em voo.
  `libs/core/infrastructure/config/loaders/workflow-queue.loader.ts`

## Duplicacoes observadas (exemplos concretos)
| Dado | Onde aparece | Motivo | Arquivos |
| --- | --- | --- | --- |
| conteudo do arquivo | `content` e `fileContent` | Provider ja retorna conteudo; handler busca de novo | `libs/platform/infrastructure/adapters/services/bitbucket.service.ts` `libs/code-review/infrastructure/adapters/services/pullRequestManager.service.ts` |
| diff | `patch` e `patchWithLinesStr` | Etapa expande patch e mantem o original | `libs/code-review/pipeline/stages/fetch-changed-files.stage.ts` |
| lista de arquivos alterados | preliminar vs final | `ResolveConfigStage` busca, depois `FetchChangedFilesStage` busca de novo | `libs/code-review/pipeline/stages/resolve-config.stage.ts` `libs/code-review/pipeline/stages/fetch-changed-files.stage.ts` |
| conteudo no prompt | `fileContent` + `relevantContent` | Payload do prompt inclui ambos e muitas vezes sao iguais | `libs/code-review/infrastructure/adapters/services/llmAnalysis.service.ts` |

## Por que o idle fica alto (nao e leak por si)
- RSS inclui heap do V8 + buffers nativos; V8 nao devolve memoria agressivamente.
- Watch/webpack mantem grafos e caches quentes.
- Teto de heap e configurado alto em dev ou auto-ajustado em prod.
  `docker/Dockerfile.dev`
  `docker-compose.dev.yml`
  `docker/prod-entrypoint.sh`

## Notas de GC/V8 (referencia Platformatic)
- RSS alto nao implica leak; leak real aparece como crescimento continuo de `heapUsed`.
- V8 e geracional: New Space (scavenge rapido) e Old Space (mark/sweep mais caro).
- Alta taxa de alocacao pode causar "premature promotion" para Old Space e aumentar GC caro.
- Ajuste de `--max-semi-space-size` pode reduzir promocao precoce, trocando memoria por CPU.
- Node v22+ usa defaults dinamicos; em containers com pouca memoria, o young gen pode ficar pequeno demais.
- Ajustes de heap sao tuning, nao consertam arquitetura que mantem dados gigantes em memoria.

## Implicacoes de escala (por PR)
- Cada PR carrega conteudo completo de todos os arquivos, mantem diff+diff expandido
  e gera varios payloads grandes em analise paralela.
- Quando mais de um PR esta em voo (prefetch ou multiplos workers), o pico escala linearmente.

## Recomendacoes (mantendo informacao)
### Curto prazo (alto impacto)
- Evitar double fetch: usar lista preliminar apenas para config, sem carregar conteudo.
  Deferir conteudo para a etapa de analise.
- Armazenar apenas uma representacao: manter `patchWithLinesStr` ou `patch`, nao ambos.
- Limitar analise paralela por batch; reduzir concorrencia de chunk cross-file.
- Reduzir prefetch do worker para baixar PRs paralelos.

### Medio prazo (estrutural)
- Lazy-load do conteudo quando o arquivo for realmente analisado; descartar apos uso.
- Externalizar conteudo/diffs para storage curto (Redis/S3/FS) e carregar sob demanda.
  Isso so ajuda se voce nao mantiver tudo em RAM.
- Fazer streaming/chunking real para cross-file, sem montar arrays completos.

### Longo prazo (guardrails)
- Adicionar thresholds: se PR exceder X arquivos/linhas/tokens, degradar para modos mais leves.
- Adicionar limites globais de concorrencia por worker.

## Medicao minima recomendada
- Coletar `rss`, `heapUsed`, `external` por etapa e por PR.
- Registrar GC com `--trace-gc` para correlacionar pausas e promocao de objetos.
- Medir tamanho medio e max de `patchWithLinesStr`, `fileContent`,
  `externalPromptContext` e payloads de prompt.
- Correlacionar picos de memoria com tamanho do PR e concorrencia.

## Conclusao
O pico de memoria e principalmente um problema de volume de dados e concorrencia:
conteudo completo + diffs expandidos + payloads grandes de prompt ficam vivos
ao mesmo tempo, e o paralelismo em PR-level multiplica o pico.
O baseline idle e consistente com teto de heap e watch mode.
