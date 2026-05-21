import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

console.log(
  '[investsim] supabaseClient init →',
  'URL:', url ?? 'UNDEFINED ⚠️',
  '| KEY:', key ? key.slice(0, 24) + '…' : 'UNDEFINED ⚠️'
)

if (!url || !key) {
  console.error('[investsim] ⚠️ Variabili d\'ambiente mancanti. Hai riavviato il dev server dopo aver creato .env.local?')
}

export const supabase = createClient(url, key)
