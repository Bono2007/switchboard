# Statut des agents par hooks

Switchboard sait maintenant quand une session Claude Code travaille, attend une
réponse ou a terminé — parce que le CLI le lui dit, au lieu que Switchboard
essaie de le deviner.

## Le problème

Jusqu'ici, l'état d'une session était déduit du **titre du terminal** : un
caractère braille en tête du titre OSC 0 signifiait « occupé », un `✳`
signifiait « inactif » (`main.js`, parsing OSC). C'est du scraping d'affichage :

- ça casse au premier changement cosmétique du CLI ;
- ça ne distingue pas « a terminé » de « attend ta réponse » ;
- ça ne dit rien quand la session tourne en SSH.

## Le principe

Deux sources, une hiérarchie claire — **les hooks font foi**.

| Source | Rôle |
|---|---|
| Hooks | Le CLI signale la phase exacte (`working`, `waiting`, `finished`). Appliqué immédiatement. |
| Détection OSC | Filet de sécurité pour les sessions sans hooks. Ne sert plus qu'à titre indicatif dès qu'une session a prouvé qu'elle est hookée. |

Quand une session hookée est détectée inactive, on n'éteint pas tout de suite :
on ouvre une **fenêtre de grâce**, et un hook qui arrive pendant cette fenêtre
gagne toujours.

| Statut | Fenêtre | Ce qui se passe à l'expiration |
|---|---|---|
| `working` | 4 s | Passe en inactif. Le hook `Stop` est imminent, on lui laisse le temps. |
| `waiting` | 30 s | Passe en inactif **uniquement si le processus est mort**. Sinon, nouvelle vérification. |

L'asymétrie est volontaire : un agent qui attend ta réponse a toujours un
processus vivant. L'éteindre effacerait justement le badge qui te dit de
répondre. À l'inverse, un agent tué n'exécute jamais son hook `Stop` — c'est la
vérification du processus qui récupère le panneau.

Une activité détectée, elle, est toujours appliquée immédiatement : elle ne peut
signifier qu'une chose, qu'un agent tourne.

## Installation

Automatique au lancement. Switchboard :

1. **copie** le client hook hors de l'application, vers `~/.switchboard/hooks/` ;
2. **génère** un shim `switchboard-hook` qui l'exécute ;
3. **déclare** ce shim dans `~/.claude/settings.json` pour quatre événements.

| Événement Claude Code | Phase |
|---|---|
| `UserPromptSubmit` | `working` |
| `Notification` | `waiting` |
| `Stop` | `finished` |
| `SessionEnd` | `finished` |

`PreToolUse` / `PostToolUse` sont volontairement absents : ils se déclenchent en
permanence et n'apprennent rien de plus que `UserPromptSubmit`.

Le client est **copié** plutôt qu'exécuté depuis l'app pour deux raisons : dans
un build packagé les sources vivent dans `app.asar`, que seul Electron sait
lire ; et le chemin de l'app change dès qu'on la déplace dans `/Applications`.

### Réglages → Statut des agents

Une ligne d'état, deux boutons :

- **Tester** exécute le hook staged comme Claude Code le ferait. Le code de
  sortie prouve toute la chaîne : shim → runtime → socket → serveur → ack. Il ne
  touche à aucun statut réel.
- **Rafraîchir** re-copie les fichiers et relance la réconciliation.

## Réconciliation, pas installation

À chaque lancement, Switchboard **vérifie** que chaque événement géré porte
exactement une entrée à jour, et la **répare** si elle a dérivé. C'est ce qui
survit à un déplacement de l'app, à une mise à jour ou à une édition manuelle.

Trois règles :

