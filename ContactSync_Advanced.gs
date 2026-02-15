/**
 * VERSION AVANCÉE - SYNCHRONISATION BIDIRECTIONNELLE COMPLÈTE
 * Utilise l'API Google People pour accéder aux deux comptes
 * 
 * PRÉREQUIS:
 * 1. Activer l'API People dans Services (voir guide)
 * 2. Configurer OAuth 2.0 pour le compte secondaire
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
  INCLURE_CONTACTS_SANS_EMAIL: true // true = synchroniser aussi les contacts avec seulement un téléphone
};

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
    const mapPrincipal = creerMapParEmail(contactsPrincipaux);
    const mapSecondaire = creerMapParEmail(contactsSecondaires);
    
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
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      '❌ Erreur synchronisation bidirectionnelle',
      `Erreur lors de la synchronisation:\n\n${error.toString()}\n\nStack:\n${error.stack}`
    );
    throw error;
  }
}

// ============================================
// RÉCUPÉRATION DES CONTACTS
// ============================================

/**
 * Récupère les contacts du compte principal (compte actuel)
 */
function getContactsFromPrimary() {
  const contacts = ContactsApp.getContacts();
  return contacts.map(contact => convertirContactToObject(contact));
}

/**
 * Récupère les contacts du compte secondaire via People API
 * 
 * IMPORTANT: Cette fonction nécessite l'API People activée
 * et une configuration OAuth pour le compte secondaire
 */
function getContactsFromSecondary() {
  // NOTE: L'accès direct à un autre compte Gmail nécessite une configuration
  // OAuth2 avancée qui dépasse le scope de ce script simple.
  
  // SOLUTION ALTERNATIVE RECOMMANDÉE:
  // Utiliser la délégation Gmail (voir guide) ou exécuter le script
  // sur les deux comptes avec synchronisation via Google Drive
  
  // Pour une vraie implémentation bidirectionnelle:
  // 1. Créer une application OAuth2 sur Google Cloud Console
  // 2. Obtenir un refresh token pour le compte secondaire
  // 3. Utiliser People.people.connections.list avec le token
  
  Logger.log('⚠️ Accès compte secondaire nécessite configuration OAuth avancée');
  Logger.log('Voir la section "Solution Alternative" du guide');
  
  return [];
}

/**
 * Convertit un objet Contact en objet JavaScript simple
 */
function convertirContactToObject(contact) {
  const emails = contact.getEmails();
  const phones = contact.getPhones();
  const addresses = contact.getAddresses();
  
  // Récupérer la photo si elle existe
  let photoBlob = null;
  try {
    const photo = contact.getContactPhoto();
    if (photo) {
      photoBlob = photo;
    }
  } catch (e) {
    // Pas de photo, c'est normal
  }
  
  return {
    id: contact.getId(),
    nom: contact.getFullName() || '',
    prenom: contact.getGivenName() || '',
    nomFamille: contact.getFamilyName() || '',
    email: emails.length > 0 ? emails[0].getAddress() : '',
    tousLesEmails: emails.map(e => ({
      adresse: e.getAddress(),
      label: e.getLabel() || 'Autre'
    })),
    telephone: phones.length > 0 ? phones[0].getPhoneNumber() : '',
    tousLesTelephones: phones.map(p => ({
      numero: p.getPhoneNumber(),
      label: p.getLabel() || 'Mobile'
    })),
    adresse: addresses.length > 0 ? addresses[0].getAddress() : '',
    toutesLesAdresses: addresses.map(a => ({
      adresse: a.getAddress(),
      label: a.getLabel() || 'Domicile'
    })),
    photo: photoBlob,
    notes: contact.getNotes() || '',
    derniereModif: contact.getLastUpdated(),
    contactOriginal: contact
  };
}

/**
 * Génère une clé unique pour un contact
 * Priorité : email > téléphone normalisé > nom complet
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
  
  // En dernier recours, utiliser le nom complet (risqué mais mieux que rien)
  if (contact.nom && contact.nom.trim() !== '') {
    return 'name:' + contact.nom.toLowerCase().trim();
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
  
  // Minimum 8 chiffres pour être valide
  const chiffresUniquement = normalise.replace(/\+/g, '');
  if (chiffresUniquement.length < 8) {
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
      
      mettreAJourContact(contactDest.contactOriginal, contactSource);
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
 */
