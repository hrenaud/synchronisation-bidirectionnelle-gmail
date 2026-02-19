/**
 * VERSION AVANCÉE - SYNCHRONISATION BIDIRECTIONNELLE COMPLÈTE
 * Utilise le service avancé People API (v1)
 *
 * PRÉREQUIS:
 * 1. Dans l'éditeur Apps Script : Services (+) → People API → Ajouter
 * 2. Configurer COMPTE_SECONDAIRE dans CONFIG
 */

// ============================================
// CONFIGURATION
// ============================================

// Propriétés du script (Paramètres du projet → Propriétés du script)
// COMPTE_SECONDAIRE : email de l'autre compte (OBLIGATOIRE)
// EMAIL_RAPPORT     : email pour les rapports (recommandé : adresse @gmail.com)
// COMPTE_PRO        : 'true' si compte Workspace/payant (limite 30 min au lieu de 6 min)
const PROPS = PropertiesService.getScriptProperties();

const CONFIG = {
  // Lus depuis les Propriétés du script (ne pas modifier ici)
  COMPTE_SECONDAIRE: PROPS.getProperty('COMPTE_SECONDAIRE') || 'votre-email-secondaire@gmail.com',
  EMAIL_RAPPORT: PROPS.getProperty('EMAIL_RAPPORT') || null,
  COMPTE_PRO: PROPS.getProperty('COMPTE_PRO') === 'true',

  // Paramètres modifiables dans le code
  DEBUG_MODE: true,
  LABEL_SYNC: 'Synchronisés',

  // 'merge' = Fusion intelligente (RECOMMANDÉ) - combine les infos sans rien perdre
  // 'recent' = Le plus récent écrase l'ancien - RISQUE DE PERTE DE DONNÉES
  STRATEGIE_CONFLIT: 'merge',

  // true = synchroniser aussi les contacts avec seulement un téléphone
  INCLURE_CONTACTS_SANS_EMAIL: true,

  // true = supprimer les contacts complètement vides (aucun champ rempli)
  SUPPRIMER_CONTACTS_VIDES: false
};

/**
 * Configure les propriétés du script (à exécuter UNE FOIS par compte).
 * Après exécution, les valeurs sont visibles dans :
 * Paramètres du projet (roue dentée) → Propriétés du script
 */
function configurerCompte() {
  // ⚠️ MODIFIER CES VALEURS AVANT D'EXÉCUTER
  PROPS.setProperties({
    'COMPTE_SECONDAIRE': 'votre-email-secondaire@gmail.com',
    'EMAIL_RAPPORT': 'votre-email-rapport@gmail.com',
    'COMPTE_PRO': 'false'  // 'true' pour Workspace/payant (limite 30 min), 'false' pour gratuit (limite 6 min)
  });

  Logger.log('✅ Propriétés configurées :');
  Logger.log(`  COMPTE_SECONDAIRE = ${PROPS.getProperty('COMPTE_SECONDAIRE')}`);
  Logger.log(`  EMAIL_RAPPORT = ${PROPS.getProperty('EMAIL_RAPPORT')}`);
  Logger.log(`  COMPTE_PRO = ${PROPS.getProperty('COMPTE_PRO')}`);
  Logger.log('');
  Logger.log('Vous pouvez aussi les modifier dans : Paramètres du projet → Propriétés du script');
}

// ============================================
// UTILITAIRE EMAIL
// ============================================

/**
 * Envoie un email de rapport de manière sécurisée.
 * Utilise EMAIL_RAPPORT si configuré, sinon l'email du compte actif.
 * Ne bloque jamais la synchronisation en cas d'échec d'envoi.
 */
function envoyerRapport(sujet, corps) {
  try {
    const destinataire = CONFIG.EMAIL_RAPPORT || Session.getActiveUser().getEmail();
    MailApp.sendEmail(destinataire, sujet, corps);
  } catch (e) {
    Logger.log(`⚠️ Impossible d'envoyer l'email de rapport: ${e.message}`);
    Logger.log(`   Sujet: ${sujet}`);
    Logger.log(`   Consultez les logs pour voir le contenu du rapport.`);
  }
}

// ============================================
// UTILITAIRE THROTTLE API
// ============================================

/**
 * Exécute une fonction avec retry automatique en cas de dépassement de quota.
 * Attend entre chaque appel pour respecter les limites People API.
 */
// Heure de début pour le garde-fou temporel
const DEBUT_EXECUTION = new Date();
// Compte gratuit : limite 6 min → garde-fou à 5 min
// Compte Workspace/pro : limite 30 min → garde-fou à 28 min
const LIMITE_EXECUTION_MS = CONFIG.COMPTE_PRO
  ? 28 * 60 * 1000   // 28 minutes (marge de 2 min avant les 30 min)
  : 5 * 60 * 1000;   // 5 minutes (marge de 1 min avant les 6 min)

/**
 * Vérifie si on approche de la limite de temps d'exécution
 */
function tempsDepasse() {
  return (new Date() - DEBUT_EXECUTION) > LIMITE_EXECUTION_MS;
}

function appelAvecRetry(fn, description) {
  const MAX_RETRIES = 3;
  const DELAI_ENTRE_APPELS_MS = 100; // 100ms entre chaque appel API (retry gère les quotas)

  for (let tentative = 1; tentative <= MAX_RETRIES; tentative++) {
    try {
      Utilities.sleep(DELAI_ENTRE_APPELS_MS);
      return fn();
    } catch (e) {
      if (e.message && e.message.includes('Quota exceeded') && tentative < MAX_RETRIES) {
        const attente = tentative * 30; // 30s, 60s
        Logger.log(`⏳ Quota dépassé pour ${description}, attente ${attente}s (tentative ${tentative}/${MAX_RETRIES})`);
        Utilities.sleep(attente * 1000);
      } else {
        throw e;
      }
    }
  }
}

// ============================================
// SYNCHRONISATION BIDIRECTIONNELLE COMPLÈTE
// ============================================

function synchroniserContactsBidirectionnel() {
  try {
    Logger.log('=== DÉBUT SYNCHRONISATION BIDIRECTIONNELLE ===');
    
    // 1. Récupérer les contacts du compte principal
    const contactsPrincipaux = getContactsFromPrimary();
    Logger.log(`Compte principal: ${contactsPrincipaux.length} contacts`);
    
    // 2. Récupérer les contacts du compte secondaire via People API
    const contactsSecondaires = getContactsFromSecondary();
    Logger.log(`Compte secondaire: ${contactsSecondaires.length} contacts`);
    
    // 3. Créer des maps pour comparaison
    const mapPrincipal = creerMapParEmail(contactsPrincipaux, false, true);
    const mapSecondaire = creerMapParEmail(contactsSecondaires, false, false);
    
    // 4. Synchroniser : Principal → Secondaire
    const stats1 = syncDirection(mapPrincipal, mapSecondaire, 'principal->secondaire');
    
    // 5. Synchroniser : Secondaire → Principal
    const stats2 = syncDirection(mapSecondaire, mapPrincipal, 'secondaire->principal');
    
    // 6. Rapport final
    const statsTotal = {
      ajoutes: stats1.ajoutes + stats2.ajoutes,
      modifies: stats1.modifies + stats2.modifies,
      total: contactsPrincipaux.length + contactsSecondaires.length
    };
    
    Logger.log('=== SYNCHRONISATION TERMINÉE ===');
    Logger.log(`Total ajoutés: ${statsTotal.ajoutes}`);
    Logger.log(`Total modifiés: ${statsTotal.modifies}`);
    
    envoyerRapportBidirectionnel(statsTotal);
    
    return statsTotal;
    
  } catch (error) {
    Logger.log('ERREUR: ' + error.toString());
    envoyerRapport(
      `❌ Erreur sync [${Session.getActiveUser().getEmail()}]`,
      `Compte: ${Session.getActiveUser().getEmail()}\nErreur lors de la synchronisation:\n\n${error.toString()}\n\nStack:\n${error.stack}`
    );
    throw error;
  }
}

// ============================================
// CHAMPS PEOPLE API
// ============================================

const PERSON_FIELDS = [
  'names', 'emailAddresses', 'phoneNumbers', 'addresses',
  'biographies', 'photos', 'organizations', 'birthdays',
  'nicknames', 'relations', 'events', 'urls',
  'imClients', 'userDefined', 'externalIds',
  'calendarUrls', 'sipAddresses', 'locations',
  'occupations', 'interests', 'skills', 'genders',
  'memberships', 'miscKeywords', 'clientData',
  'metadata'
].join(',');

// ============================================
// RÉCUPÉRATION DES CONTACTS
// ============================================

/**
 * Récupère tous les contacts du compte actuel via People API
 * Gère la pagination automatiquement (max 1000 par page)
 */
function getContactsFromPrimary() {
  const allPersons = [];
  let pageToken = null;

  do {
    const options = {
      personFields: PERSON_FIELDS,
      pageSize: 1000
    };
    if (pageToken) {
      options.pageToken = pageToken;
    }

    const response = appelAvecRetry(
      () => People.People.Connections.list('people/me', options),
      'listContacts'
    );
    if (response.connections) {
      allPersons.push(...response.connections);
    }
    pageToken = response.nextPageToken;
  } while (pageToken);

  return allPersons.map(person => convertirPersonToObject(person));
}

/**
 * Récupère les contacts du compte secondaire via Google Drive
 * (L'accès direct à un autre compte nécessite OAuth2 avancé)
 */
function getContactsFromSecondary() {
  Logger.log('⚠️ Accès compte secondaire nécessite configuration OAuth avancée');
  Logger.log('Voir la section "Solution Alternative" du guide');
  return [];
}

/**
 * Convertit un objet Person (People API) en objet JavaScript simple
 */
function convertirPersonToObject(person) {
  const names = person.names || [];
  const emails = person.emailAddresses || [];
  const phones = person.phoneNumbers || [];
  const addresses = person.addresses || [];
  const bios = person.biographies || [];
  const photos = person.photos || [];
  const orgs = person.organizations || [];
  const birthdays = person.birthdays || [];

  // Photo : URL ou null (pas un blob comme ContactsApp)
  let photoUrl = null;
  if (photos.length > 0 && !photos[0].default) {
    photoUrl = photos[0].url;
  }

  // Date de dernière modification
  let derniereModif = new Date(0);
  if (person.metadata && person.metadata.sources) {
    person.metadata.sources.forEach(source => {
      if (source.updateTime) {
        const d = new Date(source.updateTime);
        if (d > derniereModif) derniereModif = d;
      }
    });
  }

  // Nom : utiliser le displayName, sinon le nom d'entreprise comme fallback
  let nom = names.length > 0 ? (names[0].displayName || '') : '';
  const prenom = names.length > 0 ? (names[0].givenName || '') : '';
  const nomFamille = names.length > 0 ? (names[0].familyName || '') : '';

  // Si pas de nom/prénom, utiliser le nom d'entreprise
  if (!nom && !prenom && !nomFamille && orgs.length > 0 && orgs[0].name) {
    nom = orgs[0].name;
  }

  // Champs supplémentaires (stockés bruts pour ne rien perdre)
  const champsSupplementaires = {};
  // memberships inclus — les IDs de groupes sont traduits lors de l'import (voir traduireMemberships)
  const CHAMPS_BRUTS = [
    'nicknames', 'relations', 'events', 'urls',
    'imClients', 'userDefined', 'externalIds',
    'calendarUrls', 'sipAddresses', 'locations',
    'occupations', 'interests', 'skills', 'genders',
    'memberships', 'miscKeywords', 'clientData'
  ];
  CHAMPS_BRUTS.forEach(champ => {
    if (person[champ] && person[champ].length > 0) {
      champsSupplementaires[champ] = person[champ];
    }
  });

  return {
    id: person.resourceName,
    resourceName: person.resourceName,
    etag: person.etag,
    nom: nom,
    prenom: prenom,
    nomFamille: nomFamille,
    entreprise: orgs.length > 0 ? (orgs[0].name || '') : '',
    poste: orgs.length > 0 ? (orgs[0].title || '') : '',
    toutesLesOrganisations: orgs.map(o => ({
      nom: o.name || '',
      poste: o.title || '',
      type: o.type || 'other'
    })),
    email: emails.length > 0 ? emails[0].value : '',
    tousLesEmails: emails.map(e => ({
      adresse: e.value,
      label: e.type || 'other'
    })),
    telephone: phones.length > 0 ? phones[0].value : '',
    tousLesTelephones: phones.map(p => ({
      numero: p.value,
      label: p.type || 'mobile'
    })),
    adresse: addresses.length > 0 ? (addresses[0].formattedValue || '') : '',
    toutesLesAdresses: addresses.map(a => ({
      adresse: a.formattedValue || [a.streetAddress, a.city, a.postalCode, a.region, a.country].filter(Boolean).join(', ') || '',
      label: a.type || 'home',
      // Garder les champs structurés pour recréer l'adresse fidèlement
      streetAddress: a.streetAddress || '',
      city: a.city || '',
      postalCode: a.postalCode || '',
      region: a.region || '',
      country: a.country || '',
      countryCode: a.countryCode || '',
      extendedAddress: a.extendedAddress || ''
    })),
    photoUrl: photoUrl,
    notes: bios.length > 0 ? (bios[0].value || '') : '',
    anniversaire: birthdays.length > 0 && birthdays[0].date ? birthdays[0].date : null,
    champsSupplementaires: champsSupplementaires,
    derniereModif: derniereModif,
    contactOriginal: person
  };
}

