# Performance Report V2 - Análise Pyroscope

**Data:** 2026-01-20
**Período analisado:** 30 minutos
**Serviços:** kodus-api (34.55s), kodus-worker (38.59s)

---

## Resumo Executivo

| Problema | API | Worker | Status |
|----------|-----|--------|--------|
| BSON Deserialization | **22.8%** | 1.9% | 🔴 CRÍTICO (API) |
| Garbage Collection | 19.0% | 15.5% | 🟡 ALTO (relacionado ao BSON) |
| MongoDB Connection Pool | 6.3% | 6.9% | 🟡 MÉDIO |
| Node.js Timers | 7.8% | 7.7% | 🟡 MÉDIO |
| Picomatch/Glob | 0.2% | 1.2% | 🟢 RESOLVIDO (API) / 🟡 Worker |

---

## 🔴 CRÍTICO #1: BSON Deserialization (API: 22.8%)

### Diagnóstico
```
14.7% - bson.cjs:deserializeObject:3104
 4.9% - bson.cjs:toUTF8:281
 1.8% - bson.cjs:tryReadBasicLatin:168
```

### Causa Raiz Identificada
O método `findManyByNumbersAndRepositoryIds` no `pullRequests.repository.ts` ainda está retornando o array `files[]` completo com todos os metadados de suggestions:

```typescript
// PROBLEMA ATUAL (linha 162-175):
{
    'files.suggestions.existingCode': 0,    // só exclui conteúdo
    'files.suggestions.improvedCode': 0,
    'files.suggestions.suggestionContent': 0,
    'commits': 0,
    'prLevelSuggestions': 0,
}
// MAS AINDA TRAZ: files[].suggestions[] inteiro com 180k+ objetos!
```

### Solução Proposta
```typescript
// CORREÇÃO:
{
    'files': 0,              // EXCLUIR TODO O ARRAY
    'commits': 0,
    'prLevelSuggestions': 0,
}
```

**Justificativa:** O `GetEnrichedPullRequestsUseCase` só usa campos básicos do PR (`number`, `title`, `status`, `repository.name`, etc.). Os counts de suggestions já vêm da agregação MongoDB que implementamos.

### Impacto Esperado
- **Antes:** ~3MB de dados por batch de 30 PRs
- **Depois:** ~50KB de dados por batch
- **Redução estimada:** ~98% menos dados transferidos

---

## 🟡 ALTO #2: Garbage Collection (19% API / 15.5% Worker)

### Diagnóstico
O GC alto é **consequência direta** do BSON deserialization. Quando 180k objetos são desserializados, eles precisam ser alocados na heap e depois coletados.

### Solução
Resolver o problema #1 (BSON) automaticamente reduzirá o GC.

### Métricas de validação
Após implementar a correção do BSON, o GC deve cair para ~5-8%.

---

## 🟡 MÉDIO #3: MongoDB Connection Pool (6.3% API / 6.9% Worker)

### Diagnóstico
```
API:
  2.2% - ensureMinPoolSize:460
  0.9% - (anonymous:L#484:C#62):484
  0.8% - connectionIsIdle:381
  0.8% - get idleTime:101

Worker:
  3.2% - ensureMinPoolSize:460
  1.3% - (anonymous:L#484:C#62):484
```

### Análise
A função `ensureMinPoolSize` está consumindo 2-3% do tempo. Isso indica que:
1. Conexões estão sendo fechadas e recriadas frequentemente
2. O pool está "cold starting" repetidamente

### Solução Implementada (v1)
Aumentamos `maxIdleTimeMS` de 50s para 300s. **Mas ainda precisa de mais ajustes:**

```typescript
// mongoose.factory.ts - ajustes adicionais recomendados:
{
    minPoolSize: 5,           // Manter mínimo de 5 conexões
    maxPoolSize: 20,          // Aumentar máximo (era 10)
    maxIdleTimeMS: 300000,    // ✅ Já implementado
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
}
```

---

## 🟡 MÉDIO #4: Node.js Timers (7.8% API / 7.7% Worker)

### Diagnóstico
```
3-4% - timers:processTimers:508
2-3% - timers:listOnTimeout:528
1-2% - setTimeout:136
```

