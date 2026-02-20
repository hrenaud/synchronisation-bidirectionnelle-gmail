/**
 * SUITE DE TESTS - SYNCHRONISATION BIDIRECTIONNELLE GMAIL
 * 
 * Framework de test minimal pour valider les algorithmes critiques.
 * Exécution: Ouvrir l'éditeur Apps Script → Run → lancerTousLesTests()
 * 
 * Les tests portent sur :
 * - Normalisation (phones, addresses)
 * - Génération de clés uniques
 * - Fusion intelligente (noms, emails, phones, addresses, etc.)
 * - Nettoyage des données
 * - Détection de doublons
 */

// ============================================
// FRAMEWORK DE TEST MINIMAL
// ============================================

let TestResults = {
  total: 0,
  passes: 0,
  failures: 0,
  logs: []
};

function assertEqual(actual, expected, testName) {
  TestResults.total++;
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  
  if (pass) {
    TestResults.passes++;
    TestResults.logs.push(`✅ ${testName}`);
  } else {
    TestResults.failures++;
    TestResults.logs.push(
      `❌ ${testName}\n` +
      `   Attendu: ${JSON.stringify(expected)}\n` +
      `   Obtenu:  ${JSON.stringify(actual)}`
    );
  }
}

function assertTrue(condition, testName) {
  TestResults.total++;
  
  if (condition) {
    TestResults.passes++;
    TestResults.logs.push(`✅ ${testName}`);
  } else {
    TestResults.failures++;
    TestResults.logs.push(`❌ ${testName} — condition false`);
  }
}

function assertNull(actual, testName) {
  TestResults.total++;
  
  if (actual === null) {
    TestResults.passes++;
    TestResults.logs.push(`✅ ${testName}`);
  } else {
    TestResults.failures++;
    TestResults.logs.push(`❌ ${testName} — attendu null, obtenu ${JSON.stringify(actual)}`);
  }
}

function resetTests() {
  TestResults = {
    total: 0,
    passes: 0,
    failures: 0,
    logs: []
  };
}

function afficherResultats() {
  const header = `\n${'='.repeat(60)}\nRÉSULTATS DES TESTS\n${'='.repeat(60)}\n`;
  const summary = `\nTotal: ${TestResults.total} | ✅ ${TestResults.passes} | ❌ ${TestResults.failures}\n`;
  const statusBadge = TestResults.failures === 0 ? '🟢 TOUS LES TESTS RÉUSSIS' : '🔴 ÉCHECS DÉTECTÉS';
  
  const output = header + TestResults.logs.join('\n') + summary + statusBadge + '\n';
  Logger.log(output);
  
  // Envoyer rapport par email
  envoyerRapport(
    `${statusBadge} [Tests]`,
    output
  );
  
  return TestResults.failures === 0;
}

// ============================================
// TESTS: NORMALISATION TÉLÉPHONE
// ============================================

function testNormaliserTelephone() {
  Logger.log('\n📱 TESTS: normaliserTelephone()');
  
  // Cas basique: numéro avec espaces
  assertEqual(normaliserTelephone('06 12 34 56 78'), '+33612345678', 
    'Téléphone FR avec espaces → converti en +33');
  
  // Numéro avec tirets
  assertEqual(normaliserTelephone('06-12-34-56-78'), '+33612345678',
    'Téléphone FR avec tirets → converti en +33');
  
  // Numéro avec 00 (préfixe international)
  assertEqual(normaliserTelephone('0033612345678'), '+33612345678',
    'Téléphone avec 00 → converti en +');
  
  // Numéro déjà avec +
  assertEqual(normaliserTelephone('+33 6 12 34 56 78'), '+33612345678',
    'Téléphone avec + → nettoyé');
  
  // Numéro très court (rejeté)
  assertNull(normaliserTelephone('06 12'), null,
    'Téléphone trop court → null');
  
  // Numéro vide
  assertNull(normaliserTelephone(''), null,
    'Numéro vide → null');
  
  // Numéro avec parenthèses (standard US)
  assertEqual(normaliserTelephone('(206) 555-0101'), '+2065550101',
    'Téléphone US avec parenthèses → nettoyé');
}

