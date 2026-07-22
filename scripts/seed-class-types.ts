/**
 * Seed script for the `class_types` Firestore collection.
 *
 * Creates the two initial class type documents that correspond to the previously
 * hardcoded ClassType union values. The script is idempotent — it skips any
 * document that already exists.
 *
 * Usage:
 *   npx tsx scripts/seed-class-types.ts
 *
 * Requires:
 *   FIREBASE_ADMIN_SERVICE_ACCOUNT env var (full JSON service account as a single-line string)
 *   — typically loaded from .env.local
 */

import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local from project root (minimal dotenv-like parser, no extra dependency)
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // File not found — rely on environment variables already set
  }
}

loadEnvFile(resolve(__dirname, '..', '.env.local'));

// --- Firebase Admin SDK Initialization ---

const serviceAccountStr = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;

if (!serviceAccountStr) {
  console.error(
    '❌ FIREBASE_ADMIN_SERVICE_ACCOUNT is not set.\n' +
    '   Ensure .env.local contains the full service account JSON as a single-line string.'
  );
  process.exit(1);
}

let serviceAccount: admin.ServiceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountStr) as admin.ServiceAccount;
} catch {
  console.error(
    '❌ FIREBASE_ADMIN_SERVICE_ACCOUNT is not valid JSON.\n' +
    '   The value must be the raw JSON object on a single line.'
  );
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
const { FieldValue } = admin.firestore;

// --- Seed Data ---

interface ClassTypeSeed {
  slug: string;
  displayName: string;
  shortLabel: string;
  badgeColor: string;
  skipQuestionnaire: boolean;
  requireEmergencyContact: boolean;
  defaultAgeMin: number;
  defaultAgeMax: number;
  defaultMaxSize: number;
  defaultPrice: number;
  order: number;
}

const seedData: ClassTypeSeed[] = [
  {
    slug: 'kidsAfterSchool',
    displayName: 'Kids After School Club',
    shortLabel: 'Kids',
    badgeColor: 'amber',
    skipQuestionnaire: false,
    requireEmergencyContact: true,
    defaultAgeMin: 5,
    defaultAgeMax: 12,
    defaultMaxSize: 15,
    defaultPrice: 1500,
    order: 1,
  },
  {
    slug: 'youngAdultWeekend',
    displayName: 'Weekend Workshop',
    shortLabel: 'Young Adult',
    badgeColor: 'green',
    skipQuestionnaire: true,
    requireEmergencyContact: false,
    defaultAgeMin: 18,
    defaultAgeMax: 25,
    defaultMaxSize: 15,
    defaultPrice: 2500,
    order: 2,
  },
];

// --- Main ---

async function seed() {
  console.log('🌱 Seeding class_types collection...\n');

  let created = 0;
  let skipped = 0;

  for (const data of seedData) {
    const docRef = db.collection('class_types').doc(data.slug);
    const existing = await docRef.get();

    if (existing.exists) {
      console.log(`  ⏭️  Skipped "${data.slug}" — document already exists`);
      skipped++;
      continue;
    }

    await docRef.set({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(`  ✅ Created "${data.slug}" (${data.displayName})`);
    created++;
  }

  console.log(`\n🏁 Done. Created: ${created}, Skipped: ${skipped}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  });
