/**
 * French catalogue. Keys are the English source strings, so anything missing
 * here simply renders in English.
 *
 * Scope: the settings panel and the dialogs — the two text-dense screens. The
 * rest of the shell (Plans, Memory, Stats, Save) is short and self-evident, and
 * the terminal itself is Claude Code's output, which stays in English.
 */
window.registerLocale('fr', {
  // --- Shared ---
  'Cancel': 'Annuler',
  'Add': 'Ajouter',
  'Browse': 'Parcourir',
  'Connect': 'Se connecter',
  'Connecting…': 'Connexion…',
  '✓ Connected': '✓ Connecté',
  'Test': 'Tester',
  'Start': 'Démarrer',
  'Resume': 'Reprendre',
  'Retry': 'Réessayer',
  'Loading…': 'Chargement…',
  'Host': 'Hôte',
  'User': 'Utilisateur',
  'Port': 'Port',
  'Label': 'Libellé',
  'Worktree': 'Worktree',
  'Chrome': 'Chrome',
  'Permission Mode': 'Mode de permission',
  'Additional Directories': 'Répertoires supplémentaires',
  'Pre-launch Command': 'Commande de pré-lancement',
  'Enable Chrome browser automation': "Activer l'automatisation du navigateur Chrome",

  // --- Permission modes ---
  'Default': 'Par défaut',
  'Default (none)': 'Par défaut (aucun)',
  'Accept Edits': 'Accepter les modifications',
  'Plan Mode': 'Mode plan',
  "Don't Ask": 'Ne pas demander',
  'Bypass': 'Contourner',
  'Dangerous Skip': 'Contournement risqué',
  'Prompt for all actions': 'Demander pour chaque action',
  'Auto-accept file edits, prompt for others': 'Accepter les modifications de fichiers, demander pour le reste',
  'Read-only exploration, no writes': 'Exploration en lecture seule, aucune écriture',
  'Auto-deny tools not explicitly allowed': 'Refuser les outils non explicitement autorisés',
  'Auto-accept all tool calls': 'Accepter automatiquement tous les appels d’outils',
  'Skip all safety prompts (use with caution)': 'Ignorer toutes les confirmations de sécurité (à utiliser avec prudence)',

  // --- Settings panel: sections ---
  'Claude CLI Options': 'Options du CLI Claude',
  'Session Launch': 'Lancement de session',
  'Application': 'Application',
  'Updates': 'Mises à jour',
  'Remote Hosts (SSH)': 'Hôtes distants (SSH)',

  // --- Settings panel: fields ---
  'Worktree Name': 'Nom du worktree',
  'Custom name for worktree branches': 'Nom personnalisé pour les branches de worktree',
  'Enable worktree for new sessions': 'Activer le worktree pour les nouvelles sessions',
  'Extra directories to include in Claude sessions': 'Répertoires supplémentaires à inclure dans les sessions Claude',
  'Max Visible Sessions': 'Sessions visibles au maximum',
  'Session Max Age (days)': 'Âge maximal des sessions (jours)',
  'Shell Profile': 'Profil de shell',
  'Auto (detect)': 'Automatique (détection)',
  'Terminal Theme': 'Thème du terminal',
  'Color theme for terminal sessions': 'Thème de couleurs des sessions de terminal',
  'IDE Emulation': 'Émulation IDE',
  'IDE integration over SSH': 'Intégration IDE via SSH',
  'Version': 'Version',
  'Check for Updates': 'Rechercher des mises à jour',
  'Save Settings': 'Enregistrer les réglages',
  'Save Hosts': 'Enregistrer les hôtes',
  'Add Host': 'Ajouter un hôte',
  'Hide Project': 'Masquer le projet',

  // --- Settings panel: status ---
  '✓ Saved': '✓ Enregistré',
  'Testing…': 'Test en cours…',
  'Failed to save hosts.': "Échec de l'enregistrement des hôtes.",
  'Enter a host first.': "Renseignez d'abord un hôte.",
  'Save to enable Connect/Test': 'Enregistrez pour activer Connexion/Test',
  'From ~/.ssh/config': 'Depuis ~/.ssh/config',

  // --- Dialogs: add project ---
  'Add Project': 'Ajouter un projet',
  'Local folder': 'Dossier local',
  'Remote (SSH)': 'Distant (SSH)',
  'Remote Directory': 'Répertoire distant',
  'Remote directory': 'Répertoire distant',
  'Please enter a folder path.': 'Saisissez un chemin de dossier.',
  'Select this directory': 'Choisir ce répertoire',
  '(no subdirectories)': '(aucun sous-répertoire)',

  // --- Dialogs: SSH host ---
  'Add SSH Host': 'Ajouter un hôte SSH',
  'Identity file': "Fichier d'identité",
  'Extra options': 'Options supplémentaires',
  'Save host': "Enregistrer l'hôte",
  'Select or add a host.': 'Sélectionnez ou ajoutez un hôte.',
  'Select or add a host first.': "Sélectionnez ou ajoutez d'abord un hôte.",
  'Connection failed': 'Échec de la connexion',
  'Yes, connect': 'Oui, se connecter',
  'Working directory on the remote host': 'Répertoire de travail sur l’hôte distant',
  'No SSH hosts configured. Add them in Settings → Remote Hosts.':
    'Aucun hôte SSH configuré. Ajoutez-en dans Réglages → Hôtes distants.',
  'This host needs interactive login. Open a session to it once to authenticate, then try Browse again — or just type the path.':
    'Cet hôte exige une connexion interactive. Ouvrez-y une session une fois pour vous authentifier, puis réessayez Parcourir — ou saisissez simplement le chemin.',

  // --- Dialogs: session options ---
  'Run session in an isolated git worktree': 'Lancer la session dans un worktree git isolé',
  'Extra directories to include (comma-separated)': 'Répertoires supplémentaires à inclure (séparés par des virgules)',
  'Prepended to the claude command': 'Ajouté avant la commande claude',

  // --- Phrases contenant du balisage (traduites d'un bloc) ---
  'Permission mode passed to the <code>claude</code> command':
    'Mode de permission transmis à la commande <code>claude</code>',
  'Emulate an IDE so Claude can open files and diffs in a side panel. Disable to use your own IDE instead. Changes take effect for new sessions only.':
    "Émuler un IDE pour que Claude ouvre fichiers et diffs dans un panneau latéral. Désactivez pour utiliser votre propre IDE. Prend effet sur les nouvelles sessions uniquement.",
  "Let <strong>remote</strong> Claude sessions open files and diffs in Switchboard's side panel, like local ones. This reverse-forwards the local IDE port to the remote host (protected by a per-session token) \u2014 enable only for hosts you trust. Off by default; applies to new remote sessions.":
    "Permettre aux sessions Claude <strong>distantes</strong> d'ouvrir fichiers et diffs dans le panneau latéral de Switchboard, comme les locales. Cela redirige le port IDE local vers l'hôte distant (protégé par un jeton par session) \u2014 à n'activer que pour des hôtes de confiance. Désactivé par défaut ; s'applique aux nouvelles sessions distantes.",
  'Hosts from <code>~/.ssh/config</code> are imported automatically. Add extra hosts below. Authentication uses your SSH agent/keys \u2014 passwords are never stored.':
    "Les hôtes de <code>~/.ssh/config</code> sont importés automatiquement. Ajoutez-en d'autres ci-dessous. L'authentification utilise votre agent et vos clés SSH \u2014 aucun mot de passe n'est stocké.",
  'Select a folder to create a new project. To start a session in an existing project, use the + on its project header.':
    "Choisissez un dossier pour créer un projet. Pour démarrer une session dans un projet existant, utilisez le + sur son en-tête.",

  // --- Complements ---
  'Prepended to the claude command (e.g. "aws-vault exec profile --")':
    'Ajouté avant la commande claude (ex. « aws-vault exec profile -- »)',
  'Shell used for terminal and Claude sessions. Changes take effect for new sessions only.':
    'Shell utilisé pour les sessions terminal et Claude. Prend effet sur les nouvelles sessions uniquement.',
  'Show up to this many sessions before collapsing the rest behind "+N older"':
    'Nombre de sessions affichées avant de replier les autres sous « +N plus anciennes »',
  'Sessions older than this are hidden behind "+N older" even if under the count limit':
    'Les sessions plus anciennes sont repliées sous « +N plus anciennes », même sous la limite de nombre',
  'IDE Emulation setting changed. New sessions will use the updated setting \u2014 running sessions are not affected.':
    "Réglage d'émulation IDE modifié. Les nouvelles sessions l'utiliseront \u2014 les sessions en cours ne sont pas affectées.",
  'First time connecting to this host. Confirm the fingerprint to continue.':
    "Première connexion à cet hôte. Confirmez l'empreinte pour continuer.",
  '\u2014 checking\u2026': '\u2014 vérification\u2026',
  '\u2014 up to date': '\u2014 à jour',
  '\u2014 check failed': '\u2014 échec de la vérification',
  'No': 'Non',
  'Error: ': 'Erreur : ',
  '(no hosts yet)': '(aucun hôte pour le moment)',
  'Extra <code>ssh -o</code> options for legacy/special hosts \u2014 leave blank for most. Click to add:':
    "Options <code>ssh -o</code> supplémentaires pour hôtes anciens ou particuliers \u2014 à laisser vide dans la plupart des cas. Cliquez pour ajouter :",
  'Choose an SSH host and a remote directory \u2014 or pick <strong>+ Add new host\u2026</strong> to define one here. If the host needs a password, click <strong>Connect</strong> to log in once, then Browse.':
    "Choisissez un hôte SSH et un répertoire distant \u2014 ou <strong>+ Ajouter un hôte…</strong> pour en définir un ici. Si l'hôte demande un mot de passe, cliquez sur <strong>Se connecter</strong> pour vous authentifier une fois, puis Parcourir.",
  'OK': 'OK',
  'Go': 'Aller',

  // --- Coquille : infobulles de la barre laterale et de l'en-tete ---
  // Adoptees a la volee depuis title= par tooltips.js, d'ou l'absence de t()
  // au point d'appel.
  'Sessions': 'Sessions',
  'Plans': 'Plans',
  'Agent Files': 'Fichiers agents',
  'Stats': 'Statistiques',
  'Global settings': 'Réglages globaux',
  'Project settings': 'Réglages du projet',
  'Show sidebar': 'Afficher la barre latérale',
  'Hide sidebar': 'Masquer la barre latérale',
  'Show running only': 'Afficher uniquement les sessions actives',
  'Show pinned only': 'Afficher uniquement les épinglées',
  "Show today's sessions only": "Afficher uniquement les sessions du jour",
  'Show archived sessions': 'Afficher les sessions archivées',
  'Search titles only': 'Chercher dans les titres seulement',
  'Re-sort sessions': 'Retrier les sessions',
  'Add project': 'Ajouter un projet',
  'Stop process': 'Arrêter le processus',
  'Stop session': 'Arrêter la session',
  'Session overview': "Vue d'ensemble des sessions",
  'New session': 'Nouvelle session',
  'New session in worktree': 'Nouvelle session dans un worktree',
  'Resume with config': 'Reprendre avec configuration',
  'Fork session': 'Dupliquer la session',
  'View messages': 'Voir les messages',
  'Create scheduled task': 'Créer une tâche planifiée',
  'Archive all sessions': 'Archiver toutes les sessions',
  'Archive all sessions in group': 'Archiver toutes les sessions du groupe',
  'Hide worktree': 'Masquer le worktree',
  'Refresh remote sessions': 'Actualiser les sessions distantes',
  'Refresh usage': "Actualiser l'utilisation",

  // --- Coquille : texte statique ---
  'Search sessions...': 'Rechercher des sessions…',
  'Activity': 'Activité',
  'Settings': 'Réglages',
  'Message History': 'Historique des messages',
  'Session Overview': "Vue d'ensemble des sessions",
  'Update ready \u2014 restart to apply': 'Mise à jour prête \u2014 redémarrez pour appliquer',
  'Restart': 'Redémarrer',
  'Later': 'Plus tard',

  // --- Barre d'outils des visualiseurs ---
  'Copy file path': 'Copier le chemin du fichier',
  'Copy raw content': 'Copier le contenu brut',
  'Toggle markdown preview': "Basculer l'aperçu markdown",
  'Back to editor': "Revenir à l'éditeur",
  'Toggle line wrapping': 'Basculer le retour à la ligne',
  'Go to line (Cmd+G)': 'Aller à la ligne (Cmd+G)',
  'Save changes': 'Enregistrer les modifications',
  'Close panel': 'Fermer le panneau',
  'Switch to side-by-side diff': 'Passer au diff côte à côte',
  'Switch to inline diff': 'Passer au diff en ligne',
  'Select a session from the sidebar to begin.':
    'Sélectionnez une session dans la barre latérale pour commencer.',
  'Click the Stats tab to view activity heatmap.':
    "Cliquez sur l'onglet Statistiques pour voir la carte d'activité.",

  // Statut des agents (hooks)
  'Agent Status': 'Statut des agents',
  'Claude Code reports when a turn starts, needs you, or finishes, through a hook Switchboard installs in <code>~/.claude/settings.json</code>. Without it, session activity is guessed from the terminal title, which is less reliable. Hooks you configured yourself are never modified.':
    "Claude Code signale le début d'un tour, une attente de votre part et la fin, via un hook que Switchboard installe dans <code>~/.claude/settings.json</code>. Sans lui, l'activité est devinée à partir du titre du terminal, ce qui est moins fiable. Les hooks que vous avez configurés vous-même ne sont jamais modifiés.",
  'Hook': 'Hook',
  'Test': 'Tester',
  'Refresh': 'Rafraîchir',
  'checking…': 'vérification…',
  'testing…': 'test en cours…',
  'refreshing…': 'rafraîchissement…',
  'unavailable': 'indisponible',
  'unknown': 'inconnue',
  'no response': 'aucune réponse',
  'test delivered': 'test délivré',
  'test failed — {error}': 'échec du test — {error}',
  'refresh failed — {error}': 'échec du rafraîchissement — {error}',
  'not installed in ~/.claude/settings.json': 'non déclaré dans ~/.claude/settings.json',
  'not listening — {error}': "socket non ouvert — {error}",
  'active — {count} sessions reporting': 'actif — {count} sessions rapportent leur état',
  'conflict — {events} owned by another install':
    "conflit — {events} appartiennent à une autre installation",
});