// ============================================
// TESTS: NORMALISATION ADRESSE
// ============================================

function testNormaliserAdresse() {
  Logger.log('\n🏠 TESTS: normaliserAdresse()');
  
  // Cas basique
  assertEqual(
    normaliserAdresse('10 Rue de la Paix, 75000 PARIS'),
    '10 paix 75000 paris',
    'Adresse avec ponctuation → normalisée'
  );
  
  // Suppression des accents
  assertEqual(
    normaliserAdresse('Médiéval'),
    'medieval',
    'Accents supprimés'
  );
  
  // Suppression des abréviations courantes
  const result = normaliserAdresse('123 Avenue des Champs-Élysées, 75008 Paris');
  assertTrue(result.includes('champs') && !result.includes('avenue'), 
    'Abbreviation "Avenue" supprimée');
  
  // Espaces multiples réduits
  assertEqual(
    normaliserAdresse('10    rue    de la    paix'),
    '10 rue paix',
    'Espaces multiples réduits'
  );
  
  // Adresse vide
  assertEqual(normaliserAdresse(''), '', 'Adresse vide → chaîne vide');
}

// ============================================
// TESTS: GÉNÉRATION DE CLÉ UNIQUE
// ============================================

function testGenererCleUnique() {
  Logger.log('\n🔑 TESTS: genererCleUnique()');
  
  // Contact avec email
  const contact1 = {
    email: 'john@example.com',
    telephone: '06 12 34 56 78',
    nom: 'John Doe',
    entreprise: 'Acme'
  };
  assertEqual(genererCleUnique(contact1), 'email:john@example.com',
    'Priorité: email');
  
  // Contact sans email, avec téléphone
  const contact2 = {
    email: '',
    telephone: '06 12 34 56 78',
    nom: 'Jane Doe',
    entreprise: ''
  };
  const cle2 = genererCleUnique(contact2);
  assertTrue(cle2.startsWith('phone:'), 
    'Sans email: téléphone utilisé');
  
  // Contact sans email/téléphone, avec nom
  const contact3 = {
    email: '',
    telephone: '',
    nom: 'Bob Smith',
    entreprise: ''
  };
  assertEqual(genererCleUnique(contact3), 'name:bob smith',
    'Sans email/tél: nom utilisé (lowercase)');
  
  // Contact avec uniquement entreprise
  const contact4 = {
    email: '',
    telephone: '',
    nom: '',
    entreprise: 'Google'
  };
  assertEqual(genererCleUnique(contact4), 'org:google',
    'Uniquement entreprise: utilisée');
  
  // Contact complètement vide
  const contact5 = {
    email: '',
    telephone: '',
    nom: '',
    entreprise: ''
  };
  assertNull(genererCleUnique(contact5),
    'Contact vide → null');
}

// ============================================
// TESTS: FUSION DE NOMS
// ============================================

function testFusionnerNoms() {
  Logger.log('\n📝 TESTS: fusionnerNoms()');
  
  // Les deux ont des noms différents → garder le plus complet
  const contact1 = {
    prenom: 'Jean',
    nomFamille: 'Dupont'
  };
  const contact2 = {
    prenom: 'Jean-Pierre',
    nomFamille: 'Dupon'
  };
  const resultat = fusionnerNoms(contact1, contact2);
  assertTrue(resultat && resultat[0].givenName === 'Jean-Pierre',
    'Prénom plus complet: fusionné');
  
  // Aucun changement
  const contact3 = {
    prenom: 'Pierre',
    nomFamille: 'Martin'
  };
  const contact4 = {
    prenom: 'Pierre',
    nomFamille: 'Martin'
  };
  assertNull(fusionnerNoms(contact3, contact4),
    'Noms identiques → null (pas de changement)');
}

