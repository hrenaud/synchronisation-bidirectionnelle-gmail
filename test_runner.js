#!/usr/bin/env node

/**
 * TEST RUNNER - Validation des algorithmes critiques
 * Compatible Node.js (sans dépendance Google Apps Script)
 * 
 * Exécution: node test_runner.js
 */

// ============================================
// FRAMEWORK DE TEST MINIMAL
// ============================================

class TestSuite {
  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.logs = [];
  }

  assertEqual(actual, expected, testName) {
    this.total++;
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    
    if (pass) {
      this.passed++;
      this.logs.push(`✅ ${testName}`);
    } else {
      this.failed++;
      this.logs.push(
        `❌ ${testName}\n` +
        `   Attendu: ${JSON.stringify(expected)}\n` +
        `   Obtenu:  ${JSON.stringify(actual)}`
      );
    }
  }

  assertTrue(condition, testName) {
    this.total++;
    
    if (condition) {
      this.passed++;
      this.logs.push(`✅ ${testName}`);
    } else {
      this.failed++;
      this.logs.push(`❌ ${testName} — condition false`);
    }
  }

  assertNull(actual, testName) {
    this.total++;
    
    if (actual === null) {
      this.passed++;
      this.logs.push(`✅ ${testName}`);
    } else {
      this.failed++;
      this.logs.push(`❌ ${testName} — attendu null, obtenu ${JSON.stringify(actual)}`);
    }
  }

  printResults() {
    console.log(`\n${'='.repeat(70)}`);
    console.log('RÉSULTATS DES TESTS');
    console.log('='.repeat(70) + '\n');
    
    this.logs.forEach(log => console.log(log));
    
    console.log(`\n${'-'.repeat(70)}`);
    console.log(`Total: ${this.total} | ✅ ${this.passed} | ❌ ${this.failed}`);
    console.log('-'.repeat(70));
    
    if (this.failed === 0) {
      console.log('\n🟢 TOUS LES TESTS RÉUSSIS !\n');
      return true;
    } else {
      console.log(`\n🔴 ${this.failed} ÉCHEC(S) DÉTECTÉ(S)\n`);
      return false;
    }
  }
}

// ============================================
// IMPLÉMENTATION DES FONCTIONS (depuis ContactSync_Advanced.gs)
// ============================================

/**
 * Normalise un numéro de téléphone pour comparaison
 */
function normaliserTelephone(telephone) {
  if (!telephone) return null;
  
  let normalise = telephone.replace(/[^\d+]/g, '');
  
  if (normalise.startsWith('00')) {
    normalise = '+' + normalise.substring(2);
  }
  
  if (normalise.startsWith('0') && normalise.length === 10) {
    normalise = '+33' + normalise.substring(1);
  }
  
  // Ajouter + si absent et numéro digits uniquement (cas US, etc.)
  const chiffresUniquement = normalise.replace(/\+/g, '');
  if (chiffresUniquement.length < 3) {
    return null;
  }
  
  if (!normalise.startsWith('+') && chiffresUniquement.length >= 10) {
    normalise = '+' + normalise;
  }
  
  return normalise;
}

/**
 * Normalise une adresse pour comparaison
 */
