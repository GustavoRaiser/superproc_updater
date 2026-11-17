# Segurança e resposta a credenciais

## Incidente: chave Google Drive API versionada

A revisão estática encontrou uma chave de API em `config/atualizacao.local.json`, arquivo que estava rastreado pelo Git. O código consultado não contém consumidor de `driveApiKey`; `scripts/publicar.cjs` descreve o envio dos pacotes como etapa manual. Mesmo assim, qualquer credencial que foi versionada deve ser considerada comprometida.

Ações locais nesta correção:
- retirar o arquivo com a chave da árvore de trabalho;
- ignorar `config/atualizacao.local.json` no Git;
- manter apenas `config/atualizacao.local.example.json`, sem credencial;
- documentar a resposta sem copiar o valor secreto.

Ação urgente no Google Cloud, necessária ao responsável pelo projeto:
1. Identificar a chave pelo histórico privado e revogá-la no Google Cloud Console (APIs e serviços → Credenciais).
2. Conferir métricas e logs de uso desde a exposição; restringir ou desativar a API se houver uso inesperado.
3. Se uma integração legítima precisar de credencial, criar outra com restrições mínimas de API e origem/ambiente, guardá-la fora do Git e não incluí-la no aplicativo distribuído.
4. Depois de revogar, decidir com os mantenedores sobre expurgo coordenado do segredo do histórico Git. Isso reescreve SHAs e exige sincronização de branches, PRs e clones. Remover o arquivo do commit atual sozinho não apaga o histórico nem substitui a revogação.

As ferramentas disponíveis nesta tarefa não oferecem acesso ao Google Cloud Console; portanto a revogação e a inspeção de uso não foram realizadas. Até a revogação, trate a chave como ativa e exposta.

## Regras para novas credenciais

Nunca versionar chaves, tokens, arquivos de conta de serviço, certificados privados ou configurações locais com segredos. Usar armazenamento de segredos apropriado no ambiente de execução e placeholders sem valores reais em exemplos. Antes de publicar, buscar segredos tanto no diff quanto em arquivos rastreados. A restrição de chave a uma API reduz o escopo potencial, mas não torna seguro publicar a chave.

## Atualização do incidente — 2026-11-16

O responsável informou que a chave exposta foi revogada. Esta informação foi registrada como declaração do usuário e não foi verificada diretamente no Google Cloud. A remoção do arquivo do commit atual não remove o segredo de commits anteriores. Mantenedores devem avaliar o expurgo coordenado do histórico Git e pedir aos colaboradores que atualizem clones após definir a estratégia.

## Expurgo do histórico — 2026-11-16

Após o responsável informar a revogação, as branches `main` e `docs/guia-cooperacao-ia-20261116` foram reescritas a partir do pai anterior à introdução do arquivo. A consulta da API GitHub por commits atuais nesse caminho retorna vazia, e a lista atual de arquivos do PR não inclui o arquivo.

O GitHub ainda apresentava uma referência virtual de merge do PR com commits antigos como pais quando foi verificada. Se a referência não se regenerar, o proprietário deve solicitar ao GitHub Support a remoção de referências/cache de commits que contenham o segredo. Colaboradores devem apagar ou substituir clones antigos; merges de branches antigas podem reintroduzir os commits comprometidos. Forks e caches externos exigem tratamento separado.

## Estado final da purga — 2026-11-16

Branches e refs atuais (main, branch do PR, head e merge do PR) foram reescritas/regeneradas. A API não lista commits atuais pelo caminho do arquivo e os arquivos alterados no PR não incluem o arquivo. Ainda assim, a consulta direta ao objeto de commit antigo pelo SHA continuou respondendo no GitHub. A remoção definitiva desse objeto/cache requer solicitação ao GitHub Support. Não declarar expurgo integral até que o endpoint antigo deixe de responder. O usuário confirmou a revogação da credencial; não reutilizar.

## Retificação e integração ao acervo — 2026-11-16

A afirmação inicial de que a chave não possui consumidor está incorreta: o navegador e o atualizador Rust a utilizam para consulta e download no Drive. O responsável informou que excluiu a chave no Google Cloud; isso não foi verificado independentemente. O exportador agora exclui a configuração local da distribuição. O transporte de atualizações pelo GitHub permanece por definir, e a exclusão da configuração significa que o mecanismo antigo não está configurado no portátil.
