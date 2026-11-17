# SuperPROC v2

[![Baixar Instalador Automático (C:\SuperPROC)](./assets/botao-instalador.svg)](https://storage.googleapis.com/superproc_updater/Instalar-SuperPROC.bat)

[![Baixar Pacote Portátil Completo (.ZIP)](./assets/botao-zip.svg)](https://storage.googleapis.com/superproc_updater/SuperPROC-latest.zip)

---

## Como baixar e instalar o SuperPROC

Você pode instalar o SuperPROC v2 de forma automática (recomendado) ou fazer a extração manual do pacote portátil:

### Opção 1: Instalador Automático em `C:\SuperPROC` (Recomendado)
1. Clique no botão verde **BAIXAR INSTALADOR AUTOMÁTICO (C:\SuperPROC)** no topo desta página para baixar o arquivo **`Instalar-SuperPROC.bat`**.
2. Execute o arquivo **`Instalar-SuperPROC.bat`** baixado. Caso o Windows exiba a tela de proteção do SmartScreen, clique em **Mais informações** e, em seguida, em **Executar assim mesmo**.
3. O instalador fará todo o processo sozinho: consultará a versão mais recente publicada neste repositório, baixará o arquivo `.zip`, conferirá a integridade do pacote, descompactará os arquivos dentro da pasta **`C:\SuperPROC`**, criará o atalho **SuperPROC v2** na sua Área de Trabalho e abrirá o navegador ao concluir.

### Opção 2: Download e extração manual do arquivo `.zip`
1. Clique no botão azul **BAIXAR PACOTE PORTÁTIL COMPLETO (.ZIP)** acima (ou acesse a seção **Releases** à direita da página) e baixe apenas o arquivo **`.zip`** da versão mais recente. Os demais arquivos da release (`manifesto-*.json` e `SHA256SUMS.txt`) são de uso exclusivo do atualizador interno e não precisam ser baixados.
2. Após concluir o download, **extraia todo o conteúdo do arquivo `.zip`** para uma pasta de sua preferência no computador (por exemplo, `C:\SuperPROC` ou Documentos). Não execute o programa diretamente de dentro do arquivo compactado sem antes extrair a pasta inteira.
3. Abra a pasta extraída, localize o executável **`SuperPROC_v2.exe`** e inicie-o com dois cliques. Se desejar, crie um atalho para o `SuperPROC_v2.exe` na Área de Trabalho ou fixe-o na barra de tarefas.

---

## Apresentação do SuperPROC v2

O SuperPROC v2 é um navegador dedicado, concebido especificamente para otimizar o trabalho no eproc. Em vez de depender de um navegador genérico com múltiplas janelas desalinhadas e configurações dispersas, o SuperPROC reúne em uma única estrutura o gerenciamento inteligente de abas processuais, a extensão SuperPROC nativa, o suporte integrado a extensões parceiras (AZflow e Epryx), leitor próprio de PDF, consulta rápida à legislação e integração direta com o Microsoft Copilot.

### Aspectos-chave e principais funcionalidades

* **Organização de processos em aba única:** unifica a capa do processo, a árvore de documentos e o editor de minutas em uma mesma aba estruturada, eliminando o acúmulo de janelas soltas ao longo do expediente. Processos relacionados abertos a partir da capa também permanecem agrupados sob a mesma aba, com alternância rápida.
* **Módulos da extensão SuperPROC:** conjunto de ferramentas modulares para personalizar a interface e acelerar tarefas repetitivas no eproc, incluindo Árvore Colorida Dinâmica, Filtros de Eventos na capa, Smart Localizadores e Smart Eventos (com busca, agrupamento e cores personalizadas), Capa Minimalista, Barra de Botões de Preferências, edição rápida de texto, escolhas inline no editor e gerador de PDF formatado.
* **Integração com o Microsoft Copilot:** painel lateral dedicado ao Copilot, permitindo enviar com um comando ou atalho de teclado o conteúdo do PDF aberto no leitor ou a minuta em edição, além de acionar instruções rápidas de revisão e alteração de texto diretamente do editor.
* **Leitor de PDF e Biblioteca de Legislação integrados:** visualização fluida de peças processuais com busca aprimorada, extração limpa de contexto e painel lateral para consulta de leis e referências sem perder a visão dos autos.
* **Atualização contínua e segura:** o navegador verifica automaticamente novas versões publicadas neste repositório por meio de manifestos assinados digitalmente, permitindo atualizar o aplicativo mantendo intactos o seu perfil, os seus logins e as suas preferências.

---

## Recomendações de primeiros ajustes

Como o SuperPROC v2 opera em um perfil próprio e isolado, vale realizar três configurações rápidas logo na primeira abertura para deixar o ambiente adaptado à sua rotina:

### 1. Definir o modo de visualização (Modo de abertura)
Clique no ícone de engrenagem no canto superior direito da barra do navegador e posicione o cursor sobre **Modo de abertura**. Escolha a opção mais adequada para a sua estação de trabalho:
* **Integrada (padrão):** reúne capa, editor e árvore/documentos lado a lado dentro de uma única aba unificada.
* **Dois monitores:** indicado para estações com dois monitores físicos. Mantém a capa e a navegação principal em uma tela e projeta automaticamente a árvore e os documentos do processo no monitor oposto.
* **Simples:** funcionamento de navegador convencional, em que cada link ou documento abre em abas ou janelas independentes.

Nesse mesmo menu, você pode ligar a chave **Coluna Copilot** para fixar o assistente no lado esquerdo da janela principal e ajustar os percentuais de largura da coluna e da área da árvore/documentos.

### 2. Ativar extensões e escolher os módulos do SuperPROC
Ainda no menu da engrenagem, acesse a opção **Addons**:
* Verifique se a extensão **SuperPROC** e o **Leitor PDF** estão ativados.
* Se você utiliza o **AZflow** ou a **Epryx**, clique no botão **Instalar** correspondente para que o navegador baixe e ative essas extensões automaticamente.
* Em seguida, clique sobre o nome **SuperPROC** no menu de Addons (ou no ícone da extensão na barra superior) para abrir o painel de configuração dos módulos. Por padrão, os módulos vêm desmarcados para que cada usuário ative apenas o que deseja usar: percorra as abas de categorias (*Geral*, *Capa*, *Painel*, *Editor* e *Árvore*) e habilite as funcionalidades de sua preferência.

### 3. Realizar o login no Copilot e no eproc
* **Login no eproc:** acesse o sistema normalmente na aba inicial. Os cookies de sessão são preservados ao fechar o navegador, respeitando o tempo de validade do próprio servidor do tribunal.
* **Login no Copilot:** ao habilitar a **Coluna Copilot**, faça login com a sua conta Microsoft diretamente no painel lateral do Copilot (ou pelo item de conta Microsoft no menu da engrenagem). Uma vez autenticado, você também pode definir atalhos de teclado no menu da engrenagem para as funções **PDF no Copilot**, **Minuta no Copilot**, **Ir ao Copilot** e **Alteração de Texto**.
