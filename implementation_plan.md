# ME Comunications - Piano di Implementazione

Questo documento delinea l'architettura tecnica e i passaggi per creare "ME Comunications", una web app accattivante e completa basata su HTML, Tailwind CSS e Node.js.

## Obiettivo
Sviluppare una piattaforma di comunicazione real-time moderna che emuli e superi le funzionalità di WhatsApp, con un'interfaccia utente premium (glassmorphism, animazioni, dark mode nativa) e funzionalità avanzate come avatar 3D e filtri anti-spam.

> [!IMPORTANT]
> **Revisione Utente Richiesta**
> Si prega di leggere attentamente la sezione "Domande Aperte" e fornire un feedback prima che inizi lo sviluppo.

## Architettura Tecnica Proposta

### Frontend (Client)
*   **Tecnologia:** HTML, Vanilla JavaScript e **Tailwind CSS**. Useremo **Vite** come bundler per avere un ambiente di sviluppo rapido e compilare gli asset ottimizzati.
*   **Design:** UI Premium, responsive, con transizioni fluide, micro-animazioni e supporto alla modalità scura.
*   **Real-time:** Client `socket.io-client` per i messaggi.
*   **Media & WebRTC:** Utilizzo di API native del browser (`MediaRecorder` per audio, `RTCPeerConnection` per chiamate/videochiamate).

### Backend (Server)
*   **Tecnologia:** Node.js con framework **Express.js**.
*   **Real-time:** **Socket.io** per la gestione di chat singole, gruppi e community.
*   **Elaborazione Media:**
    *   **Sharp** (Libreria Node) per ridimensionare/comprimere le immagini mantenendo alta risoluzione.
    *   **FFmpeg** (via `fluent-ffmpeg`) per comprimere i video e per mixare l'audio sotto le foto/video negli "Stati".
*   **Sicurezza e Spam:** Implementazione di un algoritmo euristico e NLP per analizzare i pattern dei messaggi, identificare link malevoli e avvisare l'utente di possibili truffe.

### Funzionalità Specifiche
1.  **Avatar 3D in chiamata:** Utilizzeremo **MediaPipe Face Mesh** (per tracciare le espressioni facciali via webcam senza mostrare il viso) e **Three.js** (per renderizzare un modello 3D). Il video risultante dal canvas 3D verrà trasmesso via WebRTC.
2.  **Meme e GIF:** Integrazione con l'API gratuita di **Tenor** o **Giphy** per cercare e inviare GIF direttamente dalla chat.
3.  **Importazione CSV:** Creazione di un endpoint in cui si carica il CSV; il server esegue il parsing (`csv-parser`) e salva o sincronizza i contatti nel database dell'utente.
4.  **Stati/Storie:** Una tabella nel database dedicata ai media a scadenza (24h). L'aggiunta di audio sarà processata sul server (unendo file immagine/video con la traccia audio).

---

## ❓ Domande Aperte (Rispondi per favore)

> [!WARNING]
> Ho bisogno delle tue direttive su questi 4 punti fondamentali per configurare il backend:

1.  **Database:** Dove vuoi salvare i messaggi e gli account? Ti propongo **MongoDB** (eccellente per le chat e scalabile) o un database SQL come **PostgreSQL / Supabase** (come abbiamo fatto per ME Graphics). Cosa preferisci?
2.  **Autenticazione:** Per un "vero" WhatsApp servirebbe l'accesso via Numero di Telefono (con SMS OTP tipo Twilio). Per iniziare lo sviluppo, preferisci implementare subito gli SMS o partiamo con **Email e Password** per testare più velocemente?
3.  **Archiviazione File:** Foto, video e audio occuperanno spazio. Li salviamo temporaneamente **in locale sul server** o configuriamo un cloud storage (es. **AWS S3**, **Supabase Storage** o **Cloudinary**)?
4.  **Avatar 3D:** Per gli avatar personalizzati, sei d'accordo se usiamo i modelli gratuiti standard di "Ready Player Me" o vuoi usare degli avatar predefiniti del sistema (es. volpe, robot, ecc.)?

---

## Piano di Esecuzione (Fasi successive all'approvazione)

### Fase 1: Setup dell'Infrastruttura
*   Inizializzazione progetto Vite (Frontend) e Express (Backend).
*   Setup Tailwind CSS e configurazione dei colori premium (Design System).
*   Configurazione del Database e modelli Dati (Utenti, Messaggi, Chat).

### Fase 2: Autenticazione e Design Base
*   Creazione schermate di Login/Registrazione accattivanti.
*   Layout principale dell'app (Sidebar, Lista Chat, Area Messaggi, Profilo).

### Fase 3: Core Messaging (Messaggi, Gruppi e Media)
*   Integrazione Socket.io per invio messaggi e gruppi.
*   Uploader di immagini, video (con compressione FFmpeg/Sharp) e note vocali.
*   Integrazione API GIF/Meme.

### Fase 4: Chiamate, Avatar e Stati
*   Sviluppo segnalazione WebRTC per audio/video chiamate.
*   Integrazione tracciamento facciale e Canvas 3D per gli Avatar.
*   Sistema di pubblicazione "Stati" con mix audio-video.

### Fase 5: Strumenti Avanzati (CSV, Spam, Blocchi)
*   Sviluppo importatore CSV rubrica.
*   Logica di blocco utenti.
*   Algoritmo di rilevamento Spam/Truffa sui messaggi in entrata.
