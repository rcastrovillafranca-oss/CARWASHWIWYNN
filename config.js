// Reemplaza estos dos valores con los de tu proyecto Supabase.
// Los encuentras en: supabase.com/dashboard -> tu proyecto -> Project Settings -> API
//
// SUPABASE_ANON_KEY acepta cualquiera de las dos claves PÚBLICAS de Supabase
// (nunca la secreta): la nueva "Publishable key" (empieza con sb_publishable_...)
// o la anterior "anon" key (un JWT que empieza con eyJ...). Cualquiera de las
// dos es segura para el frontend porque Row Level Security (ver
// supabase/schema.sql) controla qué puede hacer con ella.
//
// NUNCA pongas aquí la Secret key (sb_secret_...) ni la service_role key
// (JWT con "role":"service_role") — esas se saltan RLS por completo y jamás
// deben llegar al navegador.
const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_ANON_KEY = "TU-ANON-KEY-AQUI";