- **Les hooks étrangers ne sont jamais touchés.** Si tu as déjà un hook à toi
  sur `Stop` (ou celui d'un autre outil), il reste, et le nôtre s'ajoute à côté.
- **Une entrée périmée est remplacée.** Elle pointe vers un binaire
  `switchboard-hook` qui n'existe plus : c'est un reste, on le remet à jour.
- **Une entrée d'une autre installation vivante est signalée, pas écrasée.**
  Un build de dev et `/Applications/Switchboard.app` se réécriraient mutuellement
  à chaque lancement, indéfiniment. Le second à parler déclare un `conflit` et
  laisse le fichier tranquille.

Rien n'est réécrit quand rien n'a bougé.

## Le contrat du client

Le hook s'exécute **à l'intérieur du tour de l'agent**. Les règles sont strictes :

- **Jamais rien sur stdout.** `UserPromptSubmit` réinjecte la sortie standard du
  hook dans le contexte du modèle : une ligne parasite finirait dans ta
  conversation.
- **Toujours un code de sortie 0.** Le code 2 fait bloquer le CLI sur le hook.
- **400 ms de budget, total**, monotone, réparti sur la lecture de stdin, la
  connexion, l'écriture et l'attente de l'ack. Mesuré en pratique : ~30 ms quand
  Switchboard écoute, ~28 ms quand il est fermé. Un badge de statut ne vaut
  jamais la peine de faire attendre un agent.
- **1 Mio maximum sur stdin.** Atteindre le plafond renvoie ce qu'on a au lieu de
  vider le reste.

## Le protocole

Un objet JSON par ligne sur un socket Unix, acquitté par le serveur :

```json
{"v":1,"kind":"agent_event","id":"…","provider":"claude_hook","paneId":"…",
 "sessionId":"…","phase":"finished","title":"Claude Code","body":"Done",
 "pids":[],"ts":1721234567,"test":false}
```

**Deux identifiants**, parce qu'ils divergent. `paneId` est l'identifiant sous
lequel Switchboard a lancé la session (exporté en `SWITCHBOARD_SESSION_ID`),
stable pour toute la vie du panneau. `sessionId` est celui que le CLI rapporte
pour sa session *courante*, qui change à chaque fork ou compactage.

**Déduplication.** Le client réessaie quand l'ack n'arrive pas dans son budget,
donc un ack perdu livre deux fois le même événement. Le serveur mémorise les
256 derniers `id` (éviction FIFO) et, sur un doublon, **acquitte quand même**
— sinon le client boucle — puis jette l'événement. Sans ça, un tour terminé
produirait deux notifications.

**Longueur du chemin de socket.** `sun_path` est limité à 104 octets sur macOS.
Au-delà, `bind()` échoue avec `EINVAL` sans que rien dans le chemin n'ait l'air
anormal — c'est arrivé pendant le développement avec un `SWITCHBOARD_DATA_DIR`
long. Passé la limite, le socket bascule sur un nom court dans le répertoire
temporaire, dérivé du répertoire de données pour que le serveur et le client
tombent d'accord sans se parler.

## Architecture

| Fichier | Rôle |
|---|---|
| `agent-hooks/protocol.js` | Format de fil, construction et validation |
| `agent-hooks/dedup.js` | Fenêtre FIFO de 256 identifiants |
| `agent-hooks/status.js` | Machine à états : deux sources, fenêtres de grâce |
| `agent-hooks/config.js` | Réconciliation de `settings.json` (pur) |
| `agent-hooks/install.js` | Copie des fichiers, génération du shim, écriture |
| `agent-hooks/server.js` | Socket Unix, validation, ack, déduplication |
| `agent-hooks/socket-path.js` | Résolution du chemin sous la limite système |
| `agent-hooks/runtime.js` | Assemblage et publication vers le renderer |
| `bin/switchboard-hook.js` | Le client, exécuté par Claude Code |

Le renderer n'a pas changé : la machine à états publie sur les deux canaux qu'il
écoutait déjà (`cli-busy-state` et `terminal-notification`). Les hooks sont
simplement devenus une meilleure source pour un signal qu'il traitait déjà.

## Ce qui n'est pas fait

- **Pas de surveillance du fichier de configuration.** La réconciliation tourne
  au lancement et sur le bouton Rafraîchir. Muxy surveille `~/.claude` avec
  FSEvents pour re-vérifier après une édition externe ; c'est faisable, mais
  `fs.watch` sur un fichier unique est peu fiable sur macOS avec les écritures
  atomiques des éditeurs, et ça demande la garde par hash pour ne pas boucler
  sur ses propres écritures.
- **Pas de résolution par chaîne de processus.** Le champ `pids` existe dans le
  protocole mais n'est pas exploité : un `claude` lancé à la main hors de
  Switchboard n'a pas de `SWITCHBOARD_SESSION_ID`, donc son événement est reçu,
  journalisé, et ignoré.
- **Sessions distantes (SSH).** Le socket est local ; une session distante ne
  peut pas l'atteindre. Elles restent sur la détection OSC.

## Diagnostic

```bash
# Le socket existe-t-il ?
ls -l ~/.switchboard/agent-hooks.sock

# Le chemin de livraison fonctionne-t-il ?
~/.switchboard/hooks/switchboard-hook --event test --test   # 0 = livré

# Échecs de livraison
cat ~/.switchboard/hooks.log

# Ce que voit l'application
grep '\[hooks\]' ~/Library/Logs/Switchboard/main.log
```

Les lignes `recv <phase>` sont journalisées **à la réception**, pas au
changement d'état : un événement qui confirme le statut déjà en place est
justement celui qu'il faut voir quand un hook a l'air mort.
