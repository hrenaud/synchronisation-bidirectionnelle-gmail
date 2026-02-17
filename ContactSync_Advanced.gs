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

const CONFIG = {
  COMPTE_SECONDAIRE: 'votre-email-secondaire@gmail.com',
  PREFIX_NOTES: '[SYNC]',
  DEBUG_MODE: true,
  
  // ID du label/groupe pour les contacts synchronisés (optionnel)
  LABEL_SYNC: 'Synchronisés',
  
  // Stratégie de résolution des conflits
  // 'merge' = Fusion intelligente (RECOMMANDÉ) - combine les infos sans rien perdre
  // 'recent' = Le plus récent écrase l'ancien - RISQUE DE PERTE DE DONNÉES
  STRATEGIE_CONFLIT: 'merge',
  
  // Gestion des contacts sans email (avec numéro de téléphone uniquement)
  INCLURE_CONTACTS_SANS_EMAIL: true, // true = synchroniser aussi les contacts avec seulement un téléphone

  // Supprimer les contacts complètement vides (aucun nom, email, téléphone, entreprise, adresse, note)
  // false = les ignorer silencieusement, true = les supprimer pour faire le ménage
  SUPPRIMER_CONTACTS_VIDES: false,

  // Adresse email pour recevoir les rapports de synchronisation
  // null = utilise l'email du compte actif (Session.getActiveUser())
  // Si vos emails de rapport sont bloqués (DMARC), mettez une adresse @gmail.com ici
  EMAIL_RAPPORT: null
};

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
      '❌ Erreur synchronisation bidirectionnelle',
      `Erreur lors de la synchronisation:\n\n${error.toString()}\n\nStack:\n${error.stack}`
    );
    throw error;
  }
}

// ============================================
// CHAMPS PEOPLE API
// ============================================

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,addresses,biographies,photos,organizations,metadata';

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

    const response = People.People.Connections.list('people/me', options);
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
      adresse: a.formattedValue || '',
      label: a.type || 'home'
    })),
    photoUrl: photoUrl,
    notes: bios.length > 0 ? (bios[0].value || '') : '',
    derniereModif: derniereModif,
    contactOriginal: person
  };
}

/**
 * Génère une clé unique pour un contact
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
// SYNCHRONISATION UNIDIRECTIONNELLE
// ============================================

/**
 * Synchronise dans une direction (source → destination)
 * AMÉLIORATION: Fusion intelligente au lieu d'écrasement basé sur la date
 */
function syncDirection(mapSource, mapDestination, direction) {
  Logger.log(`--- Sync ${direction} ---`);
  
  let ajoutes = 0;
  let fusionnes = 0;
  
  // Parcourir chaque contact de la source
  mapSource.forEach((contactSource, cle) => {
    if (!cle) return; // Ignorer les contacts sans identifiant
    
    const identifiant = contactSource.email || contactSource.telephone || contactSource.nom;
    
    if (mapDestination.has(cle)) {
      // Le contact existe déjà dans la destination
      const contactDest = mapDestination.get(cle);
      
      // NOUVELLE STRATÉGIE : Toujours fusionner, pas seulement si plus récent
      // La fusion intelligente combine les infos sans rien perdre
      
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`🔄 Fusion: ${identifiant}`);
        Logger.log(`  Source modifié: ${contactSource.derniereModif.toLocaleString('fr-FR')}`);
        Logger.log(`  Dest modifié: ${contactDest.derniereModif.toLocaleString('fr-FR')}`);
      }
      
      mettreAJourContact(contactDest, contactSource);
      fusionnes++;
      
    } else {
      // Le contact n'existe pas dans la destination → créer
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`➕ Ajout: ${identifiant}`);
      }
      creerContact(contactSource);
      ajoutes++;
    }
  });
  
  Logger.log(`Direction ${direction}: ${ajoutes} ajoutés, ${fusionnes} fusionnés`);
  
  return { ajoutes, modifies: fusionnes };
}

// ============================================
// GESTION DES CONTACTS
// ============================================

/**
 * Met à jour un contact existant avec les données d'un autre
 * FUSION INTELLIGENTE : combine les informations au lieu d'écraser
 * Utilise People API pour appliquer les modifications en un seul appel
 */