// ============================================
// TESTS: FUSION DE TÉLÉPHONES
// ============================================

function testFusionnerTelephones() {
  Logger.log('\n📱 TESTS: fusionnerTelephones()');
  
  // Ajouter un phone nouveau
  const contact1 = {
    tousLesTelephones: [
      { numero: '06 12 34 56 78', label: 'mobile' }
    ]
  };
  const contact2 = {
    tousLesTelephones: [
      { numero: '07 98 76 54 32', label: 'mobile' }
    ]
  };
  const resultat = fusionnerTelephones(contact1, contact2);
  assertTrue(resultat && resultat.length === 2,
    '2 phones différents → 2 garder');
  
  // Empêcher les doublons (même numéro, formats différents)
  const contact3 = {
    tousLesTelephones: [
      { numero: '06 12 34 56 78', label: 'mobile' }
    ]
  };
  const contact4 = {
    tousLesTelephones: [
      { numero: '0612345678', label: 'autre' }
    ]
  };
  const resultat2 = fusionnerTelephones(contact3, contact4);
  assertNull(resultat2,
    'Doublon (formats différents) → null (pas de changement)');
  
  // Aucun téléphone dans source
  const contact5 = { tousLesTelephones: [] };
  const contact6 = { tousLesTelephones: [{ numero: '06 12 34 56 78', label: 'mobile' }] };
  assertNull(fusionnerTelephones(contact5, contact6),
    'Source vide → null');
}

// ============================================
// TESTS: FUSION D'EMAILS
// ============================================

function testFusionnerEmails() {
  Logger.log('\n📧 TESTS: fusionnerEmails()');
  
  // Ajouter un email nouveau
  const contact1 = {
    tousLesEmails: [
      { adresse: 'john@example.com', label: 'work' }
    ]
  };
  const contact2 = {
    tousLesEmails: [
      { adresse: 'john.doe@gmail.com', label: 'personal' }
    ]
  };
  const resultat = fusionnerEmails(contact1, contact2);
  assertTrue(resultat && resultat.length === 2,
    '2 emails différents → fusion');
  
  // Doublon (case-insensitive)
  const contact3 = {
    tousLesEmails: [
      { adresse: 'John@Example.com', label: 'work' }
    ]
  };
  const contact4 = {
    tousLesEmails: [
      { adresse: 'john@example.com', label: 'other' }
    ]
  };
  const resultat2 = fusionnerEmails(contact3, contact4);
  assertNull(resultat2,
    'Doublon (case-insensitive) → null');
}

// ============================================
// TESTS: FUSION D'ADRESSES
// ============================================

function testFusionnerAdresses() {
  Logger.log('\n🏠 TESTS: fusionnerAdresses()');
  
  // Deux adresses différentes
  const contact1 = {
    toutesLesAdresses: [
      { adresse: '10 Rue de la Paix, 75000 Paris', postalCode: '75000', label: 'home' }
    ]
  };
  const contact2 = {
    toutesLesAdresses: [
      { adresse: '5 Avenue des Champs, 75008 Paris', postalCode: '75008', label: 'work' }
    ]
  };
  const resultat = fusionnerAdresses(contact1, contact2);
  assertTrue(resultat && resultat.length === 2,
    '2 adresses différentes → fusion');
  
  // Adresse dupliquée (formattedValue identique)
  const contact3 = {
    toutesLesAdresses: [
      { adresse: '10 RUE DE LA PAIX, PARIS', label: 'home' }
    ]
  };
  const contact4 = {
    toutesLesAdresses: [
      { adresse: '10 rue de la paix, paris', label: 'other' }
    ]
  };
  const resultat2 = fusionnerAdresses(contact3, contact4);
  assertNull(resultat2,
    'Adresse dupliquée (normalisation) → null');
}

// ============================================
// TESTS: FUSION DE NOTES
// ============================================

