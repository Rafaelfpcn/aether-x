<div align="center">

<img src="assets/aether-x-banner.svg" alt="AETHER-X — protocolo de defesa" width="100%">

### Um jogo arcade de voo e combate em uma campanha de seis missões.

[**JOGAR AGORA · HTML OFFLINE**](AETHER-X-offline.html)

Voe pela megacidade. Cruze o cânion. Defenda as águas do vale.

</div>

---

## A campanha

Assuma o quadricóptero AETHER-X e recupere o espaço aéreo. A campanha combina treinamento, interceptação, combate contra chefes e desafios de navegação em cenários diferentes.

| Missão | Cenário | Objetivo |
| --- | --- | --- |
| **01 · Treinamento de voo** | Megacidade neon | Atravesse seis portais e aprenda os controles |
| **02 · Interceptação** | Perímetro urbano | Abata cinco drones antes do tempo acabar |
| **03 · Sentinela Alfa** | Centro da cidade | Derrote o chefe em três fases |
| **04 · Porto sob Chuva** | Porto industrial | Elimine sete drones entre guindastes e contêineres |
| **05 · Corredor das Torres** | Cânion urbano | Atravesse seis balizas seguindo uma rota estreita |
| **06 · Última Comporta** | Represa | Derrote o guardião e impeça a inundação do vale |

As missões são liberadas em sequência. Medalhas, recordes e preferências ficam salvos no navegador.

## Modo Rio

Uma expedição separada da campanha leva a batalha para um vale fluvial naturalista. O cenário inclui água com textura animada, cachoeira, mata nas margens, a casa elevada de um pescador e uma canoa no cais. Defenda a comunidade abatendo oito drones.

O vale é uma composição original inspirada em paisagens ribeirinhas brasileiras, sem representar um local específico.

O modo mantém a física arcade, a pilotagem por teclado e o disparo com mouse. Os elementos do cenário são gerados localmente pelo jogo; não há downloads de modelos, texturas ou áudio durante a partida.

## Voo e combate

- Aceleração com inércia, altitude livre, turbo recarregável e limites de arena.
- Câmera de perseguição suavizada, com enquadramento e campo de visão que reagem à velocidade.
- Pressione `V` durante a missão para alternar para uma câmera próxima.
- Mira assistida, travamento de alvo, canhões de plasma e acertos com colisão contínua.
- Drones batedores, artilheiros e blindados; chefes com ataques anunciados, três padrões e janelas vulneráveis.
- Reforços entram em grupos no Porto e no Modo Rio para manter o combate legível.
- Radar, telemetria, escudo, objetivos, avisos de ataque e pontuação por esquivas próximas.
- Áudio e música sintetizados no navegador.

### Controles

| Tecla | Ação |
| --- | --- |
| `W` / `S` | Acelerar / frear |
| `A` / `D` | Guinar |
| `Espaço` / `C` | Subir / descer |
| `Shift` | Turbo |
| Clique esquerdo / `F` | Disparar |
| `V` | Alternar câmera de perseguição / próxima |
| `Esc` / `P` | Pausar ou retomar |

## Jogar offline

Baixe ou clone o projeto e abra **[`AETHER-X-offline.html`](AETHER-X-offline.html)** em um navegador desktop moderno com aceleração gráfica. Esse arquivo contém o jogo, o Three.js e os estilos; não precisa de servidor, instalação ou internet para jogar.

## Desenvolvimento

Requer **Node.js 20.19+** e **pnpm**.

```powershell
pnpm install
pnpm dev
```

O Vite inicia a versão de desenvolvimento em `http://127.0.0.1:5173`.

### Comandos de validação

```powershell
pnpm typecheck       # verifica os tipos TypeScript
pnpm test            # executa os testes de invariantes
pnpm build           # compila o jogo e atualiza o HTML offline
pnpm verify:offline  # confere o pacote sem dependências externas
```

## Estrutura

```text
src/
  audio.ts       áudio procedural
  drone-model.ts geometria do AETHER-X
  game.ts        mundo Three.js, voo, combate, radar e efeitos
  main.ts        interface, estados, missões e progressão
  missions.ts   campanha, encontros, paletas e modo Rio
  physics.ts    amortecimento, turbo, colisões e câmera
  scenery.ts    cenários locais da cidade, porto, torres, represa e rio
  state.ts      transições permitidas entre estados
  storage.ts    progresso local versionado e validado
tests/
  invariants.test.mjs
scripts/
  create-offline.mjs
  verify-offline.mjs
assets/
  aether-x-banner.svg
```

O projeto funciona sem backend. A versão atual migra o progresso salvo pela edição anterior de três missões sem descartar recordes, volume, tema ou áudio.

---

<div align="center">

**AETHER-X // PROTOCOLO DE DEFESA · 2089**  
Seis missões. Um modo especial. Voo arcade sem conexão.

</div>
