-- Fix: cadastro via Google nunca gravava signup_source. O trigger de
-- 068_resources.sql só dispara em INSERT ON auth.users, mas o metadata
-- signup_source só existe depois: o fluxo OAuth cria o usuário primeiro
-- (sem metadata nenhum, ver handle_new_user) e só then o client, já de volta
-- do redirect do Google, roda supabase.auth.updateUser({ data: { signup_source } })
-- (AuthContext.tsx). Isso é um UPDATE em auth.users, que o trigger antigo ignora.
-- Reaproveita a mesma função set_signup_source(), só estende o trigger pra
-- também disparar em UPDATE OF raw_user_meta_data.

DROP TRIGGER IF EXISTS zz_on_auth_user_signup_source_update ON auth.users;

CREATE TRIGGER zz_on_auth_user_signup_source_update
  AFTER UPDATE OF raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.set_signup_source();