function testFusionnerNotes() {
  Logger.log('\n📝 TESTS: fusionnerNotes()');
  
  // Deux notes différentes
  const contact1 = {
    notes: 'Note 1'
  };
  const contact2 = {
    notes: 'Note 2'
  };
  const resultat = fusionnerNotes(contact1, contact2);
  assertTrue(resultat && resultat[0].value.includes('Note 1') && resultat[0].value.includes('Note 2'),
    'Deux notes → fusion avec séparateur');
  
  // Nettoyage des marqueurs [SYNC] anciens
  const contact3 = {
    notes: 'Note valide\n[SYNC] Fusionné: info obsolète'
  };
  const contact4 = {
    notes: ''
  };
  const resultat2 = fusionnerNotes(contact3, contact4);
  assertTrue(resultat2 && !resultat2[0].value.includes('[SYNC]'),
    'Marqueurs [SYNC] supprimés');
}

// ============================================
// TESTS: DÉTECTION CONTACT VIDE
// ============================================

function testEstContactVide() {
  Logger.log('\n👻 TESTS: estContactVide()');
  
  // Contact complètement vide
  const contact1 = {
    nom: '',
    prenom: '',
    nomFamille: '',
    email: '',
    telephone: '',
    entreprise: '',
    notes: '',
    photoUrl: null,
    tousLesEmails: [],
    tousLesTelephones: []
  };
  assertTrue(estContactVide(contact1),
    'Contact vide → true');
  
  // Contact avec au moins un champ
  const contact2 = {
    nom: '',
    email: 'test@example.com',
    telephone: '',
    entreprise: ''
  };
  assertTrue(!estContactVide(contact2),
    'Contact avec email → false');
}

// ============================================
// TESTS: DÉDUPLICATION DE CHAMPS
// ============================================

function testDedupliquerChamps() {
  Logger.log('\n🔄 TESTS: dedupliquerChamps()');
  
  // Champs avec doublons
  const champs = [
    { url: 'https://example.com', type: 'home' },
    { url: 'https://example.com', type: 'home' },  // exact duplicate
    { url: 'https://example.com' }  // même URL, pas de type
  ];
  const resultat = dedupliquerChamps(champs);
  assertTrue(resultat && resultat.length < champs.length,
    'Doublons supprimés');
  
  // Pas de doublons
  const champs2 = [
    { url: 'https://example1.com', type: 'home' },
    { url: 'https://example2.com', type: 'work' }
  ];
  assertNull(dedupliquerChamps(champs2),
    'Pas de duplicata → null');
}

// ============================================
// TESTS: FUSION GÉNÉRIQUE DE CHAMPS
// ============================================

function testFusionnerChampsGenerique() {
  Logger.log('\n📋 TESTS: fusionnerChampsGenerique()');
  
  // Fusion: destination a 1, source a 1 nouveau
  const dest = [
    { url: 'https://site1.com', type: 'PROFILE' }
  ];
  const source = [
    { url: 'https://site2.com', type: 'PROFILE' }
  ];
  const resultat = fusionnerChampsGenerique(dest, source);
  assertTrue(resultat && resultat.length === 2,
    'Fusion: 2 URLs conservées');
  
  // Empêcher les doublons
  const dest2 = [
    { url: 'https://site1.com' }
  ];
  const source2 = [
    { url: 'https://site1.com' }
  ];
  const resultat2 = fusionnerChampsGenerique(dest2, source2);
  assertNull(resultat2,
    'Doublon détecté → null');
}

// ============================================
// LANCEMENT DE TOUS LES TESTS
// ============================================

