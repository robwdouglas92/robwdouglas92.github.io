# Rizzie

A Krillion-style family game: 7 prompts, 25 seconds each, and rarer answers
score more. Lives at `robwdouglas92.github.io/rizzie/`.

## One-time setup

Rizzie uses its own free Firebase project (Spark plan, no card needed),
separate from the one shared by the Lizzie games and Legends XI.

1. Create a Firebase project and add a **web app**. Paste its config into
   `js/firebase-config.js`.
2. **Authentication → Sign-in method →** enable **Email/Password**.
3. **Firestore Database →** create a database, then paste `firestore.rules`
   into the **Rules** tab and publish.
4. Sign up in the game as yourself. Then, in the Firebase console, open
   **Firestore → profiles → your profile** and set `isAdmin` and `isCreator`
   to `true`. That's the only time you need to make yourself admin by hand;
   the admin page will handle everyone else.

## How it fits together

- `js/match.js`: decides which listed answer a typed answer counts as. It
  handles typos, "Xmas", plurals, missing "the", and numbers (which must
  match exactly).
- `js/gameFormat.js`: the JSON format a game is written in, plus the check
  that runs on a pasted game.
- `js/descent.js`: the scene shown after each answer. Classic games get a
  six-step bar; themed games hand off to their theme.
- `js/themes/`: the themes a creator can pick (Classic, Christmas, Disco).
  Each one renames the six tiers, sets their colours, and draws its own scene,
  including what happens when an answer scores nothing. Points never change
  between themes. To add a theme, add an entry to `themes/index.js` and a
  scene file next to it.
- `sample-game.json`: "Christmas Classics", a ready-made game you can load
  from the Create screen.