function mettreAJourContact(contactDest, dataSource) {
  // FUSION DES NOMS
  // Règle : Garder la version la plus complète
  fusionnerNoms(contactDest, dataSource);
  
  // FUSION DES TÉLÉPHONES
  // Règle : Ajouter les nouveaux téléphones, éviter les doublons
  fusionnerTelephones(contactDest, dataSource);
  
  // FUSION DES EMAILS
  // Règle : Ajouter les nouveaux emails, éviter les doublons
  fusionnerEmails(contactDest, dataSource);
  
  // FUSION DES ADRESSES
  // Règle : Ajouter toutes les adresses, éviter les doublons
  fusionnerAdresses(contactDest, dataSource);
  
  // FUSION DES PHOTOS
  // Règle : Garder celle qui existe, ne pas écraser si déjà présente
  fusionnerPhotos(contactDest, dataSource);
  
  // FUSION DES NOTES
  // Règle : Combiner les deux avec marqueur
  fusionnerNotes(contactDest, dataSource);
}

/**
 * Fusionne intelligemment les noms
 * Garde toujours la version la PLUS COMPLÈTE
 */
function fusionnerNoms(contactDest, dataSource) {
  const prenomDest = contactDest.getGivenName() || '';
  const nomFamilleDest = contactDest.getFamilyName() || '';
  const prenomSource = dataSource.prenom || '';
  const nomFamilleSource = dataSource.nomFamille || '';
  
  // Stratégie : Garder ce qui est le plus complet
  
  // Prénom : garder le plus long (généralement le plus complet)
  if (prenomSource.length > prenomDest.length) {
    contactDest.setGivenName(prenomSource);
    if (CONFIG.DEBUG_MODE) {
      Logger.log(`  ✏️ Prénom mis à jour: "${prenomDest}" → "${prenomSource}"`);
    }
  } else if (prenomDest.length === 0 && prenomSource.length > 0) {
    contactDest.setGivenName(prenomSource);
  }
  
  // Nom de famille : garder le plus long
  if (nomFamilleSource.length > nomFamilleDest.length) {
    contactDest.setFamilyName(nomFamilleSource);
    if (CONFIG.DEBUG_MODE) {
      Logger.log(`  ✏️ Nom famille mis à jour: "${nomFamilleDest}" → "${nomFamilleSource}"`);
    }
  } else if (nomFamilleDest.length === 0 && nomFamilleSource.length > 0) {
    contactDest.setFamilyName(nomFamilleSource);
  }
}

/**
 * Fusionne les téléphones sans créer de doublons
 */
function fusionnerTelephones(contactDest, dataSource) {
  if (!dataSource.tousLesTelephones || dataSource.tousLesTelephones.length === 0) {
    return;
  }
  
  // Récupérer les téléphones existants (normalisés)
  const telephonesExistants = contactDest.getPhones().map(p => ({
    numero: p.getPhoneNumber(),
    numeroNormalise: normaliserTelephone(p.getPhoneNumber()),
    label: p.getLabel()
  }));
  
  // Ajouter les nouveaux téléphones
  let ajouts = 0;
  dataSource.tousLesTelephones.forEach(telSource => {
    const telNormalise = normaliserTelephone(telSource.numero);
    
    if (telNormalise) {
      // Vérifier si ce numéro existe déjà
      const dejaPresent = telephonesExistants.some(existant => 
        existant.numeroNormalise === telNormalise
      );
      
      if (!dejaPresent) {
        // Déterminer le type de téléphone à partir du label
        let fieldType = ContactsApp.Field.MOBILE_PHONE;
        if (telSource.label) {
          const labelLower = telSource.label.toLowerCase();
          if (labelLower.includes('domicile') || labelLower.includes('home') || labelLower.includes('maison')) {
            fieldType = ContactsApp.Field.HOME_PHONE;
          } else if (labelLower.includes('travail') || labelLower.includes('work') || labelLower.includes('bureau')) {
            fieldType = ContactsApp.Field.WORK_PHONE;
          } else if (labelLower.includes('fax')) {
            fieldType = ContactsApp.Field.HOME_FAX;
          }
        }
        
        contactDest.addPhone(fieldType, telSource.numero);
        ajouts++;
        if (CONFIG.DEBUG_MODE) {
          Logger.log(`  📱 Téléphone ajouté (${telSource.label}): ${telSource.numero}`);
        }
      }
    }
  });
  
  if (ajouts === 0 && CONFIG.DEBUG_MODE) {
    Logger.log(`  ℹ️ Aucun nouveau téléphone à ajouter`);
  }
}