function normaliserAdresse(adresse) {
  if (!adresse) return '';

  return adresse
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;:'\-\/\\()]/g, ' ')
    .replace(/\b(rue|avenue|av|boulevard|bd|blvd|place|pl|chemin|ch|impasse|imp|allée|route|rte|de|et|la|le|des|du|d|et la|et le)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Génère une clé unique pour un contact
 */
function genererCleUnique(contact) {
  if (contact.email && contact.email.trim() !== '') {
    return 'email:' + contact.email.toLowerCase().trim();
  }

  if (contact.telephone && contact.telephone.trim() !== '') {
    const telNormalise = normaliserTelephone(contact.telephone);
    if (telNormalise) {
      return 'phone:' + telNormalise;
    }
  }

  if (contact.nom && contact.nom.trim() !== '') {
    return 'name:' + contact.nom.toLowerCase().trim();
  }

  if (contact.entreprise && contact.entreprise.trim() !== '') {
    return 'org:' + contact.entreprise.toLowerCase().trim();
  }

  return null;
}

/**
 * Fusionne les noms en gardant le plus complet
 */
function fusionnerNoms(contactDest, contactSource) {
  const prenomDest = contactDest.prenom || '';
  const nomFamilleDest = contactDest.nomFamille || '';
  const prenomSource = contactSource.prenom || '';
  const nomFamilleSource = contactSource.nomFamille || '';

  let modifie = false;
  let prenom = prenomDest;
  let nomFamille = nomFamilleDest;

  if (prenomSource.length > prenomDest.length) {
    prenom = prenomSource;
    modifie = true;
  }

  if (nomFamilleSource.length > nomFamilleDest.length) {
    nomFamille = nomFamilleSource;
    modifie = true;
  }

  if (!modifie) return null;

  return [{
    givenName: prenom,
    familyName: nomFamille
  }];
}

/**
 * Fusionne les téléphones sans créer de doublons
 */
function fusionnerTelephones(contactDest, contactSource) {
  if (!contactSource.tousLesTelephones || contactSource.tousLesTelephones.length === 0) {
    return null;
  }

  const telephonesExistants = (contactDest.tousLesTelephones || []).map(t => ({
    numero: t.numero,
    numeroNormalise: normaliserTelephone(t.numero),
    label: t.label
  }));

  let ajouts = 0;
  const nouveauxTelephones = [];

  contactSource.tousLesTelephones.forEach(telSource => {
    const telNormalise = normaliserTelephone(telSource.numero);
    if (telNormalise) {
      const dejaPresent = telephonesExistants.some(existant =>
        existant.numeroNormalise === telNormalise
      );
      if (!dejaPresent) {
        nouveauxTelephones.push(telSource);
        ajouts++;
      }
    }
  });

  if (ajouts === 0) {
    return null;
  }

  const tous = [
    ...telephonesExistants.map(t => ({ value: t.numero, type: 'mobile' })),
    ...nouveauxTelephones.map(t => ({ value: t.numero, type: 'mobile' }))
  ];
  return tous;
}

/**
 * Fusionne les emails sans créer de doublons
 */
function fusionnerEmails(contactDest, contactSource) {
  if (!contactSource.tousLesEmails || contactSource.tousLesEmails.length === 0) {
    return null;
  }

  const emailsExistants = (contactDest.tousLesEmails || []).map(e => ({
    adresse: e.adresse,
    adresseLower: e.adresse.toLowerCase(),
    label: e.label
  }));

  let ajouts = 0;
  const nouveauxEmails = [];

  contactSource.tousLesEmails.forEach(emailSource => {
    const emailLower = emailSource.adresse.toLowerCase();
    const dejaPresent = emailsExistants.some(existant =>
      existant.adresseLower === emailLower
    );
    if (!dejaPresent && emailSource.adresse.trim() !== '') {
      nouveauxEmails.push(emailSource);
      ajouts++;
    }
  });

  if (ajouts === 0) {
    return null;
  }

  const tous = [
    ...emailsExistants.map(e => ({ value: e.adresse, type: 'home' })),
    ...nouveauxEmails.map(e => ({ value: e.adresse, type: 'home' }))
  ];
  return tous;
}

/**
 * Déduplique un tableau de champs
 */
function cleSemantiqueChamp(entree) {
  const CHAMPS_IGNORES = new Set([
    'metadata', 'formattedType', 'formattedValue', 'formattedProtocol',
    'sourcePrimary', 'primary'
  ]);
  const nettoye = {};
  Object.keys(entree).sort().forEach(k => {
    if (!CHAMPS_IGNORES.has(k)) {
      const val = entree[k];
      if (typeof val === 'string') {
        nettoye[k] = val.trim();
      } else {
        nettoye[k] = val;
      }
    }
  });
  return JSON.stringify(nettoye);
}

function dedupliquerChamps(champs) {
  if (!champs || champs.length === 0) return null;
  const vus = new Set();
  const dedup = [];
  champs.forEach(entree => {
    const cle = cleSemantiqueChamp(entree);
    if (!vus.has(cle)) {
      vus.add(cle);
      const { metadata, ...reste } = entree;
      dedup.push(reste);
    }
  });
  return dedup.length < champs.length ? dedup : null;
}

/**
 * Fusionne les adresses sans créer de doublons
 */
function fusionnerAdresses(contactDest, contactSource) {
  if (!contactSource.toutesLesAdresses || contactSource.toutesLesAdresses.length === 0) {
    return null;
  }

  const adressesExistantes = (contactDest.toutesLesAdresses || []).map(a => ({
    adresse: a.adresse,
    adresseNormalisee: normaliserAdresse(a.adresse),
    postalCode: (a.postalCode || '').trim()
  }));

  let ajouts = 0;
  const nouvellesAdresses = [];

  contactSource.toutesLesAdresses.forEach(adresseSource => {
    const adresseNormalisee = normaliserAdresse(adresseSource.adresse);
    const postalCodeSrc = (adresseSource.postalCode || '').trim();

    const dejaPresente = adressesExistantes.some(existante => {
      if (existante.adresseNormalisee && adresseNormalisee &&
          existante.adresseNormalisee === adresseNormalisee) return true;
      if (postalCodeSrc && existante.postalCode &&
          postalCodeSrc === existante.postalCode &&
          adresseNormalisee && existante.adresseNormalisee &&
          adresseNormalisee.includes(existante.adresseNormalisee.split(' ')[0])) return true;
      return false;
    });
    
    if (!dejaPresente && adresseSource.adresse.trim() !== '') {
      nouvellesAdresses.push(adresseSource);
      ajouts++;
    }
  });

  if (ajouts === 0) {
    return null;
  }

  return [
    ...(contactDest.toutesLesAdresses || []),
    ...nouvellesAdresses
  ];
}

/**
 * Fusionne les notes en conservant les deux
 */
function fusionnerNotes(contactDest, contactSource) {
  const notesDest = contactDest.notes || '';
  const notesSource = contactSource.notes || '';

  // Nettoyer les marqueurs [SYNC] des deux côtés
  const notesDestClean = (notesDest || '')
    .replace(/\n?\[SYNC\] (?:Fusionné|Créé):.*$/gm, '')
    .trim();
  const notesSourceClean = (notesSource || '')
    .replace(/\n?\[SYNC\] (?:Fusionné|Créé):.*$/gm, '')
    .trim();

  const destANettoyage = notesDestClean !== (notesDest || '').trim();
  let sourceANouveau = notesSourceClean && notesSourceClean !== '' && 
                       !notesDestClean.includes(notesSourceClean);

  if (!destANettoyage && !sourceANouveau) return null;

  let notesFinales = notesDestClean;
  if (sourceANouveau) {
    if (notesFinales) {
      notesFinales += '\n---\n' + notesSourceClean;
    } else {
      notesFinales = notesSourceClean;
    }
  }

  return [{
    value: notesFinales || '',
    contentType: 'TEXT_PLAIN'
  }];
}

/**
 * Vérifie si un contact est complètement vide
 */
function estContactVide(contact) {
  if (contact.nom && contact.nom.trim() !== '') return false;
  if (contact.prenom && contact.prenom.trim() !== '') return false;
  if (contact.nomFamille && contact.nomFamille.trim() !== '') return false;
  if (contact.entreprise && contact.entreprise.trim() !== '') return false;
  if (contact.email && contact.email.trim() !== '') return false;
  if (contact.telephone && contact.telephone.trim() !== '') return false;
  if (contact.adresse && contact.adresse.trim() !== '') return false;
  if (contact.notes && contact.notes.trim() !== '') return false;
  if (contact.photoUrl) return false;
  if (contact.tousLesEmails && contact.tousLesEmails.length > 0) return false;
  if (contact.tousLesTelephones && contact.tousLesTelephones.length > 0) return false;
  if (contact.toutesLesAdresses && contact.toutesLesAdresses.length > 0) return false;
  return true;
}

/**
 * Fusionne les organisations sans créer de doublons
 */
function fusionnerOrganisations(contactDest, contactSource) {
  if (!contactSource.toutesLesOrganisations || contactSource.toutesLesOrganisations.length === 0) {
    return null;
  }

  const orgsExistantes = (contactDest.toutesLesOrganisations || []).map(o => ({
    nom: o.nom,
    nomLower: (o.nom || '').toLowerCase().trim()
  }));

  let ajouts = 0;
  const nouvellesOrgs = [];

  contactSource.toutesLesOrganisations.forEach(orgSource => {
    if (!orgSource.nom || orgSource.nom.trim() === '') return;
    const nomLower = orgSource.nom.toLowerCase().trim();
    const dejaPresente = orgsExistantes.some(existante =>
      existante.nomLower === nomLower
    );
    if (!dejaPresente) {
      nouvellesOrgs.push(orgSource);
      ajouts++;
    }
  });

  if (ajouts === 0) {
    return null;
  }

  return [
    ...(contactDest.toutesLesOrganisations || []),
    ...nouvellesOrgs
  ];
}

// ============================================
// SUITE DE TESTS
// ============================================

function runTests() {
  const suite = new TestSuite();

  console.log('\n🧪 DÉMARRAGE DES TESTS UNITAIRES\n');

  // ──────── TESTS: normaliserTelephone ────────
  console.log('📱 TESTS: normaliserTelephone()');
  suite.assertEqual(normaliserTelephone('06 12 34 56 78'), '+33612345678', 
    'FR: espaces');
  suite.assertEqual(normaliserTelephone('06-12-34-56-78'), '+33612345678',
    'FR: tirets');
  suite.assertEqual(normaliserTelephone('0033612345678'), '+33612345678',
    'Préfixe 00');
  suite.assertEqual(normaliserTelephone('+33 6 12 34 56 78'), '+33612345678',
    'Avec + déjà présent');
  suite.assertNull(normaliserTelephone('01'), 'Vraiment trop court');
  suite.assertNull(normaliserTelephone(''), 'Vide');
  suite.assertEqual(normaliserTelephone('(206) 555-0101'), '+2065550101',
    'US: parenthèses → +');
  suite.assertTrue(normaliserTelephone('06 12 34') !== null, '6 chiffres valide');

  // ──────── TESTS: normaliserAdresse ────────
  console.log('\n🏠 TESTS: normaliserAdresse()');
  suite.assertEqual(
    normaliserAdresse('10 Rue de la Paix, 75000 PARIS'),
    '10 paix 75000 paris',
    'Ponctuation + prépositions'
  );
  suite.assertEqual(normaliserAdresse('Médiéval'), 'medieval', 'Accents');
  suite.assertEqual(normaliserAdresse(''), '', 'Vide');
  suite.assertEqual(
    normaliserAdresse('5 Avenue des Champs-Élysées'),
    '5 champs elysees',
    'Abréviations + accents supprimés'
  );

  // ──────── TESTS: genererCleUnique ────────
  console.log('\n🔑 TESTS: genererCleUnique()');
  const contact1 = {
    email: 'john@example.com',
    telephone: '06 12 34 56 78',
    nom: 'John Doe',
    entreprise: 'Acme'
  };
  suite.assertEqual(genererCleUnique(contact1), 'email:john@example.com',
    'Priorité 1: email');

  const contact2 = {
    email: '',
    telephone: '06 12 34 56 78',
    nom: 'Jane Doe'
  };
  suite.assertTrue(genererCleUnique(contact2).startsWith('phone:'), 
    'Priorité 2: téléphone');

  const contact3 = {
    email: '',
    telephone: '',
    nom: 'Bob Smith'
  };
  suite.assertEqual(genererCleUnique(contact3), 'name:bob smith',
    'Priorité 3: nom');

  const contact5 = {
    email: '',
    telephone: '',
    nom: '',
    entreprise: ''
  };
  suite.assertNull(genererCleUnique(contact5), 'Contact vide');

  // ──────── TESTS: fusionnerNoms ────────
  console.log('\n📝 TESTS: fusionnerNoms()');
  const resNoms = fusionnerNoms(
    { prenom: 'Jean', nomFamille: 'Dupont' },
    { prenom: 'Jean-Pierre', nomFamille: 'Dupont' }
  );
  suite.assertTrue(resNoms && resNoms[0].givenName === 'Jean-Pierre',
    'Garde le plus complet');
  suite.assertNull(
    fusionnerNoms(
      { prenom: 'Pierre', nomFamille: 'Martin' },
      { prenom: 'Pierre', nomFamille: 'Martin' }
    ),
    'Identiques → null'
  );

  // ──────── TESTS: fusionnerTelephones ────────
  console.log('\n📱 TESTS: fusionnerTelephones()');
  const resTel = fusionnerTelephones(
    { tousLesTelephones: [{ numero: '06 12 34 56 78', label: 'mobile' }] },
    { tousLesTelephones: [{ numero: '07 98 76 54 32', label: 'mobile' }] }
  );
  suite.assertTrue(resTel && resTel.length === 2, 'Ajoute nouveau');
  
  suite.assertNull(
    fusionnerTelephones(
      { tousLesTelephones: [{ numero: '06 12 34 56 78', label: 'mobile' }] },
      { tousLesTelephones: [{ numero: '0612345678', label: 'autre' }] }
    ),
    'Détecte doublon (formats différents)'
  );

  // ──────── TESTS: fusionnerEmails ────────
  console.log('\n📧 TESTS: fusionnerEmails()');
  const resEm = fusionnerEmails(
    { tousLesEmails: [{ adresse: 'john@example.com', label: 'work' }] },
    { tousLesEmails: [{ adresse: 'john.doe@gmail.com', label: 'personal' }] }
  );
  suite.assertTrue(resEm && resEm.length === 2, 'Ajoute nouvel email');
  
  suite.assertNull(
    fusionnerEmails(
      { tousLesEmails: [{ adresse: 'John@Example.com', label: 'work' }] },
      { tousLesEmails: [{ adresse: 'john@example.com', label: 'other' }] }
    ),
    'Détecte doublon (case-insensitive)'
  );

  // ──────── TESTS: fusionnerAdresses ────────
  console.log('\n🏠 TESTS: fusionnerAdresses()');
  const resAdr = fusionnerAdresses(
    { toutesLesAdresses: [{ adresse: '10 Rue de la Paix, 75000 Paris', postalCode: '75000' }] },
    { toutesLesAdresses: [{ adresse: '5 Avenue des Champs, 75008 Paris', postalCode: '75008' }] }
  );
  suite.assertTrue(resAdr && resAdr.length === 2, 'Ajoute nouvelle adresse');
  
  suite.assertNull(
    fusionnerAdresses(
      { toutesLesAdresses: [{ adresse: '10 RUE DE LA PAIX, PARIS', postalCode: '75000' }] },
      { toutesLesAdresses: [{ adresse: '10 rue de la paix, paris', postalCode: '75000' }] }
    ),
    'Détecte doublon (normalisation)'
  );

  // ──────── TESTS: fusionnerNotes ────────
  console.log('\n📝 TESTS: fusionnerNotes()');
  const resNotes = fusionnerNotes(
    { notes: 'Note 1' },
    { notes: 'Note 2' }
  );
  suite.assertTrue(
    resNotes && resNotes[0].value.includes('Note 1') && 
    resNotes[0].value.includes('Note 2') && resNotes[0].value.includes('---'),
    'Fusionne avec séparateur'
  );
  
  const resNotesClean = fusionnerNotes(
    { notes: 'Valide\n[SYNC] Fusionné: obsolète' },
    { notes: '' }
  );
  suite.assertTrue(
    resNotesClean && !resNotesClean[0].value.includes('[SYNC]'),
    'Nettoie marqueurs [SYNC]'
  );
  
  suite.assertNull(
    fusionnerNotes({ notes: 'Même note' }, { notes: 'Même note' }),
    'Identiques → null'
  );

  // ──────── TESTS: estContactVide ────────
  console.log('\n👻 TESTS: estContactVide()');
  suite.assertTrue(
    estContactVide({
      nom: '', prenom: '', nomFamille: '', email: '', telephone: '',
      entreprise: '', notes: '', photoUrl: null,
      tousLesEmails: [], tousLesTelephones: [], toutesLesAdresses: []
    }),
    'Contact vide'
  );
  
  suite.assertTrue(
    !estContactVide({ email: 'test@example.com', nom: '' }),
    'Contact avec email'
  );

  // ──────── TESTS: fusionnerOrganisations ────────
  console.log('\n🏢 TESTS: fusionnerOrganisations()');
  const resOrgs = fusionnerOrganisations(
    { toutesLesOrganisations: [{ nom: 'Google', poste: 'Engineer' }] },
    { toutesLesOrganisations: [{ nom: 'Microsoft', poste: 'Manager' }] }
  );
  suite.assertTrue(resOrgs && resOrgs.length === 2, 'Ajoute nouvelle org');
  
  suite.assertNull(
    fusionnerOrganisations(
      { toutesLesOrganisations: [{ nom: 'Google', poste: 'Engineer' }] },
      { toutesLesOrganisations: [{ nom: 'GOOGLE', poste: 'Senior' }] }
    ),
    'Détecte doublon (case-insensitive)'
  );

  // ──────── TESTS: dedupliquerChamps ────────
  console.log('\n🔄 TESTS: dedupliquerChamps()');
  const resDedup = dedupliquerChamps([
    { url: 'https://example.com', type: 'home' },
    { url: 'https://example.com', type: 'home' },
    { url: 'https://example.com' }
  ]);
  suite.assertTrue(resDedup && resDedup.length < 3, 'Supprime doublons');
  
  suite.assertNull(
    dedupliquerChamps([
      { url: 'https://example1.com', type: 'home' },
      { url: 'https://example2.com', type: 'work' }
    ]),
    'Pas de duplicata → null'
  );

  // ──────── AFFICHAGE DES RÉSULTATS ────────
  return suite.printResults();
}

// ============================================
// EXÉCUTION
// ============================================

if (require.main === module) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runTests };
