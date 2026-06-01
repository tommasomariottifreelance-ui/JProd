# JProd — MES Pelletteria

## Deploy su Vercel (step by step, zero codice)

### 1. Carica il progetto su GitHub
1. Vai su github.com → New repository → nome "jprod" → Create
2. Trascina tutti i file di questa cartella nel browser GitHub → Commit

### 2. Deploy su Vercel
1. Vai su vercel.com → Log in with GitHub
2. "Add New Project" → seleziona il repository "jprod"
3. Framework: **Vite** (viene rilevato automaticamente)
4. Nella sezione **Environment Variables** aggiungi:
   - `VITE_SUPABASE_URL` → `https://vrreohemvforeldlbcht.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` → (copia dalla dashboard Supabase → Settings → API → anon public)
5. Clicca **Deploy** → in 2 minuti l'app è online

### 3. Configura Supabase Auth
1. Vai su supabase.com → tuo progetto → Authentication → Users
2. "Invite user" → inserisci le email del team
3. Ogni utente riceverà un link per impostare la password

### Struttura pagine
- `/` Dashboard KPI
- `/orders` Lista ordini con filtri e avanzamento
- `/production-log` Storico produzioni giornaliere
- `/reports` Report + export Excel
- `/import` Import file Excel ordini
- `/lines` Configurazione linee produzione
- `/brands` Gestione brand