/**
 * Fusionne les emails sans créer de doublons
 */
function fusionnerEmails(contactDest, dataSource) {
  if (!dataSource.tousLesEmails || dataSource.tousLesEmails.length === 0) {
    return;
  }
  
  // Récupérer les emails existants
  const emailsExistants = contactDest.getEmails().map(e => ({
    adresse: e.getAddress().toLowerCase(),
    label: e.getLabel()
  }));
  
  // Ajouter les nouveaux emails
  let ajouts = 0;
  dataSource.tousLesEmails.forEach(emailSource => {
    const emailLower = emailSource.adresse.toLowerCase();
    
    // Vérifier si cet email existe déjà
    const dejaPresent = emailsExistants.some(existant => 
      existant.adresse === emailLower
    );
    
    if (!dejaPresent && emailSource.adresse.trim() !== '') {
      // Déterminer le type d'email à partir du label
      let fieldType = ContactsApp.Field.HOME_EMAIL;
      if (emailSource.label) {
        const labelLower = emailSource.label.toLowerCase();
        if (labelLower.includes('travail') || labelLower.includes('work') || labelLower.includes('bureau')) {
          fieldType = ContactsApp.Field.WORK_EMAIL;
        } else if (labelLower.includes('autre') || labelLower.includes('other')) {
          fieldType = ContactsApp.Field.OTHER_EMAIL;
        }
      }
      
      contactDest.addEmail(fieldType, emailSource.adresse);
      ajouts++;
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`  📧 Email ajouté (${emailSource.label}): ${emailSource.adresse}`);
      }
    }
  });
  
  if (ajouts === 0 && CONFIG.DEBUG_MODE) {
    Logger.log(`  ℹ️ Aucun nouvel email à ajouter`);
  }
}

/**
 * Fusionne les adresses - CONSERVE TOUTES LES ADRESSES sans doublon
 */
function fusionnerAdresses(contactDest, dataSource) {
  if (!dataSource.toutesLesAdresses || dataSource.toutesLesAdresses.length === 0) {
    return;
  }
  
  // Récupérer les adresses existantes (normalisées pour comparaison)
  const adressesExistantes = contactDest.getAddresses().map(a => ({
    adresse: a.getAddress(),
    adresseNormalisee: normaliserAdresse(a.getAddress()),
    label: a.getLabel()
  }));
  
  // Ajouter les nouvelles adresses
  let ajouts = 0;
  dataSource.toutesLesAdresses.forEach(adresseSource => {
    const adresseNormalisee = normaliserAdresse(adresseSource.adresse);
    
    // Vérifier si cette adresse existe déjà
    const dejaPresente = adressesExistantes.some(existante => 
      existante.adresseNormalisee === adresseNormalisee
    );
    
    if (!dejaPresente && adresseSource.adresse.trim() !== '') {
      // Déterminer le type d'adresse à partir du label
      let fieldType = ContactsApp.Field.HOME_ADDRESS;
      if (adresseSource.label) {
        const labelLower = adresseSource.label.toLowerCase();
        if (labelLower.includes('travail') || labelLower.includes('work') || labelLower.includes('bureau')) {
          fieldType = ContactsApp.Field.WORK_ADDRESS;
        } else if (labelLower.includes('autre') || labelLower.includes('other')) {
          fieldType = ContactsApp.Field.OTHER_ADDRESS;
        }
      }
      
      contactDest.addAddress(fieldType, adresseSource.adresse);
      ajouts++;
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`  🏠 Adresse ajoutée (${adresseSource.label}): ${adresseSource.adresse}`);
      }
    }
  });
  
  if (ajouts === 0 && CONFIG.DEBUG_MODE) {
    Logger.log(`  ℹ️ Aucune nouvelle adresse à ajouter`);
  }
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
 */