function lancerTousLesTests() {
  Logger.log('🧪 DÉMARRAGE DES TESTS UNITAIRES\n');
  
  resetTests();
  
  // Exécuter tous les tests
  testNormaliserTelephone();
  testNormaliserAdresse();
  testGenererCleUnique();
  testFusionnerNoms();
  testFusionnerTelephones();
  testFusionnerEmails();
  testFusionnerAdresses();
  testFusionnerNotes();
  testEstContactVide();
  testDedupliquerChamps();
  testFusionnerChampsGenerique();
  
  // Afficher les résultats
  const allTestsPassed = afficherResultats();
  
  return allTestsPassed;
}

/**
 * Test une fusion complète "bout-en-bout"
 * Simule la fusion de deux contacts réalistes
 */
function testFusionCompleteBoutEnBout() {
  Logger.log('\n🔄 TEST: Fusion complète bout-en-bout\n');
  
  resetTests();
  
  // Contact destination (existant)
  const contactDest = {
    resourceName: 'people/c123abc',
    nom: 'John Doe',
    prenom: 'John',
    nomFamille: 'Doe',
    email: 'john@example.com',
    telephone: '06 12 34 56 78',
    entreprise: 'Google',
    poste: 'Engineer',
    notes: 'Note 1',
    tousLesEmails: [
      { adresse: 'john@example.com', label: 'work' },
      { adresse: 'john.doe@gmail.com', label: 'personal' }
    ],
    tousLesTelephones: [
      { numero: '06 12 34 56 78', label: 'mobile' }
    ],
    toutesLesAdresses: [
      { adresse: '10 Rue de la Paix, 75000 Paris', postalCode: '75000', label: 'home' }
    ],
    toutesLesOrganisations: [
      { nom: 'Google', poste: 'Engineer', type: 'work' }
    ],
    champsSupplementaires: {
      urls: [{ url: 'https://johndoe.com', type: 'PROFILE' }]
    }
  };
  
  // Contact source (à fusionner)
  const contactSource = {
    nom: 'John D.',
    prenom: 'Jean',  // Plus complet
    nomFamille: 'Doe',
    email: 'john@example.com',
    telephone: '07 98 76 54 32',  // Nouveau
    entreprise: 'Google',
    poste: 'Senior Engineer',  // Mis à jour
    notes: 'Note 2',  // À fusionner
    tousLesEmails: [
      { adresse: 'john@google.com', label: 'work' }  // Nouveau email
    ],
    tousLesTelephones: [
      { numero: '07 98 76 54 32', label: 'mobile' }  // Nouveau
    ],
    toutesLesAdresses: [
      { adresse: '5 Avenue des Champs, 75008 Paris', label: 'work' }  // Nouvelle adresse
    ],
    toutesLesOrganisations: [
      { nom: 'Google', poste: 'Senior Engineer', type: 'work' }
    ],
    champsSupplementaires: {
      urls: [
        { url: 'https://johndoe.com', type: 'PROFILE' }  // Doublon
      ]
    }
  };
  
  // Tester chaque fusion
  const noms = fusionnerNoms(contactDest, contactSource);
  assertTrue(noms && noms[0].givenName === 'Jean', 'Nom: fusionné correctement');
  
  const tels = fusionnerTelephones(contactDest, contactSource);
  assertTrue(tels && tels.length === 2, 'Téléphones: 2 conservés (nettoyé, pas doublon)');
  
  const emails = fusionnerEmails(contactDest, contactSource);
  assertTrue(emails && emails.length === 3, 'Emails: 3 conservés');
  
  const adresses = fusionnerAdresses(contactDest, contactSource);
  assertTrue(adresses && adresses.length === 2, 'Adresses: 2 conservées');
  
  const notes = fusionnerNotes(contactDest, contactSource);
  assertTrue(notes && notes[0].value.includes('Note 1') && notes[0].value.includes('Note 2'),
    'Notes: fusionnées avec séparateur');
  
  const urls = fusionnerChampsGenerique(
    contactDest.champsSupplementaires.urls,
    contactSource.champsSupplementaires.urls
  );
  assertNull(urls, 'URLs: doublon détecté');
  
  // Résultats
  afficherResultats();
}
