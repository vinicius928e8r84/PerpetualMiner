# Telas do PR #224 (ONB-18 e ONB-19), para a aprovação da issue #236

Geradas com a skill `verify-perpetualminer`: `drive.sh` com uma spec descartável, Chromium 141 headless no Linux. Só fakes, nenhuma chave de verdade (o Anki, o abridor e o Google são os do e2e). Cada caso tem duas fotos: `-normal` (1280 × 860, com a barra lateral) e `-estreita` (760 × 1100, a barra vira trilho). Código: `sandcastle/issue-146-passo-ter-o-anki` em `e33a512`.

Ordem de leitura:

| # | Arquivo | O que mostra |
|---|---|---|
| 01 | `01-ter-o-anki-pergunta-*.png` | Passo 1 antes de qualquer resposta: “Você já tem o Anki?”. É o mesmo silêncio para o Anki não instalado, fechado ou aberto sem a Conexão |
| 02 | `02-nao-tenho-mac-*.png` | “Não tenho” no Mac: Baixar o Anki (a página do Anki, numa aba nova) e “Arraste o Anki para a pasta Aplicativos…” |
| 03 | `03-nao-tenho-windows-*.png` | “Não tenho” no Windows: Baixar o Anki e “Abra o instalador que você baixou…” |
| 04 | `04-nao-tenho-outro-sistema-*.png` | “Não tenho” fora do Mac e do Windows: Baixar o Anki e “Depois de instalar, abra o Anki.” |
| 05 | `05-ja-tenho-sem-permissao-*.png` | “Já tenho” sem a permissão do abridor: o caminho manual, “Abra o Anki para continuar.” |
| 06 | `06-ja-tenho-abridor-abre-*.png` | “Já tenho” com a permissão: o abridor abre o Anki, “O Anki está abrindo…” |
| 07 | `07-ja-tenho-anki-no-lugar-nao-abre-*.png` | “Já tenho” com a permissão, o Anki no lugar e o sistema sem abri-lo: o caminho manual |
| 08 | `08-ja-tenho-abridor-nao-acha-*.png` | “Já tenho” com a permissão e o abridor sem achar o Anki: o caminho manual |
| 09 | `09-ja-tenho-sem-abridor-*.png` | “Já tenho” com a permissão e sem o abridor no computador: o caminho manual |
| 10 | `10-aviso-quadro-1-*.png` | Passo 2, a animação do aviso do Anki no quadro 1: a janela “Instalar extensão do Anki”, nas palavras do Anki em pt-BR |
| 11 | `11-aviso-quadro-2-onde-clicar-*.png` | O quadro 2: o mesmo diálogo com o Sim marcado, de onde clicar |
| 12 | `12-aviso-movimento-reduzido-*.png` | Com “menos movimento”: os dois quadros parados, lado a lado |
| 13 | `13-abridor-depois-da-queda-*.png` | Quem já conectou e viu a Conexão cair volta ao passo 4, Abrir o Anki sozinho, com “Conexão com o Anki: desligada” |
| 14 | `14-boas-vindas-nao-tenho-*.png` | O mesmo passo Ter o Anki no passo 4 da Boas-vindas, depois de “Não tenho” |

Os quadros 10 e 11 foram tirados com as animações paradas em 0,5 s e 2,5 s da volta de 4 s. O `fotografar` desliga as animações infinitas, então mostraria sempre o quadro 1.