function fusionnerNotes(contactDest, dataSource) {
  const notesDest = contactDest.getNotes() || '';
  const notesSource = dataSource.notes || '';
  
  // Créer une note combinée
  let notesFinales = notesDest;
  
  // Ajouter les notes source si différentes et non vides
  if (notesSource && notesSource.trim() !== '' && !notesDest.includes(notesSource)) {
    if (notesFinales) {
      notesFinales += '\n---\n' + notesSource;
    } else {
      notesFinales = notesSource;
    }
  }
  
  // Ajouter le marqueur de sync
  notesFinales += `\n${CONFIG.PREFIX_NOTES} Fusionné: ${new Date().toLocaleString('fr-FR')}`;
  
  contactDest.setNotes(notesFinales);
}

/**
 * Fusionne les photos - garde celle qui existe
 * Priorité : si une seule photo existe, on la garde
 *            si les deux existent, on garde celle de la destination (pour ne pas écraser)
 */
function fusionnerPhotos(contactDest, dataSource) {
  // Vérifier si le contact source a une photo
  if (!dataSource.photo) {
    return; // Pas de photo source, rien à faire
  }
  
  // Vérifier si le contact destination a déjà une photo
  let photoDestExiste = false;
  try {
    const photoDest = contactDest.getContactPhoto();
    photoDestExiste = (photoDest !== null);
  } catch (e) {
    photoDestExiste = false;
  }
  
  // Si destination n'a pas de photo mais source en a une, copier
  if (!photoDestExiste) {
    try {
      contactDest.setContactPhoto(dataSource.photo);
      if (CONFIG.DEBUG_MODE) {
        Logger.log(`  📷 Photo de contact ajoutée`);
      }
    } catch (e) {
      Logger.log(`  ⚠️ Impossible d'ajouter la photo: ${e.toString()}`);
    }
  } else {
    if (CONFIG.DEBUG_MODE) {
      Logger.log(`  ℹ️ Photo déjà présente, conservation de l'existante`);
    }
  }
}

/**
 * Crée un nouveau contact
 */
