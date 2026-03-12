import { readFileSync } from 'fs';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(readFileSync('./src/lib/firebase-admin-key.json', 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function listStudents() {
    try {
        const snapshot = await db.collection('students').get();
        if (snapshot.empty) {
            console.log('No matching documents in students collection.');
            return;
        }

        console.log(`Found ${snapshot.size} students:`);
        snapshot.forEach(doc => {
            console.log(doc.id, '=>', doc.data());
        });
    } catch (error) {
        console.error('Error getting documents', error);
    }
}

listStudents();
