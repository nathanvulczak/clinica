# Template de convite do Supabase

Para o fluxo SSR do CliniCore, configure em **Supabase > Authentication > Email Templates > Invite user** um link que envie o `token_hash` ao callback da aplicação:

```html
<h2>Você foi convidado para o CliniCore</h2>
<p>Use o botão abaixo para confirmar seu e-mail e criar sua senha de acesso.</p>
<p>
  <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}">
    Ativar meu acesso
  </a>
</p>
```

Em **Authentication > URL Configuration**:

- `Site URL`: `https://clinica-seven-rouge.vercel.app`
- Redirect URL de produção: `https://clinica-seven-rouge.vercel.app/**`
- Redirect URL local: `http://localhost:3000/**`

O link é de uso único. Se ele expirar ou for aberto anteriormente, o administrador deve reenviar o convite pela tela de usuários.
