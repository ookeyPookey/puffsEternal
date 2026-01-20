# Puffs Eternal

Lightweight static site for Puffs friends and castmates to share announcements,
messages, plays, auditions, and events.

## Run locally

Open `index.html` in a browser, or use a quick local server:

```bash
python3 -m http.server 5173
```

Then visit `http://localhost:5173`.

## Deploy

This is a plain static site. You can deploy by dragging the folder into:

- Netlify Drop
- Vercel (static)
- GitHub Pages

All files needed are in the root:
`index.html`, `styles.css`, `script.js`.

## Auth setup (Google or Facebook)

This site uses Firebase Auth via CDN. To enable it:

1. Create a Firebase project.
2. Enable Google and/or Facebook providers in Firebase Auth.
3. Add your app's domain to the authorized domains list.
4. Replace the placeholders in `script.js`:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `appId`

For Facebook auth, you will also need a Facebook app ID and secret configured
inside Firebase Auth.

## Firestore setup (multi-user)

This site uses Firestore for shared content across all users.

1. Enable Firestore in your Firebase project.
2. Deploy or paste the rules in `firestore.rules`.
3. Update the editor allowlist in `firestore.rules` (initial admins).

## Editor access controls

Editors can post and edit content through the admin bar once signed in.
Editors can invite more editors from the admin bar once you set the initial
allowlist in `firestore.rules`.

Invites are stored in Firestore under `editorInvites/{email}`. Signed-in users
check for their email doc on login to determine editor access.
