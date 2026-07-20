# Control plane da plataforma

O control plane fica em `/plataforma` e usa o mesmo Supabase Auth do sistema. Não
existe uma senha paralela: o acesso é concedido pelo `platform_role` do perfil.

## Papéis

- `platform_admin`: administração global, saúde, billing, auditoria técnica,
  diagnostics, feature flags e controles.
- `platform_support`: saúde e diagnósticos técnicos, sem dados de pacientes.
- `platform_billing`: planos, assinaturas e indicadores agregados de billing.
- `platform_security`: auditoria técnica, saúde e diagnósticos de segurança.

Nenhum desses papéis recebe automaticamente permissões clínicas. O painel usa
leituras server-side e não exibe CPF, prontuários, laudos, documentos médicos ou
conteúdo assistencial.

## Primeiro acesso do proprietário da plataforma

1. Crie ou confirme a conta normalmente pelo login do CliniCore.
2. No SQL Editor do Supabase, execute o comando abaixo substituindo o e-mail:

```sql
update public.profiles
set platform_role = 'platform_admin'
where email = 'seu-email@dominio.com'
  and deleted_at is null;
```

3. Saia e entre novamente no sistema.
4. Abra `/plataforma` ou use o menu superior **Plataforma**.

Nunca salve a senha em código, migration ou documentação. Para os papéis
limitados, substitua o valor por `platform_support`, `platform_billing` ou
`platform_security`.

## Acesso emergencial

O recurso registra uma solicitação com motivo, escopo somente leitura, duração
máxima de 60 minutos e aprovação obrigatória. Ele não abre prontuários e não
concede acesso clínico por si só. A implantação de MFA obrigatório e aprovação
por segundo administrador deve ser concluída antes de habilitar qualquer acesso
assistencial excepcional.

## Diagnósticos

Os testes do painel registram somente metadados. Testes que criem registros
devem usar uma clínica técnica separada, com dados fictícios, e nunca uma clínica
de cliente.
