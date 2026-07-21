# Convites e recuperacao de acesso

O modulo de usuarios usa `clinic_invitations` como fonte oficial do ciclo de
vida. Convites tem validade padrao de 72 horas, configuravel entre 24 e 168
horas nas preferencias de cadastro.

## Configuracao do Supabase Auth

- Ative e-mail e senha.
- Configure `Site URL` com o dominio de producao.
- Adicione `https://SEU_DOMINIO/**` e `http://localhost:3000/**` em Redirect URLs.
- Configure os templates Invite user e Reset password para usar o callback
  `/auth/callback`.
- Configure SMTP transacional proprio para producao.
- Publique SPF, DKIM e DMARC no dominio de envio.

## Operacao

Cada reenvio cancela o registro anterior e cria outro identificador. O link
anterior nao pode ativar o acesso novamente. O cancelamento revoga o vinculo
pendente, preserva a conta do Supabase Auth e registra o motivo na auditoria.

O sistema limita reenvios a cinco por convite e aplica intervalo minimo de um
minuto. Convites aceitos nao podem ser cancelados; o membro deve ser suspenso.

## Recuperacao

`/recuperar-senha` sempre retorna uma mensagem generica para nao revelar se o
e-mail existe. O link e temporario, leva a `/redefinir-senha/nova` e a senha
nova exige oito caracteres, maiuscula, minuscula e numero. A troca e registrada
na auditoria. O mesmo fluxo pode recuperar a senha do proprietario, mas o
acesso ao `/console` continua exigindo MFA.