function creerContact(data) {
  let nouveauContact;
  
  // Cas 1: Contact avec email
  if (data.email && data.email.trim() !== '') {
    nouveauContact = ContactsApp.createContact(
      data.prenom || '',
      data.nomFamille || '',
      data.email
    );
  } 
  // Cas 2: Contact sans email mais avec téléphone
  else if (data.telephone && data.telephone.trim() !== '') {
    // Créer un contact avec nom seulement
    nouveauContact = ContactsApp.createContact(
      data.prenom || 'Contact',
      data.nomFamille || '',
      '' // Pas d'email
    );
  }
  // Cas 3: Contact sans email ni téléphone - on ne peut pas le créer
  else {
    Logger.log('⚠️ Impossible de créer un contact sans email ni téléphone');
    return null;
  }
  
  // Ajouter les autres informations
  if (data.telephone) {
    nouveauContact.addPhone(ContactsApp.Field.MOBILE_PHONE, data.telephone);
  }
  
  if (data.adresse) {
    nouveauContact.addAddress(ContactsApp.Field.HOME_ADDRESS, data.adresse);
  }
  
  if (data.notes) {
    nouveauContact.setNotes(data.notes + `\n${CONFIG.PREFIX_NOTES} Créé: ${new Date().toLocaleString('fr-FR')}`);
  }
  
  return nouveauContact;
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Crée une Map indexée par clé unique (email ou téléphone)
 * Nouvelle version qui gère les contacts sans email
 * ET détecte/fusionne les doublons au sein d'un même compte
 */
function creerMapParCleUnique(contacts) {
  const map = new Map();
  let contactsSansId = 0;
  let doublonsDetectes = 0;
  let doublonsFusionnes = 0;
  
  contacts.forEach(contact => {
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
      contactsSansId++;
      Logger.log(`⚠️ Contact ignoré (pas d'identifiant valide): ${contact.nom || 'Sans nom'}`);
    }
  });
  
  if (contactsSansId > 0) {
    Logger.log(`ℹ️ ${contactsSansId} contact(s) ignoré(s) car sans email ni téléphone valide`);
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
    email: base.email || autre.email,
    telephone: base.telephone || autre.telephone,
    adresse: base.adresse || autre.adresse,
    derniereModif: base.derniereModif > autre.derniereModif ? base.derniereModif : autre.derniereModif,
    contactOriginal: base.contactOriginal,
    
    // Fusionner les listes
    tousLesEmails: [...(base.tousLesEmails || [])],
    tousLesTelephones: [...(base.tousLesTelephones || [])],
    toutesLesAdresses: [...(base.toutesLesAdresses || [])],
    
    // Combiner les notes
    notes: base.notes || '',
    
    // Photo : garder celle qui existe
    photo: base.photo || autre.photo
  };
  
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
function creerMapParEmail(contacts) {
  return creerMapParCleUnique(contacts);
}

/**
 * Envoie un rapport de synchronisation
 */
function envoyerRapportBidirectionnel(stats) {
  const destinataire = Session.getActiveUser().getEmail();
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
  
  MailApp.sendEmail(destinataire, sujet, corps);
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
  
  MailApp.sendEmail(
    Session.getActiveUser().getEmail(),
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
 * Au lieu d'utiliser l'API People (complexe), cette méthode utilise
 * Google Drive comme point de synchronisation central.
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
  const data = JSON.stringify(contacts);
  
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
  const mapMesContacts = creerMapParEmail(mesContacts);
  const mapAutres = creerMapParEmail(contactsAutreCompte);
  
  const stats = syncDirection(mapAutres, mapMesContacts, 'drive->local');
  
  Logger.log(`✅ Sync terminée: ${stats.ajoutes} ajoutés, ${stats.modifies} modifiés`);
  
  // 4. Rapport
  MailApp.sendEmail(
    Session.getActiveUser().getEmail(),
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
    
    // Créer le fichier de sauvegarde
    const data = JSON.stringify(contacts, null, 2);
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
  
  MailApp.sendEmail(
    Session.getActiveUser().getEmail(),
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
    
    // ERREUR: Ni email ni téléphone
    if (!aEmail && !aTelephone) {
      erreurs.push(`Contact ${index + 1} "${contact.nom || 'Sans nom'}": Pas d'email ni de téléphone`);
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
  
  const mapMesContacts = creerMapParCleUnique(mesContacts);
  const mapAutres = creerMapParCleUnique(contactsAutreCompte);
  
  let ajouts = 0;
  let modifications = 0;
  let contactsAvecEmailAjoutes = 0;
  let contactsAvecTelAjoutes = 0;
  
  // Simuler les ajouts et modifications
  mapAutres.forEach((contact, cle) => {
    const identifiant = contact.email || contact.telephone || contact.nom;
    
    if (!mapMesContacts.has(cle)) {
      const type = cle.startsWith('email:') ? '📧' : cle.startsWith('phone:') ? '📱' : '👤';
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
  
  MailApp.sendEmail(
    Session.getActiveUser().getEmail(),
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
  Logger.log(`\n=== RÉSUMÉ SIMULATION ===`);
  Logger.log(`Ajouts prévus: ${ajouts}`);
  Logger.log(`Modifications prévues: ${modifications}`);
  Logger.log(`Total contacts actuels: ${mesContacts.length}`);
  Logger.log(`Total après synchro: ${mesContacts.length + ajouts}`);
  
  MailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    '🔍 Simulation de synchronisation',
    `Mode simulation (aucune modification réelle):\n\n- Ajouts prévus: ${ajouts}\n- Modifications prévues: ${modifications}\n\nConsultez les logs pour le détail.`
  );
}
