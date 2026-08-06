# Omie Validator

Uma pequena aplicação local feita em Next.js para cruzar e validar dados de Pagamentos (Pix, Boleto, etc) do sistema Admin contra o ERP Omie (Contas a Receber).

## Requisitos
- Node.js versão 18 ou superior

## Como Rodar

1. Cópia as variáveis de ambiente:
   Renomeie o arquivo `.env.example` para `.env` e preencha as variáveis de banco de dados (da sua máquina local ou homologação) e as Chaves da Omie.

2. Inicie a aplicação
   Abra seu terminal na pasta do projeto e rode o comando:
   ```bash
   npm run dev
   ```

3. Abra o navegador em:
   [http://localhost:3000](http://localhost:3000)

## Conferência de NFS-e (`/nfse`)

Confronta os pagamentos do Admin com as NFS-e faturadas na Omie pelo **número da nota**
(a mesma chave gravada em `tb_nfs.numero_nfs` quando a nota é vinculada no Admin), então
o casamento é exato. Mostra:

- fechamento por dia do período (diário, semanal ou mensal, conforme o filtro);
- pagamentos sem NFS-e confirmada;
- NFS-e emitidas na Omie e ainda não vinculadas no Admin;
- possíveis duplicidades (mais de uma nota para o mesmo destinatário e valor).

### Vincular pela tela

O botão **Vincular** aparece apenas para pagamentos que já têm OS criada na Omie e estão
sem o número da nota. A ação é executada pelo Admin (`nfs_massivo/processar_direto`), e
não direto na Omie, porque o Admin já concentra o controle de consumo da API, a gravação
no banco e o upload do PDF — chamar a Omie daqui criaria um segundo consumidor
competindo pela mesma cota.

Para habilitar, configure no `.env`:

```
CNM_ADMIN_URL=https://www.chavesnamao.com.br/
CNM_ADMIN_USER=usuario.do.admin
CNM_ADMIN_PASS=senha
```

Sem essas variáveis a tela continua funcionando normalmente; apenas a vinculação
responde avisando que está indisponível.

## Lógica de Cruzamento:
O sistema cruza um pagamento no Admin com o Omie se **o valor for correspondente** e satisfazer pelo menos uma das outras duas condições (flexibilidade):
- Número do Documento (CPF/CNPJ) for o mesmo
- Número da Nota for o mesmo
