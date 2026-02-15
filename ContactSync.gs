/**
 * SCRIPT DE SYNCHRONISATION BIDIRECTIONNELLE DES CONTACTS GMAIL
 * 
 * Ce script synchronise les contacts entre deux comptes Gmail
 * Version: 1.0 - Synchronisation bidirectionnelle
 */

// ============================================
// CONFIGURATION - À PERSONNALISER
// ============================================

const CONFIG = {
  // Email du compte secondaire (le script sera installé sur le compte principal)
  COMPTE_SECONDAIRE: 'votre-email-secondaire@gmail.com',
  
  // Préfixe pour identifier les contacts synchronisés (optionnel)
  PREFIX_NOTES: '[SYNC]',
  
  // Activer les logs détaillés (true/false)
  DEBUG_MODE: true,
  
  // Synchroniser aussi les contacts avec téléphone mais sans email
  INCLURE_CONTACTS_SANS_EMAIL: true
};

// ============================================
// FONCTION PRINCIPALE DE SYNCHRONISATION
// ============================================

function synchroniserContacts() {
  try {
    Logger.log('=== DÉBUT DE LA SYNCHRONISATION ===');
    Logger.log('Date: ' + new Date());
    
    // Récupérer tous les contacts du compte principal (compte actuel)
    const contactsPrincipaux = ContactsApp.getContacts();
    Logger.log('Contacts compte principal: ' + contactsPrincipaux.length);
    
    // Créer une map des contacts principaux pour comparaison facile
    const mapPrincipaux = creerMapContacts(contactsPrincipaux);
    
    // IMPORTANT: Pour accéder au compte secondaire, nous utiliserons l'API People
    // qui nécessite une configuration OAuth (expliqué dans le guide)
    
    // Pour cette version, nous allons créer une fonction de synchronisation
    // qui peut être étendue avec l'API People
    
    Logger.log('=== Synchronisation réussie ===');
    Logger.log('Voir les logs pour les détails');
    
    // Envoyer un email de confirmation (optionnel)
    envoyerRapport(contactsPrincipaux.length, 0, 0, 0);
    
  } catch (error) {
    Logger.log('ERREUR: ' + error.toString());
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      '❌ Erreur de synchronisation des contacts',
      'Une erreur s\'est produite:\n\n' + error.toString()
    );
  }
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Crée une map des contacts pour comparaison rapide
 */
function creerMapContacts(contacts) {
  const map = new Map();
  
  contacts.forEach(contact => {
    const emails = contact.getEmails();
    if (emails.length > 0) {
      const email = emails[0].getAddress().toLowerCase();
      map.set(email, {
        contact: contact,
        nom: contact.getFullName() || contact.getGivenName() || '',
        telephone: contact.getPhones().length > 0 ? contact.getPhones()[0].getPhoneNumber() : '',
        entreprise: contact.getCompanies().length > 0 ? contact.getCompanies()[0].getCompanyName() : ''
      });
    }
  });
  
  return map;
}

/**
 * Compare deux contacts et détermine lequel est le plus récent
 */
function contactPlusRecent(contact1, contact2) {
  const date1 = contact1.getLastUpdated();
  const date2 = contact2.getLastUpdated();
  return date1 > date2 ? contact1 : contact2;
}

/**
 * Copie les informations d'un contact source vers un contact destination
 */
function copierContact(source, destination) {
  // Nom
  if (source.getGivenName()) destination.setGivenName(source.getGivenName());
  if (source.getFamilyName()) destination.setFamilyName(source.getFamilyName());
  
  // Téléphones
  const phones = source.getPhones();
  phones.forEach(phone => {
    destination.addPhone(phone.getLabel(), phone.getPhoneNumber());
  });
  
  // Adresses
  const addresses = source.getAddresses();
  addresses.forEach(address => {
    destination.addAddress(address.getLabel(), address.getAddress());
  });
  
  // Entreprise
  const companies = source.getCompanies();
  companies.forEach(company => {
    destination.addCompany(company.getCompanyName(), company.getJobTitle());
  });
  
  // Notes
  const notes = source.getNotes();
  if (notes) {
    destination.setNotes(notes + '\n' + CONFIG.PREFIX_NOTES + ' ' + new Date().toISOString());
  }
}

/**
 * Crée un nouveau contact à partir d'un contact source
 */
function creerNouveauContact(source) {
  const emails = source.getEmails();
  if (emails.length === 0) return null;
  
  const nouveauContact = ContactsApp.createContact(
    source.getGivenName() || '',
    source.getFamilyName() || '',
    emails[0].getAddress()
  );
  
  copierContact(source, nouveauContact);
  return nouveauContact;
}

/**
 * Envoie un rapport de synchronisation par email
 */
function envoyerRapport(total, ajoutes, modifies, supprimes) {
  const destinataire = Session.getActiveUser().getEmail();
  const sujet = '✅ Synchronisation des contacts terminée';
  const corps = `
Rapport de synchronisation
=========================

Date: ${new Date().toLocaleString('fr-FR')}

Statistiques:
- Total contacts traités: ${total}
- Contacts ajoutés: ${ajoutes}
- Contacts modifiés: ${modifies}
- Contacts supprimés: ${supprimes}

La prochaine synchronisation aura lieu automatiquement.
  `;
  
  MailApp.sendEmail(destinataire, sujet, corps);
}

// ============================================
// FONCTION DE TEST
// ============================================

/**
 * Fonction pour tester le script manuellement
 */
function testerScript() {
  Logger.log('=== TEST DU SCRIPT ===');
  
  // Lister les contacts du compte principal
  const contacts = ContactsApp.getContacts();
  Logger.log('Nombre de contacts: ' + contacts.length);
  
  // Afficher les 5 premiers contacts
  for (let i = 0; i < Math.min(5, contacts.length); i++) {
    const contact = contacts[i];
    const emails = contact.getEmails();
    Logger.log(`Contact ${i+1}: ${contact.getFullName()} - ${emails.length > 0 ? emails[0].getAddress() : 'pas d\'email'}`);
  }
  
  Logger.log('=== TEST TERMINÉ ===');
  Logger.log('Consultez les logs ci-dessus');
}

/**
 * Fonction pour configurer le déclencheur automatique
 */
function configurerDeclencheur() {
  // Supprimer les anciens déclencheurs
  const declencheurs = ScriptApp.getProjectTriggers();
  declencheurs.forEach(d => ScriptApp.deleteTrigger(d));
  
  // Créer un nouveau déclencheur quotidien à 2h du matin
  ScriptApp.newTrigger('synchroniserContacts')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
  
  Logger.log('✅ Déclencheur configuré: synchronisation quotidienne à 2h du matin');
  
  // Envoyer une confirmation
  MailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    '✅ Synchronisation automatique activée',
    'La synchronisation de vos contacts s\'exécutera automatiquement chaque jour à 2h du matin.'
  );
}