/**
 * Génère une clé unique pour un contact (clé primaire pour la Map)
 * Priorité : email > téléphone normalisé > nom complet > nom d'entreprise
 */
function genererCleUnique(contact) {
  // Si le contact a un email, c'est la clé
  if (contact.email && contact.email.trim() !== '') {
    return 'email:' + contact.email.toLowerCase().trim();
  }

  // Sinon, utiliser le téléphone (normalisé)
  if (contact.telephone && contact.telephone.trim() !== '') {
    const telNormalise = normaliserTelephone(contact.telephone);
    if (telNormalise) {
      return 'phone:' + telNormalise;
    }
  }

  // Utiliser le nom complet
  if (contact.nom && contact.nom.trim() !== '') {
    return 'name:' + contact.nom.toLowerCase().trim();
  }

  // Fallback : nom d'entreprise (contacts professionnels sans nom)
  if (contact.entreprise && contact.entreprise.trim() !== '') {
    return 'org:' + contact.entreprise.toLowerCase().trim();
  }

  // Contact invalide sans identifiant
  return null;
}

/**
 * Génère TOUTES les clés possibles d'un contact (emails + téléphones)
 * Utilisé pour la recherche de correspondance cross-account
 */
function genererToutesCles(contact) {
  const cles = new Set();

  // Tous les emails
  if (contact.tousLesEmails && contact.tousLesEmails.length > 0) {
    contact.tousLesEmails.forEach(e => {
      if (e.adresse && e.adresse.trim() !== '') {
        cles.add('email:' + e.adresse.toLowerCase().trim());
      }
    });
  } else if (contact.email && contact.email.trim() !== '') {
    cles.add('email:' + contact.email.toLowerCase().trim());
  }

  // Tous les téléphones
  if (contact.tousLesTelephones && contact.tousLesTelephones.length > 0) {
    contact.tousLesTelephones.forEach(t => {
      const norm = normaliserTelephone(t.numero);
      if (norm) cles.add('phone:' + norm);
    });
  } else if (contact.telephone && contact.telephone.trim() !== '') {
    const norm = normaliserTelephone(contact.telephone);
    if (norm) cles.add('phone:' + norm);
  }

  // Nom et entreprise seulement si aucun email/téléphone
  if (cles.size === 0) {
    if (contact.nom && contact.nom.trim() !== '') {
      cles.add('name:' + contact.nom.toLowerCase().trim());
    }
    if (contact.entreprise && contact.entreprise.trim() !== '') {
      cles.add('org:' + contact.entreprise.toLowerCase().trim());
    }
  }

  return cles;
}

/**
 * Normalise un numéro de téléphone pour comparaison
 * Retire espaces, tirets, parenthèses, etc.
 * Garde uniquement les chiffres et le + initial
 */
function normaliserTelephone(telephone) {
  if (!telephone) return null;
  
  // Retirer tous les caractères sauf chiffres et +
  let normalise = telephone.replace(/[^\d+]/g, '');
  
  // Si commence par 00, remplacer par +
  if (normalise.startsWith('00')) {
    normalise = '+' + normalise.substring(2);
  }
  
  // Si numéro français sans indicatif, ajouter +33
  if (normalise.startsWith('0') && normalise.length === 10) {
    normalise = '+33' + normalise.substring(1);
  }
  
  // Minimum 3 chiffres (numéros courts FR : urgences 15/17/18)
  // Pas de maximum artificiel (E.164 autorise jusqu'à 15 chiffres,
  // certains pays vont au-delà ; 7 chiffres valide en Suède, Islande, etc.)
  const chiffresUniquement = normalise.replace(/\+/g, '');
  if (chiffresUniquement.length < 3) {
    return null;
  }
  
  return normalise;
}

// ============================================
// PROGRESSION DE SYNCHRONISATION (reprise entre runs)
// ============================================

const NOM_FICHIER_PROGRESSION = 'sync_progress.json';

/**
 * Charge la progression sauvegardée depuis Drive
 * Retourne un Set de clés déjà traitées, ou un Set vide si pas de progression
 */
function chargerProgression() {
  try {
    const files = DriveApp.getFilesByName(NOM_FICHIER_PROGRESSION);
    if (!files.hasNext()) return new Set();

    const file = files.next();
    const data = JSON.parse(file.getBlob().getDataAsString());

    // Vérifier que la progression n'est pas trop vieille (max 24h)
    const age = new Date() - new Date(data.timestamp);
    if (age > 24 * 60 * 60 * 1000) {
      Logger.log(`🔄 Progression expirée (${Math.round(age / 3600000)}h) — on recommence`);
      file.setTrashed(true);
      return new Set();
    }

    const clesTraitees = new Set(data.clesTraitees || []);
    Logger.log(`📋 Progression chargée: ${clesTraitees.size} contacts déjà traités (sauvegardé ${new Date(data.timestamp).toLocaleString('fr-FR')})`);
    return clesTraitees;
  } catch (e) {
    Logger.log(`⚠️ Erreur chargement progression: ${e.message}`);
    return new Set();
  }
}

/**
 * Sauvegarde la progression sur Drive (clés déjà traitées)
 */
function sauvegarderProgression(clesTraitees) {
  try {
    const data = JSON.stringify({
      timestamp: new Date().toISOString(),
      clesTraitees: Array.from(clesTraitees)
    });

    const files = DriveApp.getFilesByName(NOM_FICHIER_PROGRESSION);
    if (files.hasNext()) {
      files.next().setContent(data);
    } else {
      DriveApp.createFile(NOM_FICHIER_PROGRESSION, data, MimeType.PLAIN_TEXT);
    }
    Logger.log(`💾 Progression sauvegardée: ${clesTraitees.size} contacts traités`);
  } catch (e) {
    Logger.log(`⚠️ Erreur sauvegarde progression: ${e.message}`);
  }
}

/**
 * Supprime le fichier de progression (sync terminée)
 */
function supprimerProgression() {
  try {
    const files = DriveApp.getFilesByName(NOM_FICHIER_PROGRESSION);
    while (files.hasNext()) {
      files.next().setTrashed(true);
    }
    Logger.log(`🗑️ Progression supprimée (sync complète)`);
  } catch (e) {
    Logger.log(`⚠️ Erreur suppression progression: ${e.message}`);
  }
}

// ============================================
// SYNCHRONISATION UNIDIRECTIONNELLE
// ============================================

/**
 * Synchronise dans une direction (source → destination)
 * Utilise la progression sauvegardée pour reprendre là où on s'est arrêté
 */
function syncDirection(mapSource, mapDestination, direction) {
  Logger.log(`--- Sync ${direction} ---`);

  // Charger la progression des runs précédents
  const clesDejaTraitees = chargerProgression();

  let ajoutes = 0;
  let fusionnes = 0;
  let ignores = 0;
  let sautes = 0;

  let erreurs = 0;
  let interrompu = false;
  const cles = Array.from(mapSource.keys());

  for (let i = 0; i < cles.length; i++) {
    const cle = cles[i];
    if (!cle) continue;

    // Sauter les contacts déjà traités dans un run précédent
    if (clesDejaTraitees.has(cle)) {
      sautes++;
      continue;
    }

    // Garde-fou temporel : interrompre proprement avant le timeout de 6 min
    if (tempsDepasse()) {
      const restant = cles.length - i - sautes;
      Logger.log(`⏱️ Limite de temps atteinte (5 min). ${i} parcourus, ${clesDejaTraitees.size} déjà traités, ${restant} restant(s).`);
      interrompu = true;
      break;
    }

    const contactSource = mapSource.get(cle);
    const identifiant = contactSource.email || contactSource.telephone || contactSource.nom;

    try {
      // Chercher par clé primaire ET secondaire (tous emails + téléphones)
      const contactDest = chercherCorrespondant(contactSource, mapDestination);
      if (contactDest) {
        // mettreAJourContact ne fait AUCUN appel API si rien n'a changé (retourne false)
        const aModifie = mettreAJourContact(contactDest, contactSource);
        if (aModifie) {
          fusionnes++;
        } else {
          ignores++;
        }
      } else {
        if (CONFIG.DEBUG_MODE) {
          Logger.log(`➕ Ajout: ${identifiant}`);
        }
        creerContact(contactSource);
        ajoutes++;
      }
      // Marquer comme traité (que ce soit ajouté, fusionné ou ignoré)
      clesDejaTraitees.add(cle);
    } catch (e) {
      erreurs++;
      Logger.log(`❌ Erreur sur contact "${identifiant}": ${e.message}`);
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`  Stack: ${e.stack}`);
      }
      // On marque quand même comme traité pour ne pas rebloquer au prochain run
      clesDejaTraitees.add(cle);
    }
  }

  // Sauvegarder ou supprimer la progression
  if (interrompu) {
    sauvegarderProgression(clesDejaTraitees);
  } else {
    // Sync terminée complètement → supprimer la progression
    supprimerProgression();
  }

  Logger.log(`Direction ${direction}: ${ajoutes} ajoutés, ${fusionnes} fusionnés, ${ignores} déjà à jour, ${sautes} sautés (déjà traités)` + (erreurs > 0 ? `, ${erreurs} erreur(s)` : '') + (interrompu ? ' ⏱️ INTERROMPU' : ' ✅ COMPLET'));

  return { ajoutes, modifies: fusionnes, erreurs, interrompu, ignores, sautes };
}

// ============================================
// GESTION DES CONTACTS
// ============================================

/**
 * Met à jour un contact existant avec les données d'un autre
 * FUSION INTELLIGENTE : combine les informations au lieu d'écraser
 *
 * OPTIMISATION: Détecte d'abord s'il y a des changements AVANT tout appel API.
 * Si rien n'a changé, le contact est ignoré (0 appel API au lieu de 2+).
 */