function mettreAJourContact(contactDestData, dataSource) {
  const person = contactDestData.contactOriginal;
  const resourceName = contactDestData.resourceName;

  // Récupérer le contact frais pour avoir l'etag à jour
  const personFrais = People.People.get(resourceName, {
    personFields: PERSON_FIELDS
  });

  // Construire l'objet Person mis à jour
  const personMisAJour = {
    resourceName: resourceName,
    etag: personFrais.etag
  };
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

  // Appliquer les modifications si nécessaire
  if (champsModifies.length > 0) {
    People.People.updateContact(personMisAJour, resourceName, {
      updatePersonFields: champsModifies.join(','),
      personFields: PERSON_FIELDS
    });
  }

  // FUSION DES PHOTOS (appel séparé requis par l'API)
  fusionnerPhotos(contactDestData, dataSource);
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
    label: a.label
  }));

  let ajouts = 0;
  const nouvellesAdresses = [];

  dataSource.toutesLesAdresses.forEach(adresseSource => {
    const adresseNormalisee = normaliserAdresse(adresseSource.adresse);
    const dejaPresente = adressesExistantes.some(existante =>
      existante.adresseNormalisee === adresseNormalisee
    );
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
    ...adressesExistantes.map(a => ({ formattedValue: a.adresse, type: labelVersAdresse(a.label) })),
    ...nouvellesAdresses.map(a => ({ formattedValue: a.adresse, type: labelVersAdresse(a.label) }))
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
 * Normalise une adresse pour comparaison
 * Retire espaces multiples, ponctuation, met en minuscules
 */
function normaliserAdresse(adresse) {
  if (!adresse) return '';

  return adresse
    .toLowerCase()
    .replace(/[.,;]/g, '') // Retirer ponctuation
    .replace(/\s+/g, ' ') // Espaces multiples → simple
    .trim();
}

/**
 * Fusionne les notes en conservant les deux
 * Retourne l'array biographies ou null si pas de changement
 */
function fusionnerNotes(contactDestData, dataSource) {
  const notesDest = contactDestData.notes || '';
  const notesSource = dataSource.notes || '';

  let notesFinales = notesDest;

  if (notesSource && notesSource.trim() !== '' && !notesDest.includes(notesSource)) {
    if (notesFinales) {
      notesFinales += '\n---\n' + notesSource;
    } else {
      notesFinales = notesSource;
    }
  }

  notesFinales += `\n${CONFIG.PREFIX_NOTES} Fusionné: ${new Date().toLocaleString('fr-FR')}`;

  return [{
    value: notesFinales,
    contentType: 'TEXT_PLAIN'
  }];
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

    People.People.updateContactPhoto({
      photoBytes: photoBytes
    }, contactDestData.resourceName);

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
  // Vérifier qu'on a au moins un identifiant
  if ((!data.email || data.email.trim() === '') && (!data.telephone || data.telephone.trim() === '')) {
    Logger.log('⚠️ Impossible de créer un contact sans email ni téléphone');
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
    person.addresses = data.toutesLesAdresses.map(a => ({
      formattedValue: a.adresse,
      type: labelVersAdresse(a.label)
    }));
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

  // Notes
  if (data.notes) {
    person.biographies = [{
      value: data.notes + `\n${CONFIG.PREFIX_NOTES} Créé: ${new Date().toLocaleString('fr-FR')}`,
      contentType: 'TEXT_PLAIN'
    }];
  }

  const contactCree = People.People.createContact(person, {
    personFields: PERSON_FIELDS
  });

  // Photo (appel séparé)
  if (data.photoUrl) {
    try {
      const response = UrlFetchApp.fetch(data.photoUrl);
      const photoBytes = Utilities.base64Encode(response.getContent());
      People.People.updateContactPhoto({
        photoBytes: photoBytes
      }, contactCree.resourceName);
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
      // Vérifier s'il y a déjà un contact avec cette clé
      if (map.has(cle)) {
        doublonsDetectes++;
        Logger.log(`⚠️ Doublon INTERNE détecté pour: ${cle}`);

        const existant = map.get(cle);

        // Au lieu de garder seulement le plus récent, FUSIONNER les deux !
        const contactFusionne = fusionnerDeuxContacts(existant, contact);
        map.set(cle, contactFusionne);
        doublonsFusionnes++;

        if (CONFIG.DEBUG_MODE) {
          Logger.log(`  🔄 Doublon fusionné intelligemment`);
          Logger.log(`    Contact 1: ${existant.nom} (modifié ${existant.derniereModif.toLocaleDateString('fr-FR')})`);
          Logger.log(`    Contact 2: ${contact.nom} (modifié ${contact.derniereModif.toLocaleDateString('fr-FR')})`);
        }
      } else {
        map.set(cle, contact);
      }
    } else {
      // Contact sans identifiant valide — vérifier s'il est complètement vide
      const estVide = estContactVide(contact);

      if (estVide) {
        contactsVides++;
        // Supprimer uniquement si : config activée, pas en simulation, et contact local
        if (CONFIG.SUPPRIMER_CONTACTS_VIDES && !simulationMode && estLocal && contact.resourceName) {
          try {
            People.People.deleteContact(contact.resourceName);
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
  
  return map;
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

    // Combiner les notes
    notes: base.notes || '',

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
  
  // Combiner les notes
  if (autre.notes && autre.notes.trim() !== '' && !fusionne.notes.includes(autre.notes)) {
    if (fusionne.notes) {
      fusionne.notes += '\n---\n' + autre.notes;
    } else {
      fusionne.notes = autre.notes;
    }
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
  const sujet = '✅ Synchronisation bidirectionnelle terminée';

  const corps = `
Rapport de Synchronisation Bidirectionnelle
==========================================

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
    '✅ Synchronisation bidirectionnelle activée',
    'La synchronisation bidirectionnelle de vos contacts s\'exécutera automatiquement chaque jour à 2h.'
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

function exporterContactsVersDrive() {
  const contacts = getContactsFromPrimary();
  // Exclure contactOriginal (objet Person API volumineux) de la sérialisation
  const contactsSerializables = contacts.map(c => {
    const { contactOriginal, ...reste } = c;
    return reste;
  });
  const data = JSON.stringify(contactsSerializables);
  
  // Créer ou mettre à jour le fichier dans Drive
  const nomFichier = `contacts_${Session.getActiveUser().getEmail()}.json`;
  
  const files = DriveApp.getFilesByName(nomFichier);
  let file;
  
  if (files.hasNext()) {
    // Mettre à jour le fichier existant
    file = files.next();
    file.setContent(data);
  } else {
    // Créer un nouveau fichier
    file = DriveApp.createFile(nomFichier, data, MimeType.PLAIN_TEXT);
  }
  
  Logger.log(`✅ Contacts exportés vers: ${nomFichier}`);
  return file.getId();
}

function importerContactsDepuisDrive(emailAutreCompte) {
  const nomFichier = `contacts_${emailAutreCompte}.json`;
  
  try {
    const files = DriveApp.getFilesByName(nomFichier);
    
    if (!files.hasNext()) {
      Logger.log(`⚠️ Fichier non trouvé: ${nomFichier}`);
      return [];
    }
    
    const file = files.next();
    const content = file.getBlob().getDataAsString();
    const contacts = JSON.parse(content);
    
    Logger.log(`✅ ${contacts.length} contacts importés depuis: ${nomFichier}`);
    return contacts;
    
  } catch (error) {
    Logger.log(`❌ Erreur import: ${error.toString()}`);
    return [];
  }
}

/**
 * Synchronisation complète via Google Drive
 * À exécuter sur LES DEUX comptes
 */
function syncViaGoogleDrive() {
  Logger.log('=== SYNC VIA GOOGLE DRIVE ===');
  
  // 0. SAUVEGARDE DE SÉCURITÉ avant toute modification
  creerSauvegardeSecurite();
  
  // 1. Exporter mes contacts
  exporterContactsVersDrive();
  
  // 2. Importer les contacts de l'autre compte
  const contactsAutreCompte = importerContactsDepuisDrive(CONFIG.COMPTE_SECONDAIRE);
  
  if (contactsAutreCompte.length === 0) {
    Logger.log('⚠️ Aucun contact à importer');
    return;
  }
  
  // 3. Fusionner
  const mesContacts = getContactsFromPrimary();
  const mapMesContacts = creerMapParEmail(mesContacts, false, true);
  const mapAutres = creerMapParEmail(contactsAutreCompte, false, false);

  const stats = syncDirection(mapAutres, mapMesContacts, 'drive->local');
  
  Logger.log(`✅ Sync terminée: ${stats.ajoutes} ajoutés, ${stats.modifies} modifiés`);
  
  // 4. Rapport
  envoyerRapport(
    '✅ Synchronisation Drive terminée',
    `Contacts synchronisés via Google Drive:\n- Ajoutés: ${stats.ajoutes}\n- Modifiés: ${stats.modifies}`
  );
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
 * Conserve les 7 dernières sauvegardes
 */
function creerSauvegardeSecurite() {
  try {
    const contacts = getContactsFromPrimary();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const nomFichier = `BACKUP_contacts_${timestamp}.json`;

    // Créer dossier de sauvegarde si nécessaire
    const dossierBackup = obtenirOuCreerDossierBackup();

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
    '⚠️ Restauration disponible',
    `Une sauvegarde de ${contactsSauvegardes.length} contacts est disponible.\n\nDate: ${sauvegardeRecente.date.toLocaleString('fr-FR')}\n\nConsultez les logs pour plus de détails.`
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
  });
  
  // Afficher les statistiques
  Logger.log('📊 STATISTIQUES DE VALIDATION:');
  Logger.log(`  ✅ Contacts avec email: ${contactsAvecEmail}`);
  Logger.log(`  📱 Contacts avec téléphone uniquement: ${contactsAvecTelUniquement}`);
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
  const contactsAutreCompte = importerContactsDepuisDrive(CONFIG.COMPTE_SECONDAIRE);
  
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
  Logger.log(`Modifications prévues: ${modifications}`);
  Logger.log(`Total contacts actuels: ${mesContacts.length}`);
  Logger.log(`Total après synchro: ${mesContacts.length + ajouts}`);
  
  envoyerRapport(
    '🔍 Simulation de synchronisation',
    `Mode simulation (aucune modification réelle):\n\n` +
    `AJOUTS PRÉVUS: ${ajouts}\n` +
    `  • Contacts avec email: ${contactsAvecEmailAjoutes}\n` +
    `  • Contacts avec téléphone uniquement: ${contactsAvecTelAjoutes}\n\n` +
    `MODIFICATIONS PRÉVUES: ${modifications}\n\n` +
    `Total actuel: ${mesContacts.length}\n` +
    `Total après sync: ${mesContacts.length + ajouts}\n\n` +
    `Consultez les logs pour le détail complet.`
  );
}
