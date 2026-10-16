# Segurança

## Como relatar uma falha

Não abra issue pública para falha de segurança. Use o **relatório privado de vulnerabilidade**
do GitHub (aba *Security* → *Report a vulnerability*) neste repositório. Inclua a versão do app,
o aparelho, o passo a passo para reproduzir e o impacto. A resposta sai em até 7 dias.

## O que o ELYSIUM-M faz para se proteger

- O token do pareamento fica no armazenamento seguro do Android (Keystore), nunca em texto.
- O QR de pareamento só aceita endereços de rede privada, porta e token no formato esperado,
  e o pareamento só é gravado depois de a pessoa confirmar o nome e o endereço do PC.
- A busca do PC na rede não envia o token aos outros aparelhos: primeiro identifica o
  ELYSIUM sem token, e só então se autentica.
- Links tocados nas conversas só abrem se forem `http(s)`; instaladores e scripts recebidos do
  PC não abrem direto.
- Ações destrutivas no PC pedem confirmação (e biometria quando o aparelho tem).
