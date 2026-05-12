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

## Lógica de Cruzamento:
O sistema cruza um pagamento no Admin com o Omie se **o valor for correspondente** e satisfazer pelo menos uma das outras duas condições (flexibilidade):
- Número do Documento (CPF/CNPJ) for o mesmo
- Número da Nota for o mesmo