function mettreAJourContact(contactDestData, dataSource) {
  const resourceName = contactDestData.resourceName;
  const identifiant = contactDestData.email || contactDestData.telephone || contactDestData.nom || 'inconnu';

  // ─── PHASE 1 : DÉTECTION DES CHANGEMENTS (sans appel API) ───

  const personMisAJour = { resourceName: resourceName };
  let champsModifies = [];

  // FUSION DES NOMS
  const nomsResultat = fusionnerNoms(contactDestData, dataSource);
  if (nomsResultat) {
    personMisAJour.names = nomsResultat;
    champsModifies.push('names');
  }

  // FUSION DES TÉLÉPHONES
  const telsResultat = fusionnerTelephones(contactDestData, dataSource);
  if (telsResultat) {
    personMisAJour.phoneNumbers = telsResultat;
    champsModifies.push('phoneNumbers');
  }

  // FUSION DES EMAILS
  const emailsResultat = fusionnerEmails(contactDestData, dataSource);
  if (emailsResultat) {
    personMisAJour.emailAddresses = emailsResultat;
    champsModifies.push('emailAddresses');
  }

  // FUSION DES ADRESSES
  const adressesResultat = fusionnerAdresses(contactDestData, dataSource);
  if (adressesResultat) {
    personMisAJour.addresses = adressesResultat;
    champsModifies.push('addresses');
  }

  // FUSION DES ORGANISATIONS
  const orgsResultat = fusionnerOrganisations(contactDestData, dataSource);
  if (orgsResultat) {
    personMisAJour.organizations = orgsResultat;
    champsModifies.push('organizations');
  }

  // FUSION DES NOTES
  const notesResultat = fusionnerNotes(contactDestData, dataSource);
  if (notesResultat) {
    personMisAJour.biographies = notesResultat;
    champsModifies.push('biographies');
  }

  // FUSION DES ANNIVERSAIRES
  if (!contactDestData.anniversaire && dataSource.anniversaire) {
    personMisAJour.birthdays = [{ date: dataSource.anniversaire }];
    champsModifies.push('birthdays');
    if (CONFIG.DEBUG_MODE) {
      const d = dataSource.anniversaire;
      Logger.log(`  🎂 Anniversaire ajouté: ${d.day || '?'}/${d.month || '?'}/${d.year || '?'}`);
    }
  }

  // FUSION DES CHAMPS SUPPLÉMENTAIRES (nicknames, relations, events, urls, etc.)
  // IMPORTANT: memberships traités séparément (via ContactGroups.Members.modify)
  const CHAMPS_VALEUR_UNIQUE = ['genders'];
  const champsSupSrc = dataSource.champsSupplementaires || {};
  const champsSupDest = contactDestData.champsSupplementaires || {};
  let membershipsAAjouter = [];

  // Traiter tous les champs : ceux du source ET ceux du destination (pour dédupliquer)
  const tousLesChampsSup = new Set([...Object.keys(champsSupSrc), ...Object.keys(champsSupDest)]);
  tousLesChampsSup.forEach(champ => {
    if (champ === 'memberships') {
      membershipsAAjouter = champsSupSrc[champ] || [];
      return;
    }
    const srcChamp = champsSupSrc[champ];
    const destChamp = champsSupDest[champ];

    if (srcChamp && srcChamp.length > 0 && (!destChamp || destChamp.length === 0)) {
      // Champ présent uniquement dans la source → ajouter
      let valeur = nettoyerMetadata(srcChamp);
      if (CHAMPS_VALEUR_UNIQUE.includes(champ)) {
        valeur = [valeur[0]];
      }
      personMisAJour[champ] = valeur;
      champsModifies.push(champ);
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`  📋 Champ "${champ}" ajouté (${valeur.length} entrée(s))`);
      }
    } else if (destChamp && destChamp.length > 0 && !CHAMPS_VALEUR_UNIQUE.includes(champ)) {
      // Champ présent dans la destination → fusionner avec source (si elle existe) + dédupliquer
      const fusionnes = fusionnerChampsGenerique(destChamp, srcChamp);
      if (fusionnes) {
        personMisAJour[champ] = fusionnes;
        champsModifies.push(champ);
        if (CONFIG.DEBUG_MODE) {
          Logger.log(`  📋 Champ "${champ}" fusionné/dédupliqué (${destChamp.length} → ${fusionnes.length})`);
        }
      }
    }
  });

  // Vérifier s'il y a des memberships à ajouter (qui ne sont pas déjà présents)
  let membershipsNouveaux = [];
  if (membershipsAAjouter.length > 0) {
    const groupesDest = (champsSupDest.memberships) || [];
    const groupesDestSet = new Set(groupesDest.map(m =>
      m.contactGroupMembership && m.contactGroupMembership.contactGroupResourceName
    ).filter(Boolean));

    membershipsNouveaux = membershipsAAjouter.filter(m => {
      const cgm = m.contactGroupMembership;
      if (!cgm || !cgm.contactGroupResourceName) return false;
      if (cgm.contactGroupResourceName === 'contactGroups/myContacts') return false;
      return !groupesDestSet.has(cgm.contactGroupResourceName);
    });
  }

  // Vérifier si une photo doit être ajoutée
  const photoAAjouter = dataSource.photoUrl && !contactDestData.photoUrl;

  // ─── PHASE 2 : RIEN À FAIRE ? → SORTIR (0 appel API) ───

  if (champsModifies.length === 0 && membershipsNouveaux.length === 0 && !photoAAjouter) {
    // Aucun changement détecté → on passe ce contact sans appel API
    return false;
  }

  if (CONFIG.DEBUG_MODE) {
    Logger.log(`  ✏️ ${champsModifies.length} champ(s) modifié(s)` +
      (membershipsNouveaux.length > 0 ? `, ${membershipsNouveaux.length} groupe(s)` : '') +
      (photoAAjouter ? ', +photo' : ''));
  }

  // ─── PHASE 3 : APPLIQUER LES MODIFICATIONS (appels API uniquement si nécessaire) ───

  if (champsModifies.length > 0) {
    // Récupérer l'etag frais UNIQUEMENT quand on a des modifications à appliquer
    let personFrais;
    try {
      personFrais = appelAvecRetry(
        () => People.People.get(resourceName, { personFields: PERSON_FIELDS }),
        `getContact(${identifiant})`
      );
    } catch (e) {
      if (e.message && e.message.indexOf('not found') !== -1) {
        Logger.log(`⚠️ Contact introuvable (supprimé ?) : ${identifiant} (${resourceName}) — ignoré`);
        return false;
      }
      throw e;
    }

    personMisAJour.etag = personFrais.etag;

    try {
      appelAvecRetry(
        () => People.People.updateContact(personMisAJour, resourceName, {
          updatePersonFields: champsModifies.join(','),
          personFields: PERSON_FIELDS
        }),
        `updateContact(${identifiant})`
      );
    } catch (e) {
      if (e.message && e.message.indexOf('not found') !== -1) {
        Logger.log(`⚠️ Contact disparu avant mise à jour : ${identifiant} (${resourceName}) — ignoré`);
        return false;
      }
      throw e;
    }
  }

  // FUSION DES MEMBERSHIPS (via ContactGroups.Members.modify, pas via updateContact)
  membershipsNouveaux.forEach(m => {
    const cgm = m.contactGroupMembership;
    try {
      appelAvecRetry(
        () => People.ContactGroups.Members.modify(
          { resourceNamesToAdd: [resourceName] },
          cgm.contactGroupResourceName
        ),
        `membership(${identifiant} → ${cgm.contactGroupResourceName})`
      );
    } catch (e) {
      Logger.log(`  ⚠️ Impossible d'ajouter au groupe ${cgm.contactGroupResourceName}: ${e.message}`);
    }
  });

  // FUSION DES PHOTOS (appel séparé requis par l'API)
  if (photoAAjouter) {
    fusionnerPhotos(contactDestData, dataSource);
  }

  return true;
}

/**
 * Fusionne intelligemment les noms
 * Garde toujours la version la PLUS COMPLÈTE
 * Retourne l'array names mis à jour ou null si pas de changement
 */
function fusionnerNoms(contactDestData, dataSource) {
  const prenomDest = contactDestData.prenom || '';
  const nomFamilleDest = contactDestData.nomFamille || '';
  const prenomSource = dataSource.prenom || '';
  const nomFamilleSource = dataSource.nomFamille || '';

  let modifie = false;
  let prenom = prenomDest;
  let nomFamille = nomFamilleDest;

  if (prenomSource.length > prenomDest.length) {
    prenom = prenomSource;
    modifie = true;
    if (CONFIG.DEBUG_MODE) {
      Logger.log(`  ✏️ Prénom mis à jour: "${prenomDest}" → "${prenomSource}"`);
    }
  }

  if (nomFamilleSource.length > nomFamilleDest.length) {
    nomFamille = nomFamilleSource;
    modifie = true;
    if (CONFIG.DEBUG_MODE) {
      Logger.log(`  ✏️ Nom famille mis à jour: "${nomFamilleDest}" → "${nomFamilleSource}"`);
    }
  }

  if (!modifie) return null;

  return [{
    givenName: prenom,
    familyName: nomFamille
  }];
}

/**
 * Convertit un label en type People API
 */
function labelVersTelephone(label) {
  if (!label) return 'mobile';
  const l = label.toLowerCase();
  if (l.includes('domicile') || l.includes('home') || l.includes('maison')) return 'home';
  if (l.includes('travail') || l.includes('work') || l.includes('bureau')) return 'work';
  if (l.includes('fax')) return 'homeFax';
  if (l.includes('mobile') || l.includes('portable') || l.includes('cell')) return 'mobile';
  return 'other';
}

function labelVersEmail(label) {
  if (!label) return 'home';
  const l = label.toLowerCase();
  if (l.includes('travail') || l.includes('work') || l.includes('bureau')) return 'work';
  if (l.includes('domicile') || l.includes('home')) return 'home';
  return 'other';
}

function labelVersAdresse(label) {
  if (!label) return 'home';
  const l = label.toLowerCase();
  if (l.includes('travail') || l.includes('work') || l.includes('bureau')) return 'work';
  if (l.includes('domicile') || l.includes('home')) return 'home';
  return 'other';
}

/**
 * Fusionne les téléphones sans créer de doublons
 * Retourne l'array phoneNumbers complet ou null si pas de changement
 */
function fusionnerTelephones(contactDestData, dataSource) {
  if (!dataSource.tousLesTelephones || dataSource.tousLesTelephones.length === 0) {
    return null;
  }

  // Téléphones existants (normalisés)
  const telephonesExistants = (contactDestData.tousLesTelephones || []).map(t => ({
    numero: t.numero,
    numeroNormalise: normaliserTelephone(t.numero),
    label: t.label
  }));

  let ajouts = 0;
  const nouveauxTelephones = [];

  dataSource.tousLesTelephones.forEach(telSource => {
    const telNormalise = normaliserTelephone(telSource.numero);
    if (telNormalise) {
      const dejaPresent = telephonesExistants.some(existant =>
        existant.numeroNormalise === telNormalise
      );
      if (!dejaPresent) {
        nouveauxTelephones.push(telSource);
        ajouts++;
        if (CONFIG.DEBUG_MODE) {
          Logger.log(`  📱 Téléphone ajouté (${telSource.label}): ${telSource.numero}`);
        }
      }
    }
  });

  if (ajouts === 0) {
    if (CONFIG.DEBUG_MODE) Logger.log(`  ℹ️ Aucun nouveau téléphone à ajouter`);
    return null;
  }

  // Construire la liste complète pour People API
  const tous = [
    ...telephonesExistants.map(t => ({ value: t.numero, type: labelVersTelephone(t.label) })),
    ...nouveauxTelephones.map(t => ({ value: t.numero, type: labelVersTelephone(t.label) }))
  ];
  return tous;
}

