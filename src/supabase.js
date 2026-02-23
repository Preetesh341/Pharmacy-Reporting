import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qvqxerwmevwnprbuqedq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF2cXhlcndtZXZ3bnByYnVxZWRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTAyNDcsImV4cCI6MjA4NzM2NjI0N30.B8LMNlkjT1B8RU2pDVJ2f_vrwhhUO3XZYKbEYjFEKvw'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
