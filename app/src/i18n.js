export const STRINGS = {
  fr: {
    tabStudio: "Studio", tabVoices: "Voix", tabHistory: "Historique", tabSettings: "Réglages",
    scriptPlaceholder: "Écris ou colle ton texte de voix off ici…",
    titlePlaceholder: "Titre du projet (facultatif)",
    chars: "{n} caractères", estimate: "≈ {d}",
    voice: "Voix", language: "Langue de la voix",
    expressiveness: "Expressivité", expressivenessHint: "Plus haut = plus d'émotion",
    stability: "Rythme", stabilityHint: "Plus bas = débit plus posé",
    variation: "Variation", variationHint: "Plus haut = plus naturel, moins prévisible",
    speed: "Vitesse", pause: "Pause entre phrases",
    format: "Format", generate: "Générer la voix off", generating: "Génération…",
    generatingLong: "Génération en cours, cela peut prendre une minute pour un long texte.",
    download: "Télécharger", share: "Partager", reuse: "Réutiliser le texte", delete: "Supprimer",
    resultEmpty: "Ta voix off apparaîtra ici.",
    renderedIn: "Généré en {s} s",
    defaultVoice: "Voxa (voix par défaut)", library: "Bibliothèque", myVoices: "Mes voix",
    cloneTitle: "Cloner une voix", cloneIntro: "Un enregistrement de 10 à 30 secondes, voix seule, sans musique ni écho, suffit.",
    voiceName: "Nom de la voix", voiceDesc: "Description (facultatif)",
    importFile: "Importer un fichier audio", record: "Enregistrer", stopRecording: "Arrêter",
    recording: "Enregistrement… {s} s", sampleReady: "Échantillon prêt : {name}",
    consent: "Je confirme être cette personne ou avoir son accord explicite pour cloner sa voix.",
    createVoice: "Créer la voix", creatingVoice: "Analyse de la voix…",
    voiceCreated: "Voix « {name} » créée.", noVoices: "Aucune voix clonée pour l'instant. Crée la première ci-dessus.",
    preview: "Écouter", use: "Utiliser", deleteVoiceConfirm: "Supprimer la voix « {name} » ?",
    historyEmpty: "Aucune voix off générée pour l'instant. Rends-toi dans le Studio pour créer la première.",
    deleteItemConfirm: "Supprimer cette voix off ?",
    server: "Adresse du moteur", serverHint: "Ordinateur ou serveur où tourne le moteur Voxa, ex. http://192.168.1.20:8000",
    apiKey: "Clé d'accès", apiKeyHint: "Uniquement si le moteur est protégé par VOXA_API_KEY.",
    save: "Enregistrer", saved: "Réglages enregistrés.", interfaceLanguage: "Langue de l'interface", theme: "Thème",
    themeAuto: "Automatique", themeLight: "Clair", themeDark: "Sombre",
    statusReady: "Moteur prêt · {device}", statusLoading: "Chargement du modèle…",
    statusOffline: "Moteur injoignable", statusError: "Erreur du moteur",
    offlineHelp: "Lance le moteur sur ton ordinateur (start.bat ou start.sh), puis vérifie son adresse dans les Réglages.",
    loadingHelp: "Au premier lancement, le modèle (~3 Go) se télécharge. Patiente quelques minutes.",
    errors: {
      consent_required: "Coche la case de consentement pour cloner une voix.",
      name_required: "Donne un nom à la voix.",
      sample_too_short: "L'échantillon est trop court : il faut au moins 4 secondes de voix.",
      bad_audio: "Ce fichier audio est illisible. Essaie un WAV ou un MP3.",
      text_too_long: "Le texte est trop long pour une seule génération. Découpe-le en plusieurs parties.",
      invalid_key: "Clé d'accès refusée. Vérifie-la dans les Réglages.",
      voice_not_found: "Cette voix n'existe plus. Choisis-en une autre.",
      engine_loading: "Le modèle est encore en chargement. Réessaie dans un instant.",
      engine_error: "Le moteur n'a pas pu charger le modèle. Regarde la fenêtre du moteur pour le détail.",
      network: "Impossible de joindre le moteur. Vérifie qu'il tourne et son adresse dans les Réglages.",
      mic: "Accès au micro refusé. Autorise-le dans les réglages de ton appareil.",
      empty_text: "Écris un texte avant de générer.",
      no_sample: "Ajoute un échantillon audio : importe un fichier ou enregistre-toi.",
      generic: "Une erreur est survenue : {msg}",
    },
    ffmpegNote: "FFmpeg absent sur le moteur : fichier livré en WAV, vitesse non appliquée.",
  },
  en: {
    tabStudio: "Studio", tabVoices: "Voices", tabHistory: "History", tabSettings: "Settings",
    scriptPlaceholder: "Write or paste your voice-over script here…",
    titlePlaceholder: "Project title (optional)",
    chars: "{n} characters", estimate: "≈ {d}",
    voice: "Voice", language: "Voice language",
    expressiveness: "Expressiveness", expressivenessHint: "Higher = more emotion",
    stability: "Pacing", stabilityHint: "Lower = calmer delivery",
    variation: "Variation", variationHint: "Higher = more natural, less predictable",
    speed: "Speed", pause: "Pause between sentences",
    format: "Format", generate: "Generate voice-over", generating: "Generating…",
    generatingLong: "Generating — a long script can take a minute.",
    download: "Download", share: "Share", reuse: "Reuse text", delete: "Delete",
    resultEmpty: "Your voice-over will appear here.",
    renderedIn: "Rendered in {s} s",
    defaultVoice: "Voxa (default voice)", library: "Library", myVoices: "My voices",
    cloneTitle: "Clone a voice", cloneIntro: "A 10–30 second recording of the voice alone, with no music or echo, is enough.",
    voiceName: "Voice name", voiceDesc: "Description (optional)",
    importFile: "Import an audio file", record: "Record", stopRecording: "Stop",
    recording: "Recording… {s} s", sampleReady: "Sample ready: {name}",
    consent: "I confirm I am this person or have their explicit permission to clone their voice.",
    createVoice: "Create voice", creatingVoice: "Analysing the voice…",
    voiceCreated: "Voice “{name}” created.", noVoices: "No cloned voices yet. Create your first one above.",
    preview: "Listen", use: "Use", deleteVoiceConfirm: "Delete the voice “{name}”?",
    historyEmpty: "No voice-overs yet. Head to the Studio to create your first one.",
    deleteItemConfirm: "Delete this voice-over?",
    server: "Engine address", serverHint: "Computer or server running the Voxa engine, e.g. http://192.168.1.20:8000",
    apiKey: "Access key", apiKeyHint: "Only if the engine is protected with VOXA_API_KEY.",
    save: "Save", saved: "Settings saved.", interfaceLanguage: "Interface language", theme: "Theme",
    themeAuto: "Automatic", themeLight: "Light", themeDark: "Dark",
    statusReady: "Engine ready · {device}", statusLoading: "Loading the model…",
    statusOffline: "Engine unreachable", statusError: "Engine error",
    offlineHelp: "Start the engine on your computer (start.bat or start.sh), then check its address in Settings.",
    loadingHelp: "On first launch the model (~3 GB) downloads. Give it a few minutes.",
    errors: {
      consent_required: "Tick the consent box to clone a voice.",
      name_required: "Give the voice a name.",
      sample_too_short: "The sample is too short: at least 4 seconds of speech is needed.",
      bad_audio: "This audio file can't be read. Try a WAV or MP3.",
      text_too_long: "The script is too long for one generation. Split it into parts.",
      invalid_key: "Access key rejected. Check it in Settings.",
      voice_not_found: "This voice no longer exists. Pick another one.",
      engine_loading: "The model is still loading. Try again in a moment.",
      engine_error: "The engine couldn't load the model. Check the engine window for details.",
      network: "Can't reach the engine. Check it's running and its address in Settings.",
      mic: "Microphone access denied. Allow it in your device settings.",
      empty_text: "Write a script before generating.",
      no_sample: "Add an audio sample: import a file or record yourself.",
      generic: "Something went wrong: {msg}",
    },
    ffmpegNote: "FFmpeg missing on the engine: delivered as WAV, speed not applied.",
  },
};

let lang = "fr";

export function setLang(l) { lang = STRINGS[l] ? l : "en"; }
export function getLang() { return lang; }

export function t(key, vars = {}) {
  const path = key.split(".");
  let s = STRINGS[lang];
  for (const p of path) s = s?.[p];
  if (typeof s !== "string") return key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export function errorText(code) {
  const known = STRINGS[lang].errors[code];
  return known || t("errors.generic", { msg: code });
}

export function applyStatic(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  document.documentElement.lang = lang;
}