/**
 * Fusionne les emails sans créer de doublons
 * Retourne l'array emailAddresses complet ou null si pas de changement
 */
function fusionnerEmails(contactDestData, dataSource) {
  if (!dataSource.tousLesEmails || dataSource.tousLesEmails.length === 0) {
    return null;
  }

  const emailsExistants = (contactDestData.tousLesEmails || []).map(e => ({
    adresse: e.adresse,
    adresseLower: e.adresse.toLowerCase(),
    label: e.label
  }));

  let ajouts = 0;
  const nouveauxEmails = [];

  dataSource.tousLesEmails.forEach(emailSource => {
    const emailLower = emailSource.adresse.toLowerCase();
    const dejaPresent = emailsExistants.some(existant =>
      existant.adresseLower === emailLower
    );
    if (!dejaPresent && emailSource.adresse.trim() !== '') {
      nouveauxEmails.push(emailSource);
      ajouts++;
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`  📧 Email ajouté (${emailSource.label}): ${emailSource.adresse}`);
      }
    }
  });

  if (ajouts === 0) {
    if (CONFIG.DEBUG_MODE) Logger.log(`  ℹ️ Aucun nouvel email à ajouter`);
    return null;
  }

  const tous = [
    ...emailsExistants.map(e => ({ value: e.adresse, type: labelVersEmail(e.label) })),
    ...nouveauxEmails.map(e => ({ value: e.adresse, type: labelVersEmail(e.label) }))
  ];
  return tous;
}

/**
 * Fusionne les adresses - CONSERVE TOUTES LES ADRESSES sans doublon
 * Retourne l'array addresses complet ou null si pas de changement
 */
function fusionnerAdresses(contactDestData, dataSource) {
  if (!dataSource.toutesLesAdresses || dataSource.toutesLesAdresses.length === 0) {
    return null;
  }

  const adressesExistantes = (contactDestData.toutesLesAdresses || []).map(a => ({
    adresse: a.adresse,
    adresseNormalisee: normaliserAdresse(a.adresse),
    postalCode: (a.postalCode || '').trim(),
    streetAddress: normaliserAdresse(a.streetAddress || ''),
    label: a.label
  }));

  let ajouts = 0;
  const nouvellesAdresses = [];

  dataSource.toutesLesAdresses.forEach(adresseSource => {
    const adresseNormalisee = normaliserAdresse(adresseSource.adresse);
    const postalCodeSrc = (adresseSource.postalCode || '').trim();
    const streetSrc = normaliserAdresse(adresseSource.streetAddress || '');

    const dejaPresente = adressesExistantes.some(existante => {
      // Comparaison par formattedValue normalisé
      if (existante.adresseNormalisee && adresseNormalisee &&
          existante.adresseNormalisee === adresseNormalisee) return true;
      // Comparaison par code postal + rue (champs structurés)
      if (postalCodeSrc && existante.postalCode &&
          postalCodeSrc === existante.postalCode &&
          streetSrc && existante.streetAddress &&
          streetSrc === existante.streetAddress) return true;
      // Comparaison partielle : l'un contient l'autre (ex: "10 Rue X" vs "10 Rue X, 75001 Paris")
      if (existante.adresseNormalisee && adresseNormalisee &&
          (existante.adresseNormalisee.includes(adresseNormalisee) ||
           adresseNormalisee.includes(existante.adresseNormalisee))) return true;
      return false;
    });
    if (!dejaPresente && adresseSource.adresse.trim() !== '') {
      nouvellesAdresses.push(adresseSource);
      ajouts++;
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`  🏠 Adresse ajoutée (${adresseSource.label}): ${adresseSource.adresse}`);
      }
    }
  });

  if (ajouts === 0) {
    if (CONFIG.DEBUG_MODE) Logger.log(`  ℹ️ Aucune nouvelle adresse à ajouter`);
    return null;
  }

  const toutes = [
    ...(contactDestData.toutesLesAdresses || []).map(a => construireAdresseAPI(a)),
    ...nouvellesAdresses.map(a => construireAdresseAPI(a))
  ];
  return toutes;
}

/**
 * Fusionne les organisations sans créer de doublons
 * Retourne l'array organizations complet ou null si pas de changement
 */
function fusionnerOrganisations(contactDestData, dataSource) {
  if (!dataSource.toutesLesOrganisations || dataSource.toutesLesOrganisations.length === 0) {
    return null;
  }

  const orgsExistantes = (contactDestData.toutesLesOrganisations || []).map(o => ({
    nom: o.nom,
    nomLower: (o.nom || '').toLowerCase().trim(),
    poste: o.poste,
    type: o.type
  }));

  let ajouts = 0;
  const nouvellesOrgs = [];

  dataSource.toutesLesOrganisations.forEach(orgSource => {
    if (!orgSource.nom || orgSource.nom.trim() === '') return;
    const nomLower = orgSource.nom.toLowerCase().trim();
    const dejaPresente = orgsExistantes.some(existante =>
      existante.nomLower === nomLower
    );
    if (!dejaPresente) {
      nouvellesOrgs.push(orgSource);
      ajouts++;
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`  🏢 Organisation ajoutée: ${orgSource.nom} (${orgSource.poste || ''})`);
      }
    } else {
      // Compléter le poste si manquant
      const existante = orgsExistantes.find(e => e.nomLower === nomLower);
      if (existante && !existante.poste && orgSource.poste) {
        existante.poste = orgSource.poste;
        ajouts++;
        if (CONFIG.DEBUG_MODE) {
          Logger.log(`  🏢 Poste ajouté pour ${orgSource.nom}: ${orgSource.poste}`);
        }
      }
    }
  });

  if (ajouts === 0) {
    if (CONFIG.DEBUG_MODE) Logger.log(`  ℹ️ Aucune nouvelle organisation à ajouter`);
    return null;
  }

  const toutes = [
    ...orgsExistantes.map(o => ({ name: o.nom, title: o.poste || '', type: o.type || 'other' })),
    ...nouvellesOrgs.map(o => ({ name: o.nom, title: o.poste || '', type: o.type || 'other' }))
  ];
  return toutes;
}

/**
 * Vérifie si un contact est complètement vide (aucune donnée utile)
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
  if (contact.toutesLesOrganisations && contact.toutesLesOrganisations.length > 0) return false;
  return true;
}

/**
 * Construit un objet adresse pour l'API People à partir de nos données
 * Utilise les champs structurés s'ils existent, sinon formattedValue
 */
function construireAdresseAPI(a) {
  const adresse = { type: labelVersAdresse(a.label) };
  if (a.streetAddress || a.city || a.postalCode) {
    // Champs structurés disponibles → les utiliser (fidèle à l'original)
    if (a.streetAddress) adresse.streetAddress = a.streetAddress;
    if (a.extendedAddress) adresse.extendedAddress = a.extendedAddress;
    if (a.city) adresse.city = a.city;
    if (a.postalCode) adresse.postalCode = a.postalCode;
    if (a.region) adresse.region = a.region;
    if (a.country) adresse.country = a.country;
    if (a.countryCode) adresse.countryCode = a.countryCode;
  }
  if (a.adresse) adresse.formattedValue = a.adresse;
  return adresse;
}

/**
 * Normalise une adresse pour comparaison
 * Retire espaces multiples, ponctuation, accents, abréviations
 */
