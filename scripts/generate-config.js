const fs = require("fs");
const path = require("path");

const required = {
  FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
  FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
  FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
  FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
  FIREBASE_MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID,
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length > 0) {
  console.error(
    `Missing Firebase environment variables: ${missing.join(", ")}`
  );
  process.exit(1);
}

const config = {
  apiKey: required.FIREBASE_API_KEY,
  authDomain: required.FIREBASE_AUTH_DOMAIN,
  projectId: required.FIREBASE_PROJECT_ID,
  storageBucket: required.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: required.FIREBASE_MESSAGING_SENDER_ID,
  appId: required.FIREBASE_APP_ID,
  measurementId: required.FIREBASE_MEASUREMENT_ID,
};

const output = `window.__FIREBASE_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;
const target = path.join(__dirname, "..", "config.js");
fs.writeFileSync(target, output, "utf8");

console.log("Generated config.js for deployment.");
