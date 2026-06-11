/* Configuración pública de la quiniela. La anon key es pública por diseño:
   la seguridad real son las políticas RLS en Supabase. */
window.WC = window.WC || {};
WC.CONFIG = {
  SUPABASE_URL: "https://wwzgpifvfmogjttwstxy.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3emdwaWZ2Zm1vZ2p0dHdzdHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTYwOTksImV4cCI6MjA5NjY5MjA5OX0.lG2Emk98WX-hukiZfzI_UbeKPbZ7MVkeBp84GkoZFFk",
  // Llave pública VAPID para web push (la privada vive como secret de GitHub)
  VAPID_PUBLIC_KEY: "BFovXeG7ex6_Y8NWZO9k_TRWWkXZTlgRK-nc6vaKhxfO0UBrc1G9Ov4CP23rEtIxSmVTqu-6GKVTaKBLzGt87Jg"
};