function normaliserAdresse(adresse) {
  if (!adresse) return '';

  return adresse
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Retirer accents
    .replace(/[.,;:'\-\/\\()]/g, ' ') // Ponctuation → espace
    .replace(/\b(rue|avenue|av|boulevard|bd|blvd|place|pl|chemin|ch|impasse|imp|allée|route|rte)\b/gi, '') // Abréviations courantes
    .replace(/\s+/g, ' ') // Espaces multiples → simple
    .trim();
}

/**
 * Nettoie les marqueurs [SYNC] des notes d'un contact
 * Retire les lignes "[SYNC] Fusionné: ..." et "[SYNC] Créé: ..." ainsi que les séparateurs orphelins
 * Retourne le texte nettoyé ou null si rien à nettoyer
 */
function nettoyerMarqueursSyncNotes(notes) {
  if (!notes) return null;
  const nettoye = notes
    .replace(/\n?\[SYNC\] (?:Fusionné|Créé):.*$/gm, '')  // Lignes [SYNC]
    .replace(/(\n---\n)+$/g, '')    // Séparateurs en fin de texte
    .replace(/^(\n---\n)+/g, '')    // Séparateurs en début de texte
    .trim();
  // Retourner null si rien n'a changé
  if (nettoye === notes.trim()) return null;
  return nettoye;
}

/**
 * Fusionne les notes en conservant les deux
 * Retourne l'array biographies ou null si pas de changement
 * Nettoie aussi les anciens marqueurs [SYNC] s'il y en a
 */
function fusionnerNotes(contactDestData, dataSource) {
  const notesDest = contactDestData.notes || '';
  const notesSource = dataSource.notes || '';

  // Nettoyer les marqueurs [SYNC] des deux côtés
  const notesDestClean = nettoyerMarqueursSyncNotes(notesDest) || notesDest.trim();
  const notesSourceClean = nettoyerMarqueursSyncNotes(notesSource) || notesSource.trim();

  // Vérifier si les notes destination doivent être nettoyées (anciens marqueurs [SYNC])
  const destANettoyage = nettoyerMarqueursSyncNotes(notesDest) !== null;

  // Vérifier si la source a du contenu nouveau à ajouter
  let sourceANouveau = false;
  if (notesSourceClean && notesSourceClean !== '' && !notesDestClean.includes(notesSourceClean)) {
    sourceANouveau = true;
  }

  // Rien à faire si pas de nettoyage nécessaire et pas de nouveau contenu
  if (!destANettoyage && !sourceANouveau) return null;

  // Construire les notes finales
  let notesFinales = notesDestClean;
  if (sourceANouveau) {
    if (notesFinales) {
      notesFinales += '\n---\n' + notesSourceClean;
    } else {
      notesFinales = notesSourceClean;
    }
    if (CONFIG.DEBUG_MODE) {
      Logger.log(`  📝 Notes fusionnées`);
    }
  } else if (destANettoyage) {
    if (CONFIG.DEBUG_MODE) {
      Logger.log(`  🧹 Marqueurs [SYNC] nettoyés des notes`);
    }
  }

  return [{
    value: notesFinales || '',
    contentType: 'TEXT_PLAIN'
  }];
}

/**
 * Nettoie les metadata/source IDs d'un tableau de champs People API.
 * Nécessaire car l'API rejette les source IDs lors de la création/mise à jour.
 */
function nettoyerMetadata(champs) {
  if (!champs || !Array.isArray(champs)) return champs;
  return champs.map(entree => {
    const { metadata, ...reste } = entree;
    return reste;
  });
}

/**
 * Génère une clé de comparaison sémantique pour un champ supplémentaire.
 * Ignore les champs auto-générés par Google (metadata, formattedType, formattedValue,
 * formattedProtocol, sourcePrimary, etc.) et trie les clés pour une comparaison stable.
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
      // Normaliser les chaînes (trim + lowercase pour comparaison)
      if (typeof val === 'string') {
        nettoye[k] = val.trim();
      } else {
        nettoye[k] = val;
      }
    }
  });
  return JSON.stringify(nettoye);
}

/**
 * Déduplique un tableau de champs en utilisant la comparaison sémantique.
 * Retourne le tableau dédupliqué (sans metadata) ou null si rien n'a changé.
 */
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
 * Fusion générique pour les champs supplémentaires (relations, events, urls, etc.)
 * Fait l'union des entrées sans créer de doublons.
 * Utilise une comparaison sémantique (ignore metadata, formattedType, etc.)
 * Retourne le tableau fusionné (sans metadata) ou null si rien à ajouter.
 */
function fusionnerChampsGenerique(champsDest, champsSource) {
  if (!champsSource || champsSource.length === 0) return dedupliquerChamps(champsDest);
  if (!champsDest || champsDest.length === 0) return nettoyerMetadata(champsSource);

  // Comparer sémantiquement (ignore formattedType, metadata, etc.)
  const existants = new Set(champsDest.map(e => cleSemantiqueChamp(e)));

  let aAjoute = false;
  const resultat = [...champsDest];

  champsSource.forEach(entree => {
    const cle = cleSemantiqueChamp(entree);
    if (!existants.has(cle)) {
      resultat.push(entree);
      existants.add(cle);
      aAjoute = true;
    }
  });

  // Aussi dédupliquer les entrées existantes (nettoyage des doublons accumulés)
  const vus = new Set();
  const dedup = [];
  resultat.forEach(entree => {
    const cle = cleSemantiqueChamp(entree);
    if (!vus.has(cle)) {
      vus.add(cle);
      const { metadata, ...reste } = entree;
      dedup.push(reste);
    }
  });

  const aChange = aAjoute || dedup.length < resultat.length;
  return aChange ? dedup : null;
}

/**
 * Fusionne les photos - garde celle qui existe
 * Utilise People.People.updateContactPhoto pour les photos
 */
function fusionnerPhotos(contactDestData, dataSource) {
  // Vérifier si le contact source a une photo
  if (!dataSource.photoUrl) {
    return;
  }

  // Si destination a déjà une photo, ne pas écraser
  if (contactDestData.photoUrl) {
    if (CONFIG.DEBUG_MODE) {
      Logger.log(`  ℹ️ Photo déjà présente, conservation de l'existante`);
    }
    return;
  }

  // Télécharger la photo source et l'appliquer
  try {
    const response = UrlFetchApp.fetch(dataSource.photoUrl);
    const photoBytes = Utilities.base64Encode(response.getContent());

    appelAvecRetry(
      () => People.People.updateContactPhoto({ photoBytes: photoBytes }, contactDestData.resourceName),
      `photo(${contactDestData.email || contactDestData.nom || 'inconnu'})`
    );

    if (CONFIG.DEBUG_MODE) {
      Logger.log(`  📷 Photo de contact ajoutée`);
    }
  } catch (e) {
    Logger.log(`  ⚠️ Impossible d'ajouter la photo: ${e.toString()}`);
  }
}

/**
 * Crée un nouveau contact via People API
 */
function creerContact(data) {
  // Vérifier qu'on a au moins un identifiant (email, téléphone ou nom)
  const aEmail = data.email && data.email.trim() !== '';
  const aTelephone = data.telephone && data.telephone.trim() !== '';
  const aNom = data.nom && data.nom.trim() !== '';
  if (!aEmail && !aTelephone && !aNom) {
    Logger.log('⚠️ Impossible de créer un contact sans email, téléphone ni nom');
    return null;
  }

  const person = {};

  // Nom
  person.names = [{
    givenName: data.prenom || (data.telephone ? 'Contact' : ''),
    familyName: data.nomFamille || ''
  }];

  // Emails
  if (data.tousLesEmails && data.tousLesEmails.length > 0) {
    person.emailAddresses = data.tousLesEmails.map(e => ({
      value: e.adresse,
      type: labelVersEmail(e.label)
    }));
  } else if (data.email && data.email.trim() !== '') {
    person.emailAddresses = [{ value: data.email, type: 'home' }];
  }

  // Téléphones
  if (data.tousLesTelephones && data.tousLesTelephones.length > 0) {
    person.phoneNumbers = data.tousLesTelephones.map(t => ({
      value: t.numero,
      type: labelVersTelephone(t.label)
    }));
  } else if (data.telephone && data.telephone.trim() !== '') {
    person.phoneNumbers = [{ value: data.telephone, type: 'mobile' }];
  }

  // Adresses
  if (data.toutesLesAdresses && data.toutesLesAdresses.length > 0) {
    person.addresses = data.toutesLesAdresses.map(a => construireAdresseAPI(a));
  } else if (data.adresse && data.adresse.trim() !== '') {
    person.addresses = [{ formattedValue: data.adresse, type: 'home' }];
  }

  // Organisations
  if (data.toutesLesOrganisations && data.toutesLesOrganisations.length > 0) {
    person.organizations = data.toutesLesOrganisations.map(o => ({
      name: o.nom,
      title: o.poste || '',
      type: o.type || 'other'
    }));
  } else if (data.entreprise && data.entreprise.trim() !== '') {
    person.organizations = [{ name: data.entreprise, title: data.poste || '', type: 'other' }];
  }

  // Anniversaire
  if (data.anniversaire) {
    person.birthdays = [{ date: data.anniversaire }];
  }

  // Notes (nettoyage des anciens marqueurs [SYNC] si présents)
  if (data.notes) {
    const notesNettoyees = nettoyerMarqueursSyncNotes(data.notes) || data.notes.trim();
    if (notesNettoyees) {
      person.biographies = [{
        value: notesNettoyees,
        contentType: 'TEXT_PLAIN'
      }];
    }
  }

  // Champs supplémentaires (nicknames, relations, events, urls, etc.)
  // On nettoie les metadata/source IDs qui sont rejetés par l'API lors de la création
  // IMPORTANT: memberships exclus du createContact (ajoutés après via l'API ContactGroups)
  // Certains champs n'acceptent qu'UNE seule valeur par l'API People
  const CHAMPS_VALEUR_UNIQUE = ['genders'];
  let membershipsAAjouter = [];
  if (data.champsSupplementaires) {
    Object.keys(data.champsSupplementaires).forEach(champ => {
      if (data.champsSupplementaires[champ] && data.champsSupplementaires[champ].length > 0) {
        if (champ === 'memberships') {
          membershipsAAjouter = data.champsSupplementaires[champ];
          return;
        }
        let valeurs = data.champsSupplementaires[champ].map(entree => {
          const { metadata, ...reste } = entree;
          return reste;
        });
        // Dédupliquer avant création (peut contenir des doublons hérités de la fusion)
        const dedup = dedupliquerChamps(valeurs);
        if (dedup) valeurs = dedup;
        if (CHAMPS_VALEUR_UNIQUE.includes(champ)) {
          valeurs = [valeurs[0]];
        }
        person[champ] = valeurs;
      }
    });
  }

  const identifiant = data.email || data.telephone || data.nom || 'inconnu';
  const contactCree = appelAvecRetry(
    () => People.People.createContact(person, { personFields: PERSON_FIELDS }),
    `creerContact(${identifiant})`
  );

  // Memberships (ajout post-création via ContactGroups.Members.modify)
  if (membershipsAAjouter.length > 0) {
    membershipsAAjouter.forEach(m => {
      const cgm = m.contactGroupMembership;
      if (!cgm || !cgm.contactGroupResourceName) return;
      // Ignorer le groupe système "myContacts" (ajouté automatiquement)
      if (cgm.contactGroupResourceName === 'contactGroups/myContacts') return;
      try {
        appelAvecRetry(
          () => People.ContactGroups.Members.modify(
            { resourceNamesToAdd: [contactCree.resourceName] },
            cgm.contactGroupResourceName
          ),
          `membership(${identifiant} → ${cgm.contactGroupResourceName})`
        );
      } catch (e) {
        Logger.log(`  ⚠️ Impossible d'ajouter au groupe ${cgm.contactGroupResourceName}: ${e.message}`);
      }
    });
  }

  // Photo (appel séparé)
  if (data.photoUrl) {
    try {
      const response = UrlFetchApp.fetch(data.photoUrl);
      const photoBytes = Utilities.base64Encode(response.getContent());
      appelAvecRetry(
        () => People.People.updateContactPhoto({ photoBytes: photoBytes }, contactCree.resourceName),
        `photo(${identifiant})`
      );
    } catch (e) {
      Logger.log(`  ⚠️ Impossible d'ajouter la photo: ${e.toString()}`);
    }
  }

  return contactCree;
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Crée une Map indexée par clé unique (email ou téléphone)
 * Nouvelle version qui gère les contacts sans email
 * ET détecte/fusionne les doublons au sein d'un même compte
 */
/**
 * @param {boolean} simulationMode - Si true, ne supprime pas les contacts vides (dry-run)
 * @param {boolean} estLocal - Si true, les contacts viennent du compte local (suppression possible)
 */
function creerMapParCleUnique(contacts, simulationMode, estLocal) {
  const map = new Map();
  const indexInterne = new Map(); // Index secondaire pour détection doublons (clé secondaire → clé primaire)
  let contactsSansId = 0;
  let contactsVides = 0;
  let contactsVidesSupprimes = 0;
  let doublonsDetectes = 0;
  let doublonsFusionnes = 0;

  contacts.forEach(contact => {
    // S'assurer que derniereModif est un objet Date (peut être une string si importé depuis JSON)
    if (contact.derniereModif && !(contact.derniereModif instanceof Date)) {
      contact.derniereModif = new Date(contact.derniereModif);
    }

    const cle = genererCleUnique(contact);

    if (cle) {
      // Vérifier s'il y a déjà un contact avec cette clé primaire
      // OU avec un email/téléphone en commun (clé secondaire)
      let cleDoublon = null;
      if (map.has(cle)) {
        cleDoublon = cle;
      } else {
        // Chercher par toutes les clés secondaires (emails + téléphones)
        const toutesCles = genererToutesCles(contact);
        for (const c of toutesCles) {
          if (indexInterne.has(c)) {
            cleDoublon = indexInterne.get(c);
            break;
          }
        }
      }

      if (cleDoublon && map.has(cleDoublon)) {
        doublonsDetectes++;
        const existant = map.get(cleDoublon);
        Logger.log(`⚠️ Doublon INTERNE détecté: "${cle}" ↔ "${cleDoublon}"`);

        // Fusionner les deux contacts sous la clé du doublon existant
        const contactFusionne = fusionnerDeuxContacts(existant, contact);
        map.set(cleDoublon, contactFusionne);
        doublonsFusionnes++;

        // Mettre à jour l'index interne avec les nouvelles clés du contact fusionné
        genererToutesCles(contactFusionne).forEach(c => indexInterne.set(c, cleDoublon));

        if (CONFIG.DEBUG_MODE) {
          Logger.log(`  🔄 Doublon fusionné intelligemment`);
          Logger.log(`    Contact 1: ${existant.nom} (modifié ${existant.derniereModif.toLocaleDateString('fr-FR')})`);
          Logger.log(`    Contact 2: ${contact.nom} (modifié ${contact.derniereModif.toLocaleDateString('fr-FR')})`);
        }
      } else {
        map.set(cle, contact);
        // Indexer toutes les clés de ce contact
        genererToutesCles(contact).forEach(c => indexInterne.set(c, cle));
      }
    } else {
      // Contact sans identifiant valide — vérifier s'il est complètement vide
      const estVide = estContactVide(contact);

      if (estVide) {
        contactsVides++;
        // Supprimer uniquement si : config activée, pas en simulation, et contact local
        if (CONFIG.SUPPRIMER_CONTACTS_VIDES && !simulationMode && estLocal && contact.resourceName) {
          try {
            appelAvecRetry(
              () => People.People.deleteContact(contact.resourceName),
              `deleteContact(${contact.resourceName})`
            );
            contactsVidesSupprimes++;
            if (CONFIG.DEBUG_MODE) {
              Logger.log(`  🗑️ Contact vide supprimé: ${contact.resourceName}`);
            }
          } catch (e) {
            Logger.log(`  ⚠️ Impossible de supprimer ${contact.resourceName}: ${e.toString()}`);
          }
        } else if (CONFIG.DEBUG_MODE) {
          Logger.log(`  👻 Contact vide détecté: ${contact.resourceName || 'inconnu'}`);
        }
      } else {
        contactsSansId++;
        // Log détaillé pour comprendre ce que contient ce contact
        Logger.log(`⚠️ Contact sans identifiant valide (${contact.resourceName || 'inconnu'}):`);
        if (contact.notes) Logger.log(`    Notes: ${contact.notes.substring(0, 100)}`);
        if (contact.adresse) Logger.log(`    Adresse: ${contact.adresse}`);
        if (contact.photoUrl) Logger.log(`    Photo: oui`);
        if (contact.tousLesEmails && contact.tousLesEmails.length > 0) Logger.log(`    Emails: ${contact.tousLesEmails.map(e => e.adresse).join(', ')}`);
        if (contact.tousLesTelephones && contact.tousLesTelephones.length > 0) Logger.log(`    Tels: ${contact.tousLesTelephones.map(t => t.numero).join(', ')}`);
      }
    }
  });

  if (contactsVides > 0) {
    if (CONFIG.SUPPRIMER_CONTACTS_VIDES) {
      Logger.log(`🗑️ ${contactsVidesSupprimes}/${contactsVides} contact(s) vide(s) supprimé(s)`);
    } else {
      Logger.log(`👻 ${contactsVides} contact(s) complètement vide(s) détecté(s) (activer SUPPRIMER_CONTACTS_VIDES pour les nettoyer)`);
    }
  }

  if (contactsSansId > 0) {
    Logger.log(`ℹ️ ${contactsSansId} contact(s) ignoré(s) sans identifiant mais avec des données (voir logs ci-dessus)`);
  }

  if (doublonsDetectes > 0) {
    Logger.log(`🔄 ${doublonsDetectes} doublon(s) interne(s) détecté(s) et fusionné(s)`);
  }

  // Attacher l'index secondaire à la map pour la recherche cross-account
  // (réutilise l'index interne déjà construit pendant la détection de doublons)
  map._indexSecondaire = indexInterne;

  return map;
}

/**
 * Cherche un contact correspondant dans la map destination
 * Vérifie d'abord la clé primaire, puis cherche par TOUS les emails et téléphones
 * Retourne le contact trouvé ou null
 */
function chercherCorrespondant(contactSource, mapDestination) {
  // 1. Chercher par clé primaire (rapide)
  const clePrimaire = genererCleUnique(contactSource);
  if (clePrimaire && mapDestination.has(clePrimaire)) {
    return mapDestination.get(clePrimaire);
  }

  // 2. Chercher par toutes les clés secondaires (emails + téléphones)
  const index = mapDestination._indexSecondaire;
  if (!index) return null;

  const toutesCles = genererToutesCles(contactSource);
  for (const cle of toutesCles) {
    if (index.has(cle)) {
      const clePrimaireTrouvee = index.get(cle);
      const contact = mapDestination.get(clePrimaireTrouvee);
      if (contact) {
        if (CONFIG.DEBUG_MODE) {
          const identifiant = contactSource.email || contactSource.telephone || contactSource.nom;
          Logger.log(`  🔗 Correspondance trouvée par clé secondaire "${cle}" pour: ${identifiant}`);
        }
        return contact;
      }
    }
  }

  return null;
}

/**
 * Fusionne deux objets contact en un seul
 * Combine toutes les informations disponibles
 */
function fusionnerDeuxContacts(contact1, contact2) {
  // Utiliser le plus récent comme base
  const base = contact1.derniereModif > contact2.derniereModif ? contact1 : contact2;
  const autre = contact1.derniereModif > contact2.derniereModif ? contact2 : contact1;
  
  // Créer un objet fusionné
  const fusionne = {
    id: base.id,
    resourceName: base.resourceName,
    nom: base.nom.length >= autre.nom.length ? base.nom : autre.nom,
    prenom: base.prenom.length >= autre.prenom.length ? base.prenom : autre.prenom,
    nomFamille: base.nomFamille.length >= autre.nomFamille.length ? base.nomFamille : autre.nomFamille,
    entreprise: base.entreprise || autre.entreprise,
    poste: base.poste || autre.poste,
    email: base.email || autre.email,
    telephone: base.telephone || autre.telephone,
    adresse: base.adresse || autre.adresse,
    derniereModif: base.derniereModif > autre.derniereModif ? base.derniereModif : autre.derniereModif,
    contactOriginal: base.contactOriginal,

    // Fusionner les listes
    tousLesEmails: [...(base.tousLesEmails || [])],
    tousLesTelephones: [...(base.tousLesTelephones || [])],
    toutesLesAdresses: [...(base.toutesLesAdresses || [])],
    toutesLesOrganisations: [...(base.toutesLesOrganisations || [])],

    // Combiner les notes (nettoyage des anciens marqueurs [SYNC])
    notes: nettoyerMarqueursSyncNotes(base.notes) || (base.notes || '').trim() || '',

    // Photo : garder celle qui existe
    photoUrl: base.photoUrl || autre.photoUrl
  };

  // Ajouter les organisations de l'autre contact (sans doublons)
  if (autre.toutesLesOrganisations) {
    autre.toutesLesOrganisations.forEach(org => {
      if (!org.nom || org.nom.trim() === '') return;
      const nomLower = org.nom.toLowerCase().trim();
      const dejaPresente = fusionne.toutesLesOrganisations.some(o =>
        (o.nom || '').toLowerCase().trim() === nomLower
      );
      if (!dejaPresente) {
        fusionne.toutesLesOrganisations.push(org);
      }
    });
  }
  
  // Ajouter les emails de l'autre contact (sans doublons)
  if (autre.tousLesEmails) {
    autre.tousLesEmails.forEach(email => {
      const emailLower = email.adresse.toLowerCase();
      const dejaPresent = fusionne.tousLesEmails.some(e => 
        e.adresse.toLowerCase() === emailLower
      );
      if (!dejaPresent) {
        fusionne.tousLesEmails.push(email);
      }
    });
  }
  
  // Ajouter les téléphones de l'autre contact (sans doublons)
  if (autre.tousLesTelephones) {
    autre.tousLesTelephones.forEach(tel => {
      const telNormalise = normaliserTelephone(tel.numero);
      if (telNormalise) {
        const dejaPresent = fusionne.tousLesTelephones.some(t => 
          normaliserTelephone(t.numero) === telNormalise
        );
        if (!dejaPresent) {
          fusionne.tousLesTelephones.push(tel);
        }
      }
    });
  }
  
  // Ajouter les adresses de l'autre contact (sans doublons)
  if (autre.toutesLesAdresses) {
    autre.toutesLesAdresses.forEach(adresse => {
      const adresseNormalisee = normaliserAdresse(adresse.adresse);
      const dejaPresente = fusionne.toutesLesAdresses.some(a => 
        normaliserAdresse(a.adresse) === adresseNormalisee
      );
      if (!dejaPresente) {
        fusionne.toutesLesAdresses.push(adresse);
      }
    });
  }
  
  // Combiner les notes (nettoyage des anciens marqueurs [SYNC])
  const autreNotesClean = nettoyerMarqueursSyncNotes(autre.notes) || (autre.notes || '').trim();
  if (autreNotesClean && autreNotesClean !== '' && !fusionne.notes.includes(autreNotesClean)) {
    if (fusionne.notes) {
      fusionne.notes += '\n---\n' + autreNotesClean;
    } else {
      fusionne.notes = autreNotesClean;
    }
  }

  // Anniversaire : garder celui qui existe
  fusionne.anniversaire = base.anniversaire || autre.anniversaire;

  // Champs supplémentaires : fusionner (union sans doublons)
  const champsSupBase = base.champsSupplementaires || {};
  const champsSupAutre = autre.champsSupplementaires || {};
  const tousLesChamps = new Set([...Object.keys(champsSupBase), ...Object.keys(champsSupAutre)]);
  if (tousLesChamps.size > 0) {
    fusionne.champsSupplementaires = {};
    tousLesChamps.forEach(champ => {
      if (champsSupBase[champ] && champsSupAutre[champ]) {
        fusionne.champsSupplementaires[champ] = fusionnerChampsGenerique(champsSupBase[champ], champsSupAutre[champ]) || champsSupBase[champ];
      } else {
        fusionne.champsSupplementaires[champ] = champsSupBase[champ] || champsSupAutre[champ];
      }
    });
  }

  return fusionne;
}

/**
 * ANCIENNE FONCTION - Conservée pour compatibilité
 * Utilise maintenant creerMapParCleUnique en interne
 */
function creerMapParEmail(contacts, simulationMode, estLocal) {
  return creerMapParCleUnique(contacts, simulationMode, estLocal);
}

/**
 * Envoie un rapport de synchronisation
 */
function envoyerRapportBidirectionnel(stats) {
  const compte = Session.getActiveUser().getEmail();
  const sujet = `✅ Sync contacts terminée [${compte}]`;

  const corps = `
Rapport de Synchronisation Bidirectionnelle
==========================================
Compte: ${compte}
Date: ${new Date().toLocaleString('fr-FR')}

📊 Statistiques:
- Total contacts traités: ${stats.total}
- Contacts ajoutés: ${stats.ajoutes}
- Contacts modifiés: ${stats.modifies}

🔄 Sens de synchronisation: Bidirectionnel
📅 Prochaine synchronisation: Automatique selon planning

💡 Les contacts sont maintenant synchronisés entre vos deux comptes Gmail.
  `;

  envoyerRapport(sujet, corps);
}

// ============================================
// CONFIGURATION DU DÉCLENCHEUR
// ============================================

function configurerDeclencheurBidirectionnel() {
  // Supprimer les anciens déclencheurs
  const declencheurs = ScriptApp.getProjectTriggers();
  declencheurs.forEach(d => ScriptApp.deleteTrigger(d));
  
  // Créer un nouveau déclencheur quotidien
  ScriptApp.newTrigger('synchroniserContactsBidirectionnel')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  
  Logger.log('✅ Déclencheur bidirectionnel configuré');
  
  envoyerRapport(
    `✅ Sync activée [${Session.getActiveUser().getEmail()}]`,
    `Compte: ${Session.getActiveUser().getEmail()}\nLa synchronisation bidirectionnelle de vos contacts s'exécutera automatiquement chaque jour à 2h.`
  );
}

// ============================================
// SOLUTION ALTERNATIVE: VIA GOOGLE DRIVE
// ============================================

/**
 * MÉTHODE ALTERNATIVE RECOMMANDÉE
 * 
 * Cette méthode utilise Google Drive comme point de synchronisation
 * central entre les deux comptes.
 * 
 * Principe:
 * 1. Chaque compte exporte ses contacts vers un fichier Drive partagé
 * 2. Chaque compte lit le fichier de l'autre et importe les différences
 * 
 * Avantages:
 * - Pas besoin d'OAuth complexe
 * - Fonctionne avec deux scripts simples (un par compte)
 * - Totalement gratuit
 */

/**
 * Liste tous les groupes de contacts du compte courant
 * Retourne un tableau { resourceName, name, groupType }
 */
function listerGroupesContacts() {
  const groupes = [];
  let pageToken = null;

  do {
    const params = { pageSize: 1000, groupFields: 'name,groupType' };
    if (pageToken) params.pageToken = pageToken;

    const response = appelAvecRetry(
      () => People.ContactGroups.list(params),
      'listerGroupes'
    );

    if (response.contactGroups) {
      response.contactGroups.forEach(g => {
        groupes.push({
          resourceName: g.resourceName,
          name: g.name || '',
          groupType: (g.groupType || 'SYSTEM_CONTACT_GROUP')
        });
      });
    }
    pageToken = response.nextPageToken;
  } while (pageToken);

  Logger.log(`📁 ${groupes.length} groupes de contacts trouvés`);
  return groupes;
}

/**
 * Construit un mapping des groupes source → groupes locaux (par nom)
 * Crée les groupes manquants sur le compte local
 * Retourne une Map: sourceResourceName → localResourceName
 */
function construireMappingGroupes(groupesSource) {
  if (!groupesSource || groupesSource.length === 0) return new Map();

  // Lister les groupes locaux
  const groupesLocaux = listerGroupesContacts();
  const mapLocauxParNom = new Map();
  groupesLocaux.forEach(g => mapLocauxParNom.set(g.name.toLowerCase(), g.resourceName));

  const mapping = new Map();

  groupesSource.forEach(gs => {
    const nomLower = (gs.name || '').toLowerCase();

    if (mapLocauxParNom.has(nomLower)) {
      // Le groupe existe localement → mapper directement
      mapping.set(gs.resourceName, mapLocauxParNom.get(nomLower));
    } else if (gs.groupType === 'USER_CONTACT_GROUP' && gs.name) {
      // Groupe utilisateur absent → le créer
      try {
        const nouveau = appelAvecRetry(
          () => People.ContactGroups.create({ contactGroup: { name: gs.name } }),
          `creerGroupe(${gs.name})`
        );
        mapping.set(gs.resourceName, nouveau.resourceName);
        Logger.log(`📁 Groupe créé: "${gs.name}" → ${nouveau.resourceName}`);
      } catch (e) {
        if (e.message && e.message.includes('409')) {
          // Doublon — le groupe a été créé entre-temps, relister
          Logger.log(`⚠️ Groupe "${gs.name}" déjà existant (409), relecture...`);
          const reliste = listerGroupesContacts();
          reliste.forEach(g => {
            if (g.name.toLowerCase() === nomLower) {
              mapping.set(gs.resourceName, g.resourceName);
            }
          });
        } else {
          Logger.log(`⚠️ Impossible de créer le groupe "${gs.name}": ${e.message}`);
        }
      }
    } else {
      // Groupe système non trouvé localement par nom → ignorer
      Logger.log(`📁 Groupe "${gs.name}" (${gs.resourceName}, ${gs.groupType}) non mappé — pas de correspondance locale`);
    }
  });

  Logger.log(`📁 Mapping groupes: ${mapping.size} groupe(s) mappé(s)`);
  return mapping;
}

/**
 * Traduit les memberships d'un contact en utilisant le mapping de groupes
 * Remplace les resourceName source par les resourceName locaux
 */
function traduireMemberships(contacts, mappingGroupes) {
  if (!mappingGroupes || mappingGroupes.size === 0) {
    // Pas de mapping disponible → supprimer TOUS les memberships des contacts importés
    // pour éviter les erreurs "not found" avec des IDs de groupes de l'autre compte
    let nettoyees = 0;
    contacts.forEach(contact => {
      if (contact.champsSupplementaires && contact.champsSupplementaires.memberships) {
        delete contact.champsSupplementaires.memberships;
        nettoyees++;
      }
    });
    if (nettoyees > 0) {
      Logger.log(`📁 Aucun mapping de groupes — ${nettoyees} membership(s) supprimé(s) (l'autre compte n'exporte pas encore les groupes)`);
    }
    return;
  }

  let traduits = 0;
  let supprimes = 0;

  contacts.forEach(contact => {
    if (!contact.champsSupplementaires || !contact.champsSupplementaires.memberships) return;

    const membershipsOriginaux = contact.champsSupplementaires.memberships;
    const membershipsTraduits = [];

    membershipsOriginaux.forEach(m => {
      const cgm = m.contactGroupMembership;
      if (!cgm || !cgm.contactGroupResourceName) return;

      const sourceRN = cgm.contactGroupResourceName;
      if (mappingGroupes.has(sourceRN)) {
        // Traduire l'ID du groupe
        membershipsTraduits.push({
          contactGroupMembership: {
            contactGroupResourceName: mappingGroupes.get(sourceRN)
          }
        });
        traduits++;
      } else {
        // Groupe non mappable (groupe système inconnu, etc.) → ignorer
        supprimes++;
      }
    });

    if (membershipsTraduits.length > 0) {
      contact.champsSupplementaires.memberships = membershipsTraduits;
    } else {
      delete contact.champsSupplementaires.memberships;
    }
  });

  if (CONFIG.DEBUG_MODE) {
    Logger.log(`📁 Memberships: ${traduits} traduit(s), ${supprimes} ignoré(s) (groupe non trouvé)`);
  }
}

function exporterContactsVersDrive() {
  const contacts = getContactsFromPrimary();
  // Exclure contactOriginal (objet Person API volumineux) de la sérialisation
  const contactsSerializables = contacts.map(c => {
    const { contactOriginal, ...reste } = c;
    return reste;
  });

  // Exporter aussi les groupes de contacts pour le mapping
  const groupes = listerGroupesContacts();

  const data = JSON.stringify({
    version: 2,
    contacts: contactsSerializables,
    groupes: groupes
  });

  // Créer ou mettre à jour le fichier dans Drive
  const nomFichier = `contacts_${Session.getActiveUser().getEmail()}.json`;

  const files = DriveApp.getFilesByName(nomFichier);
  let file;

  if (files.hasNext()) {
    file = files.next();
    file.setContent(data);
  } else {
    file = DriveApp.createFile(nomFichier, data, MimeType.PLAIN_TEXT);
  }

  Logger.log(`✅ Contacts (${contactsSerializables.length}) et groupes (${groupes.length}) exportés vers: ${nomFichier}`);
  return file.getId();
}

/**
 * Importe les contacts depuis le fichier Drive de l'autre compte
 * Gère les deux formats : v1 (tableau brut) et v2 (objet avec groupes)
 * Retourne { contacts: [...], groupes: [...] }
 */
function importerContactsDepuisDrive(emailAutreCompte) {
  const nomFichier = `contacts_${emailAutreCompte}.json`;

  try {
    const files = DriveApp.getFilesByName(nomFichier);

    if (!files.hasNext()) {
      Logger.log(`⚠️ Fichier non trouvé: ${nomFichier}`);
      return { contacts: [], groupes: [] };
    }

    const file = files.next();
    const content = file.getBlob().getDataAsString();
    const parsed = JSON.parse(content);

    // Compatibilité : ancien format (tableau brut) vs nouveau format (objet v2)
    if (Array.isArray(parsed)) {
      Logger.log(`✅ ${parsed.length} contacts importés depuis: ${nomFichier} (format v1, sans groupes)`);
      return { contacts: parsed, groupes: [] };
    }

    const contacts = parsed.contacts || [];
    const groupes = parsed.groupes || [];
    Logger.log(`✅ ${contacts.length} contacts et ${groupes.length} groupes importés depuis: ${nomFichier} (format v2)`);
    return { contacts, groupes };

  } catch (error) {
    Logger.log(`❌ Erreur import: ${error.toString()}`);
    return { contacts: [], groupes: [] };
  }
}

/**
 * Synchronisation complète via Google Drive
 * À exécuter sur LES DEUX comptes
 */
function syncViaGoogleDrive() {
  Logger.log('=== SYNC VIA GOOGLE DRIVE ===');

  // Vérifier que le compte secondaire est configuré
  if (!CONFIG.COMPTE_SECONDAIRE || CONFIG.COMPTE_SECONDAIRE === 'votre-email-secondaire@gmail.com') {
    throw new Error('❌ COMPTE_SECONDAIRE non configuré. Exécutez configurerCompte() ou ajoutez la propriété dans Paramètres du projet → Propriétés du script.');
  }

  // 0. SAUVEGARDE DE SÉCURITÉ avant toute modification
  creerSauvegardeSecurite();
  
  // 1. Exporter mes contacts
  exporterContactsVersDrive();
  
  // 2. Importer les contacts de l'autre compte
  const importResult = importerContactsDepuisDrive(CONFIG.COMPTE_SECONDAIRE);
  const contactsAutreCompte = importResult.contacts;
  const groupesAutreCompte = importResult.groupes;

  if (contactsAutreCompte.length === 0) {
    Logger.log('⚠️ Aucun contact à importer');
    return;
  }

  // 2b. Mapper les groupes de contacts (créer les manquants, traduire les IDs)
  const mappingGroupes = construireMappingGroupes(groupesAutreCompte);
  traduireMemberships(contactsAutreCompte, mappingGroupes);

  // 3. Fusionner
  const mesContacts = getContactsFromPrimary();
  const mapMesContacts = creerMapParEmail(mesContacts, false, true);
  const mapAutres = creerMapParEmail(contactsAutreCompte, false, false);

  const stats = syncDirection(mapAutres, mapMesContacts, 'drive->local');
  
  const erreurs = stats.erreurs || 0;
  const interrompu = stats.interrompu || false;
  const ignores = stats.ignores || 0;
  const sautes = stats.sautes || 0;
  const duree = Math.round((new Date() - DEBUT_EXECUTION) / 1000);
  Logger.log(`${interrompu ? '⏱️' : '✅'} Sync terminée en ${duree}s: ${stats.ajoutes} ajoutés, ${stats.modifies} modifiés, ${ignores} déjà à jour, ${sautes} sautés (run précédent)` + (erreurs > 0 ? `, ${erreurs} erreur(s)` : '') + (interrompu ? ' (INTERROMPU — la progression est sauvegardée)' : ''));

  // 4. Rapport
  const compte = Session.getActiveUser().getEmail();
  let rapport = `Compte: ${compte}\nContacts synchronisés via Google Drive (${duree}s):\n- Ajoutés: ${stats.ajoutes}\n- Modifiés: ${stats.modifies}\n- Déjà à jour: ${ignores}\n- Sautés (traités au run précédent): ${sautes}`;
  if (erreurs > 0) {
    rapport += `\n- Erreurs: ${erreurs} (voir les logs pour détails)`;
  }
  if (interrompu) {
    rapport += `\n\n⏱️ INTERROMPU : limite de ${CONFIG.COMPTE_PRO ? '28' : '5'} min atteinte. La progression est sauvegardée, les contacts restants seront traités à la prochaine exécution.`;
  }

  let sujet = `✅ Sync Drive terminée [${compte}]`;
  if (interrompu) sujet = `⏱️ Sync Drive partielle [${compte}]`;
  else if (erreurs > 0) sujet = `⚠️ Sync Drive avec erreurs [${compte}]`;

  envoyerRapport(sujet, rapport);
}

function configurerSyncDrive() {
  // Supprimer anciens déclencheurs
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  
  // Nouveau déclencheur
  ScriptApp.newTrigger('syncViaGoogleDrive')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();
  
  Logger.log('✅ Sync Drive configurée');
}

// ============================================
// FONCTIONS DE SÉCURITÉ ET SAUVEGARDE
// ============================================

/**
 * Crée une sauvegarde de sécurité avant synchronisation
 * Ne crée qu'UNE sauvegarde par jour (même si le script tourne toutes les heures)
 * Conserve les 7 dernières sauvegardes (= 7 jours d'historique)
 */
function creerSauvegardeSecurite() {
  try {
    const dossierBackup = obtenirOuCreerDossierBackup();

    // Vérifier si une sauvegarde a déjà été créée aujourd'hui
    const aujourdhui = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const fichiers = dossierBackup.getFiles();
    while (fichiers.hasNext()) {
      const f = fichiers.next();
      if (f.getName().startsWith('BACKUP_contacts_') && f.getName().includes(aujourdhui)) {
        Logger.log(`📦 Sauvegarde du jour déjà existante: ${f.getName()} — ignorée`);
        return;
      }
    }

    const contacts = getContactsFromPrimary();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nomFichier = `BACKUP_contacts_${timestamp}.json`;

    // Exclure contactOriginal de la sérialisation
    const contactsSerializables = contacts.map(c => {
      const { contactOriginal, ...reste } = c;
      return reste;
    });
    const data = JSON.stringify(contactsSerializables, null, 2);
    dossierBackup.createFile(nomFichier, data, MimeType.PLAIN_TEXT);
    
    Logger.log(`✅ Sauvegarde créée: ${nomFichier}`);
    
    // Nettoyer les vieilles sauvegardes (garder seulement les 7 dernières)
    nettoyerViesSauvegardes(dossierBackup, 7);
    
  } catch (error) {
    Logger.log(`⚠️ Erreur sauvegarde: ${error.toString()}`);
    // On continue quand même la synchro, mais on log l'erreur
  }
}

/**
 * Obtient ou crée le dossier de sauvegarde dans Drive
 */
function obtenirOuCreerDossierBackup() {
  const nomDossier = 'ContactSync_Backups';
  const dossiers = DriveApp.getFoldersByName(nomDossier);
  
  if (dossiers.hasNext()) {
    return dossiers.next();
  } else {
    return DriveApp.createFolder(nomDossier);
  }
}

/**
 * Nettoie les vieilles sauvegardes, garde seulement les N dernières
 */
function nettoyerViesSauvegardes(dossier, nombreAGarder) {
  try {
    const fichiers = dossier.getFilesByName('BACKUP_contacts_');
    const listeFichiers = [];
    
    // Collecter tous les fichiers de backup
    while (fichiers.hasNext()) {
      const fichier = fichiers.next();
      if (fichier.getName().startsWith('BACKUP_contacts_')) {
        listeFichiers.push({
          fichier: fichier,
          date: fichier.getDateCreated()
        });
      }
    }
    
    // Trier par date (plus récent en premier)
    listeFichiers.sort((a, b) => b.date - a.date);
    
    // Supprimer les vieux backups
    for (let i = nombreAGarder; i < listeFichiers.length; i++) {
      Logger.log(`🗑️ Suppression vieille sauvegarde: ${listeFichiers[i].fichier.getName()}`);
      listeFichiers[i].fichier.setTrashed(true);
    }
    
  } catch (error) {
    Logger.log(`⚠️ Erreur nettoyage: ${error.toString()}`);
  }
}

/**
 * FONCTION D'URGENCE: Restaurer depuis une sauvegarde
 * À utiliser UNIQUEMENT si la synchronisation a causé des problèmes
 */
function restaurerDepuisSauvegarde() {
  const dossier = obtenirOuCreerDossierBackup();
  const fichiers = dossier.getFiles();
  const listeFichiers = [];
  
  // Lister les sauvegardes disponibles
  while (fichiers.hasNext()) {
    const fichier = fichiers.next();
    if (fichier.getName().startsWith('BACKUP_contacts_')) {
      listeFichiers.push({
        nom: fichier.getName(),
        date: fichier.getDateCreated(),
        fichier: fichier
      });
    }
  }
  
  if (listeFichiers.length === 0) {
    Logger.log('❌ Aucune sauvegarde trouvée');
    return;
  }
  
  // Trier par date (plus récent en premier)
  listeFichiers.sort((a, b) => b.date - a.date);
  
  // Afficher les sauvegardes disponibles
  Logger.log('📋 Sauvegardes disponibles:');
  listeFichiers.forEach((item, index) => {
    Logger.log(`${index + 1}. ${item.nom} - ${item.date.toLocaleString('fr-FR')}`);
  });
  
  // Pour restaurer la plus récente automatiquement:
  const sauvegardeRecente = listeFichiers[0];
  Logger.log(`\n⚠️ RESTAURATION DE: ${sauvegardeRecente.nom}`);
  
  // Lire les contacts de la sauvegarde
  const content = sauvegardeRecente.fichier.getBlob().getDataAsString();
  const contactsSauvegardes = JSON.parse(content);
  
  Logger.log(`📦 ${contactsSauvegardes.length} contacts dans la sauvegarde`);
  
  // IMPORTANT: Cette fonction affiche seulement les infos
  // Pour vraiment restaurer, il faudrait recréer les contacts
  // Ce qui est un processus délicat à faire manuellement
  
  envoyerRapport(
    `⚠️ Restauration disponible [${Session.getActiveUser().getEmail()}]`,
    `Compte: ${Session.getActiveUser().getEmail()}\nUne sauvegarde de ${contactsSauvegardes.length} contacts est disponible.\n\nDate: ${sauvegardeRecente.date.toLocaleString('fr-FR')}\n\nConsultez les logs pour plus de détails.`
  );
  
  return contactsSauvegardes;
}

/**
 * Validation des données avant synchronisation
 * Version améliorée qui accepte les contacts avec téléphone mais sans email
 */
function validerContacts(contacts) {
  const erreurs = [];
  const avertissements = [];
  let contactsAvecEmail = 0;
  let contactsAvecTelUniquement = 0;
  let contactsAvecNomUniquement = 0;
  let contactsSansIdentifiant = 0;
  
  contacts.forEach((contact, index) => {
    const aEmail = contact.email && contact.email.trim() !== '';
    const aTelephone = contact.telephone && contact.telephone.trim() !== '';
    const aNom = contact.nom && contact.nom.trim() !== '';
    const aEntreprise = contact.entreprise && contact.entreprise.trim() !== '';

    // ERREUR: Ni email, ni téléphone, ni nom, ni entreprise
    if (!aEmail && !aTelephone && !aNom && !aEntreprise) {
      erreurs.push(`Contact ${index + 1} "${contact.nom || 'Sans nom'}": Pas d'identifiant valide`);
      contactsSansIdentifiant++;
      return;
    }
    
    // VALIDE: Email
    if (aEmail) {
      contactsAvecEmail++;
      // Vérifier format email basique
      if (!contact.email.includes('@')) {
        erreurs.push(`Contact ${index + 1} "${contact.nom}": Email invalide - ${contact.email}`);
      }
    }
    
    // VALIDE: Téléphone uniquement
    if (!aEmail && aTelephone) {
      contactsAvecTelUniquement++;
      const telNormalise = normaliserTelephone(contact.telephone);
      if (!telNormalise) {
        avertissements.push(`Contact ${index + 1} "${contact.nom}": Téléphone invalide - ${contact.telephone}`);
      }
    }

    // VALIDE: Nom uniquement (ex: anniversaires d'enfants)
    if (!aEmail && !aTelephone && (aNom || aEntreprise)) {
      contactsAvecNomUniquement++;
    }
  });

  // Afficher les statistiques
  Logger.log('📊 STATISTIQUES DE VALIDATION:');
  Logger.log(`  ✅ Contacts avec email: ${contactsAvecEmail}`);
  Logger.log(`  📱 Contacts avec téléphone uniquement: ${contactsAvecTelUniquement}`);
  Logger.log(`  👤 Contacts avec nom uniquement: ${contactsAvecNomUniquement}`);
  Logger.log(`  ❌ Contacts sans identifiant: ${contactsSansIdentifiant}`);
  
  if (erreurs.length > 0) {
    Logger.log('\n⚠️ ERREURS DE VALIDATION:');
    erreurs.forEach(err => Logger.log(`  - ${err}`));
  }
  
  if (avertissements.length > 0) {
    Logger.log('\n⚠️ AVERTISSEMENTS:');
    avertissements.forEach(warn => Logger.log(`  - ${warn}`));
  }
  
  // Validation réussie si pas d'erreurs (les avertissements sont OK)
  return erreurs.length === 0;
}

/**
 * Mode simulation (dry-run): voir ce qui serait fait sans rien changer
 */
function simulerSynchronisation() {
  Logger.log('=== MODE SIMULATION (AUCUNE MODIFICATION) ===');
  
  const mesContacts = getContactsFromPrimary();
  const importResult = importerContactsDepuisDrive(CONFIG.COMPTE_SECONDAIRE);
  const contactsAutreCompte = importResult.contacts;

  if (contactsAutreCompte.length === 0) {
    Logger.log('⚠️ Aucun contact à importer');
    return;
  }

  // Validation des contacts
  Logger.log('\n📋 Validation des contacts locaux:');
  validerContacts(mesContacts);

  Logger.log('\n📋 Validation des contacts distants:');
  validerContacts(contactsAutreCompte);
  
  const mapMesContacts = creerMapParCleUnique(mesContacts, true, true);
  const mapAutres = creerMapParCleUnique(contactsAutreCompte, true, false);
  
  let ajouts = 0;
  let modifications = 0;
  let contactsAvecEmailAjoutes = 0;
  let contactsAvecTelAjoutes = 0;
  let contactsAvecNomAjoutes = 0;

  // Simuler les ajouts et modifications
  mapAutres.forEach((contact, cle) => {
    const identifiant = contact.email || contact.telephone || contact.nom;

    if (!mapMesContacts.has(cle)) {
      const type = cle.startsWith('email:') ? '📧' : cle.startsWith('phone:') ? '📱' : cle.startsWith('org:') ? '🏢' : '👤';
      Logger.log(`[SIMULATION] ${type} Ajouterait: ${identifiant} - ${contact.nom}`);
      ajouts++;

      if (contact.email) {
        contactsAvecEmailAjoutes++;
      } else if (contact.telephone) {
        contactsAvecTelAjoutes++;
      } else {
        contactsAvecNomAjoutes++;
      }
    } else {
      const monContact = mapMesContacts.get(cle);
      if (contact.derniereModif > monContact.derniereModif) {
        Logger.log(`[SIMULATION] ✏️ Modifierait: ${identifiant}`);
        modifications++;
      }
    }
  });
  
  Logger.log(`\n=== RÉSUMÉ SIMULATION ===`);
  Logger.log(`Ajouts prévus: ${ajouts}`);
  Logger.log(`  - Avec email: ${contactsAvecEmailAjoutes}`);
  Logger.log(`  - Avec téléphone uniquement: ${contactsAvecTelAjoutes}`);
  Logger.log(`  - Avec nom uniquement: ${contactsAvecNomAjoutes}`);
  Logger.log(`Modifications prévues: ${modifications}`);
  Logger.log(`Total contacts actuels: ${mesContacts.length}`);
  Logger.log(`Total après synchro: ${mesContacts.length + ajouts}`);

  envoyerRapport(
    `🔍 Simulation [${Session.getActiveUser().getEmail()}]`,
    `Compte: ${Session.getActiveUser().getEmail()}\nMode simulation (aucune modification réelle):\n\n` +
    `AJOUTS PRÉVUS: ${ajouts}\n` +
    `  • Contacts avec email: ${contactsAvecEmailAjoutes}\n` +
    `  • Contacts avec téléphone uniquement: ${contactsAvecTelAjoutes}\n` +
    `  • Contacts avec nom uniquement: ${contactsAvecNomAjoutes}\n\n` +
    `MODIFICATIONS PRÉVUES: ${modifications}\n\n` +
    `Total actuel: ${mesContacts.length}\n` +
    `Total après sync: ${mesContacts.length + ajouts}\n\n` +
    `Consultez les logs pour le détail complet.`
  );
}