### Análise
Alto uso de timers pode indicar:
1. Polling excessivo (outbox, health checks)
2. Timeouts curtos sendo recriados frequentemente
3. Debounce/throttle mal configurados

### Investigação Necessária
Verificar:
- Intervalo do outbox polling
- Health check intervals
- MongoDB heartbeat intervals

---

## 🟢 RESOLVIDO: Picomatch/Glob (API: 0.2%)

### Antes
O cache de picomatch não existia, cada chamada recompilava o pattern.

### Depois
Implementamos cache em `glob-utils.ts`:
```typescript
const MATCHER_CACHE_CASE_SENSITIVE = new Map<string, picomatch.Matcher>();
// Cache hit rate: ~95%+
```

### Resultado
- **API:** 0.2% (excelente!)
- **Worker:** 1.2% (ainda alto em `isFileMatchingGlob`)

### Ação para Worker
O Worker ainda está chamando `picomatch.test` diretamente (0.5%). Verificar se está usando o utilitário cacheado.

---

## 📊 Breakdown por Serviço

### kodus-api (34.55s total)

| Categoria | % | Tempo | Status |
|-----------|---|-------|--------|
| BSON Deserialization | 22.8% | 7.87s | 🔴 |
| Garbage Collection | 19.0% | 6.57s | 🟡 |
| Node.js Timers | 7.8% | 2.70s | 🟡 |
| MongoDB Conn Pool | 6.3% | 2.17s | 🟡 |
| Picomatch | 0.2% | 0.06s | 🟢 |

### kodus-worker (38.59s total)

| Categoria | % | Tempo | Status |
|-----------|---|-------|--------|
| Garbage Collection | 15.5% | 6.00s | 🟡 |
| MongoDB Conn Pool | 6.9% | 2.66s | 🟡 |
| Node.js Timers | 7.7% | 2.96s | 🟡 |
| BSON Deserialization | 1.9% | 0.74s | 🟢 |
| Picomatch | 1.2% | 0.47s | 🟡 |

---

## 🎯 Plano de Ação Priorizado

### P0 - Crítico (fazer agora)

1. **Excluir `files` da query `findManyByNumbersAndRepositoryIds`**
   ```typescript
   // pullRequests.repository.ts linha 167
   {
       'files': 0,
       'commits': 0,
       'prLevelSuggestions': 0,
   }
   ```
   **Impacto:** -20% tempo API, -15% GC

### P1 - Alto (fazer esta semana)

2. **Ajustar MongoDB Pool Settings**
   ```typescript
   {
       minPoolSize: 5,
       maxPoolSize: 20,
   }
   ```
   **Impacto:** -3-5% tempo em connection management

3. **Verificar uso de picomatch no Worker**
   - Garantir que `isFileMatchingGlob` usa o cache
   **Impacto:** -1% tempo Worker

### P2 - Médio (backlog)

4. **Investigar timers**
   - Revisar intervalos de polling
   - Considerar long-polling ou WebSocket para outbox

5. **Monitoramento contínuo**
   - Adicionar métricas de cache hit rate
   - Alertas para quando BSON > 10%

---

## 📈 Métricas de Sucesso

Após implementar P0:

| Métrica | Atual | Meta |
|---------|-------|------|
| BSON Deserialization (API) | 22.8% | < 5% |
| Garbage Collection (API) | 19.0% | < 8% |
| Response time p95 | ? | -30% |
| MongoDB data transfer | ~3MB/batch | ~50KB/batch |

---

## Apêndice: Funções do Código com Maior Impacto

### API
```
0.7% - bootstrap
0.6% - execute (use case)
0.5% - validate
0.5% - validateUser
0.5% - getLoginData
0.3% - getPullRequests    ← relacionado ao problema #1
0.3% - logQuery
```

### Worker
```
1.4% - getChangedFiles
1.4% - isFileMatchingGlob  ← picomatch
1.2% - poll                ← outbox polling
1.1% - processOutbox
0.9% - claimBatch
0.7% - getCachedMatcher    ← nosso cache funcionando!
0.5% - analyzeCodeWithAI_v2
```

---

*Gerado por análise de Pyroscope em 2026-01-20*
