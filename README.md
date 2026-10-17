<div align="center">

<img src="assets/aether-x-banner.svg" alt="AETHER-X — protocolo de defesa" width="100%">

### Uma mini-campanha arcade de voo e combate em uma metrópole cyberpunk.

[**JOGAR AGORA · HTML OFFLINE**](AETHER-X-offline.html)

Voe. Intercepte. Sobreviva à Sentinela.

</div>

---

## A campanha

Três missões conectadas colocam você no comando de uma aeronave de defesa sobre uma cidade neon. Aprenda a pilotar, proteja o espaço aéreo e enfrente uma sentinela de combate que muda de estratégia a cada fase.

| Missão | Objetivo | Desafio |
| --- | --- | --- |
| **01 · Treinamento** | Atravesse seis portais e domine o voo | Aprenda aceleração, altitude, turbo e disparo |
| **02 · Interceptação** | Abata cinco drones antes do tempo acabar | Preserve o escudo sob pressão |
| **03 · Sentinela Alfa** | Derrote o chefe em três fases | Leia os avisos, evite ataques e aproveite as aberturas |

## O que você vai encontrar

- Voo tridimensional e combate arcade em uma arena urbana neon.
- Mira, travamento de alvo, projéteis com colisão contínua e escudo regenerativo.
- Chefe com fases, ataques anunciados e períodos de vulnerabilidade.
- HUD tático com radar, telemetria, objetivos e feedback de combate.
- Efeitos e áudio procedural, sem arquivos de mídia remotos.
- Campanha, medalhas, recordes e preferências salvos no navegador.
- Versão de arquivo único para jogar offline, sem servidor e sem conexão.

## Jogar

Baixe ou clone o projeto e abra **[`AETHER-X-offline.html`](AETHER-X-offline.html)** em um navegador desktop moderno. Esse arquivo já contém o jogo, os estilos e o Three.js. Não precisa instalar dependências para jogar.

> `index.html` é a entrada usada durante o desenvolvimento com Vite. Se for aberto diretamente por caminho de arquivo, ele explica como abrir a versão offline.

### Controles

| Tecla | Ação |
| --- | --- |
| `W` / `S` | Acelerar / frear |
| `A` / `D` | Guinar |
| `Espaço` / `C` | Subir / descer |
| `Shift` | Turbo |
| Clique esquerdo / `F` | Disparar |
| `Esc` / `P` | Pausar ou retomar |

## Desenvolvimento

Requer **Node.js 20.19+** e **pnpm**.

```powershell
pnpm install
pnpm dev
```

O Vite inicia a versão de desenvolvimento em `http://127.0.0.1:5173`.

### Comandos

```powershell
pnpm typecheck       # verifica os tipos TypeScript
pnpm test            # executa os testes de invariantes
pnpm build           # compila o jogo e atualiza o HTML offline
pnpm verify:offline  # confere o pacote sem dependências externas
```

O build de produção do Vite fica em `dist/`. O jogo autocontido é gerado em `AETHER-X-offline.html`, na raiz do projeto.

## Como o projeto está organizado

```text
src/
  audio.ts       áudio procedural
  game.ts        mundo Three.js, voo, combate, radar e efeitos
  main.ts        interface, estados, missão e progressão
  missions.ts    objetivos, limites e critérios de medalha
  physics.ts     amortecimento por tempo e colisão por segmento
  state.ts       transições permitidas entre estados do jogo
  storage.ts     progresso local versionado e validado
tests/
  invariants.test.mjs
scripts/
  create-offline.mjs
  verify-offline.mjs
assets/
  aether-x-banner.svg
```

O jogo funciona sem backend. O progresso e as preferências ficam no armazenamento local do navegador. Para contribuir, abra uma issue descrevendo a mudança ou envie um pull request com o contexto e os passos para reproduzi-la.

---

<div align="center">

**AETHER-X // PROTOCOLO DE DEFESA · 2089**  
Construído para voos curtos, combates intensos e mais uma tentativa.

</div>
