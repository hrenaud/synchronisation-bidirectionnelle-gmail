# 📘 SYNCHRONISATION CONTACTS GMAIL - GUIDE COMPLET

## 🎯 Ce Que Vous Avez

**Une solution complète et gratuite pour synchroniser bidirectionnellement vos contacts entre deux comptes Gmail.**

---

## ✨ FONCTIONNALITÉS PRINCIPALES

### ✅ Synchronisation Bidirectionnelle Complète
- Les contacts des deux comptes sont fusionnés intelligemment
- Aucune perte de données
- Automatique (quotidien ou configurable)

### ✅ Fusion Intelligente (Pas d'Écrasement)
- **Combine** les informations au lieu de les écraser
- Exemple : "Marie" (compte A) + "Marie Dupond" (compte B) = "Marie Dupond" partout
- Tous les téléphones, emails, adresses sont conservés

### ✅ Détection et Fusion des Doublons Internes
- Détecte automatiquement les doublons **dans un même compte**
- Les fusionne intelligemment avant la synchronisation
- Exemple : 2 contacts "marie@gmail.com" → 1 seul contact avec toutes les infos

### ✅ Contacts Sans Email Supportés
- Synchronise aussi les contacts qui n'ont qu'un numéro de téléphone
- Normalisation intelligente des numéros (+33, 06, etc.)
- Aucun contact perdu

### ✅ Adresses Multiples Préservées
- **Toutes** les adresses sont conservées (Domicile, Travail, Vacances, etc.)
- Labels préservés
- Pas de limite au nombre d'adresses

### ✅ Photos de Contacts
- Photos détectées et copiées automatiquement
- Si un compte a la photo et l'autre non → copiée
- Jamais écrasées si déjà présentes

### ✅ Groupes de Contacts (Labels)
- Les groupes de contacts sont synchronisés entre comptes
- Les groupes manquants sont créés automatiquement
- Les memberships sont traduits (IDs propres à chaque compte)

### ✅ Gestion du Temps d'Exécution
- Limite adaptée au type de compte : 5 min (gratuit) ou 28 min (Workspace/pro)
- Configurable via la propriété `COMPTE_PRO` (`'true'` ou `'false'`)
- **Reprise automatique** : progression sauvegardée sur Drive entre les runs
- Les contacts déjà traités sont sautés instantanément au run suivant
- Détection de changement avant appel API : contacts inchangés = 0 appel API

### ✅ Sécurité Maximale
- Sauvegarde automatique (1 par jour, 7 dernières conservées = 7 jours d'historique)
- Fonction de restauration d'urgence
- Validation des données avant traitement
- Erreurs individuelles ne bloquent pas la sync
- Logs complets de toutes les opérations

---

## 📁 FICHIERS FOURNIS

### Script

1. **ContactSync_Advanced.gs** ⭐ SCRIPT PRINCIPAL
   - Utilise People API (v1)
   - Synchronisation via Google Drive
   - Fusion intelligente et détection des doublons
   - Support des organisations/entreprises
   - Nettoyage des contacts vides (optionnel)
   - À installer sur LES DEUX comptes

### Documentation

1. **LISEZMOI_COMPLET.md** (ce fichier)
   - Vue d'ensemble complète
   - À lire EN PREMIER

2. **GUIDE_INSTALLATION.md**
   - Installation pas à pas
   - Pour débutants
   - À suivre pour installer

3. **FUSION_INTELLIGENTE.md**
   - Comment fonctionne la fusion
   - Exemples détaillés
   - Résout le problème "Marie" vs "Marie Dupond"

4. **AMELIORATIONS_CRITIQUES.md**
   - Doublons internes
   - Adresses multiples
   - Photos de contacts

5. **CONTACTS_SANS_EMAIL.md**
   - Gestion des contacts avec téléphone uniquement
   - Normalisation des numéros

6. **GUIDE_SECURITE.md**
   - Sauvegardes automatiques
   - Restauration d'urgence
   - Plan de sécurité

7. **RECHERCHE_API_GOOGLE.md**
   - Pourquoi notre code est nécessaire
   - Ce que Google ne fournit pas dans l'API

---

## 🚀 DÉMARRAGE RAPIDE

### Étape 1 : Lire la Documentation (10 min)
1. ✅ Ce fichier (LISEZMOI_COMPLET.md)
2. ✅ GUIDE_INSTALLATION.md (sections importantes)

### Étape 2 : Installation (30 min)
1. Suivre **GUIDE_INSTALLATION.md** étape par étape
2. Installer sur les DEUX comptes Gmail
3. Configurer les emails dans `CONFIG`
4. Tester en mode simulation

### Étape 3 : Première Synchronisation (10 min)
1. Créer une sauvegarde manuelle (export Google Contacts)
2. Exécuter `simulerSynchronisation()` sur les deux comptes
3. Vérifier les logs
4. Lancer `syncViaGoogleDrive()` sur les deux comptes

### Étape 4 : Activation Automatique (5 min)
1. Exécuter `configurerSyncDrive()` sur les deux comptes
2. Vérifier les déclencheurs
3. Attendre l'email de confirmation

**TOTAL : ~1 heure pour tout mettre en place**

---

## ⚙️ CONFIGURATION

### Configuration via les Propriétés du script

La configuration sensible (emails) est externalisée dans les **Propriétés du script** (pas dans le code) :

1. Exécutez `configurerCompte()` après avoir modifié les valeurs dans la fonction
2. Ou allez dans **Paramètres du projet** (⚙️) → **Propriétés du script** → Ajoutez :
   - `COMPTE_SECONDAIRE` : email de l'autre compte
   - `EMAIL_RAPPORT` : email pour les rapports (adresse `@gmail.com` recommandée)
   - `COMPTE_PRO` : `true` pour les comptes Workspace/payants (limite 28 min), `false` ou absent pour les comptes gratuits (limite 5 min)

Les autres paramètres sont dans `CONFIG` dans le code :

```javascript
const CONFIG = {
  STRATEGIE_CONFLIT: 'merge',          // 'merge' = fusion intelligente (RECOMMANDÉ)
  INCLURE_CONTACTS_SANS_EMAIL: true,   // contacts avec téléphone uniquement
  SUPPRIMER_CONTACTS_VIDES: false,     // nettoyage optionnel
  DEBUG_MODE: true,                    // logs détaillés
  PREFIX_NOTES: '[SYNC]',
  LABEL_SYNC: 'Synchronisés'
};
```

### ⚠️ IMPORTANT
- Installez le script sur **LES DEUX comptes**
- Le code est **identique** sur les deux comptes — seules les Propriétés changent
- Sur compte A : `COMPTE_SECONDAIRE` = `'compteB@gmail.com'`
- Sur compte B : `COMPTE_SECONDAIRE` = `'compteA@gmail.com'`

---

## 📊 CE QUI EST SYNCHRONISÉ

**TOUS les champs People API sont synchronisés (25 champs).** Aucune perte de données.

| Élément | Synchronisé ? | Détails |
|---------|---------------|---------|
| **Noms / Prénoms** | ✅ Oui | Version la plus complète conservée |
| **Emails** | ✅ Tous | Avec labels (Travail, Perso, etc.) |
| **Téléphones** | ✅ Tous | Avec labels (Mobile, Fixe, etc.) |
| **Adresses** | ✅ Toutes | Avec labels (Domicile, Travail, etc.) |
| **Photos** | ✅ Oui | Copiées si manquantes |
| **Notes** | ✅ Oui | Combinées avec marqueur |
| **Entreprises / Postes** | ✅ Toutes | Organisations multiples supportées |
| **Anniversaires** | ✅ Oui | Copiés si manquants |
| **Surnoms** | ✅ Oui | Fusionnés (union) |
| **Relations** | ✅ Toutes | Conjoint, enfant, etc. |
| **Événements** | ✅ Tous | Dates personnalisées |
| **URLs** | ✅ Toutes | Sites web, profils sociaux |
| **Messageries (IM)** | ✅ Toutes | Skype, Hangouts, etc. |
| **Champs personnalisés** | ✅ Tous | userDefined, clientData |
| **Autres** | ✅ Tous | Centres d'intérêt, compétences, lieux, etc. |

---

## 🔒 SÉCURITÉ

### Garanties
✅ Aucune donnée envoyée à des tiers
✅ Tout reste dans votre Google Drive
✅ Sauvegarde automatique avant chaque sync
✅ 7 sauvegardes conservées
✅ Fonction de restauration disponible
✅ Validation des données avant traitement
✅ Logs complets et transparents

### Ce Qui Ne Sera JAMAIS Perdu
✅ Noms de famille
✅ Numéros de téléphone
✅ Adresses email
✅ Adresses postales
✅ Photos
✅ Notes
✅ Anniversaires
✅ Organisations / Postes
✅ Surnoms, relations, événements, URLs
✅ Tous les autres champs (25 champs People API)

### Protection Contre les Erreurs
✅ Aucune suppression automatique
✅ Fusion intelligente (pas d'écrasement)
✅ Détection de doublons avant problèmes
✅ Mode simulation pour tester sans risque

---

## 🎯 CAS D'USAGE RÉSOLUS

### 1. Contact Famille/Pro Séparé
```
AVANT:
  📱 Perso: "Papa" + téléphone
  💼 Pro: "Pierre Dupond" + email pro

APRÈS:
  ✅ "Pierre Dupond" partout
  ✅ Téléphone perso + email pro
  ✅ Toutes les infos combinées
```

### 2. Doublons Accumulés
```
AVANT:
  Contact 1: Marie (juste prénom)
  Contact 2: Marie D. (initiale)
  Contact 3: Marie Dupond (complet)

APRÈS:
  ✅ 1 seul contact : "Marie Dupond"
  ✅ Tous les tels/emails/adresses combinés
```

### 3. Contact Incomplet
```
AVANT:
  Compte A: Email seulement
  Compte B: Téléphone seulement

APRÈS:
  ✅ Les deux comptes ont email ET téléphone
```

### 4. Adresses Multiples
```
AVANT (risque de perte):
  Domicile + Travail + Vacances

APRÈS:
  ✅ Les 3 adresses préservées partout
```

### 5. Photos Manquantes
```
AVANT:
  Compte A: Avec photo
  Compte B: Sans photo

APRÈS:
  ✅ Les deux comptes ont la photo
```

---

## 📈 FRÉQUENCE DE SYNCHRONISATION

### Par Défaut
- **1 fois par jour à 3h du matin**

### Compte gratuit (@gmail.com) — `COMPTE_PRO: 'false'`
- **Recommandé : toutes les heures** pour la synchronisation initiale (limite de 6 min par exécution)
- Le script s'interrompt proprement à 5 min et **sauvegarde la progression** sur Drive
- Au run suivant, les contacts déjà traités sont sautés instantanément
- Après convergence complète, réduire à 1 fois par jour

### Compte Workspace (payant) — `COMPTE_PRO: 'true'`
- **1 fois par jour** suffit (limite de 30 min, garde-fou à 28 min)
- Tous les contacts traités en un seul run

### Personnalisable
```javascript
// Dans configurerSyncDrive()

// Toutes les heures (recommandé pour compte gratuit au début)
.everyHours(1)

// Toutes les 6 heures
.everyHours(6)

// Tous les 2 jours
.everyDays(2)

// Tous les lundis à 9h
.onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9)
```

---

## 🔍 SURVEILLANCE

### Emails de Rapport
Vous recevez un email après chaque synchronisation :
```
✅ Synchronisation terminée

Contacts traités: 250
Contacts ajoutés: 15
Contacts fusionnés: 45

Détails:
  - Noms complétés: 12
  - Téléphones ajoutés: 23
  - Emails ajoutés: 8
  - Adresses ajoutées: 5
  - Photos copiées: 3
```

### Logs Détaillés
Avec `DEBUG_MODE: true` :
```
🔄 Fusion: marie@gmail.com
  ✏️ Nom famille: "" → "Dupond"
  📱 Téléphone ajouté: +33687654321
  📧 Email ajouté: marie.work@company.com
  🏠 Adresse ajoutée: 10 Rue de Paris
  📷 Photo copiée
```

### Dashboard
- **Google Apps Script → Exécutions** : Historique complet
- **Google Apps Script → Déclencheurs** : Vérifier que c'est actif
- **Google Drive → ContactSync_Backups** : Vos sauvegardes

---

## 🛠️ FONCTIONS UTILES

### Mode Simulation (Avant Vraie Synchro)
```javascript
simulerSynchronisation()
```
Montre ce qui SERAIT fait sans rien modifier.

### Synchronisation Manuelle
```javascript
syncViaGoogleDrive()
```
Lance la synchronisation immédiatement.

### Sauvegarde Manuelle
```javascript
creerSauvegardeSecurite()
```
Crée une sauvegarde à l'instant.

### Restauration d'Urgence
```javascript
restaurerDepuisSauvegarde()
```
Liste les sauvegardes disponibles et permet de restaurer.

### Activation Automatique
```javascript
configurerSyncDrive()
```
Active la synchronisation quotidienne automatique.

---

## ❓ DÉPANNAGE RAPIDE

### "Contacts en doublon après synchro"
→ Vérifier que `STRATEGIE_CONFLIT: 'merge'`
→ Consulter les logs pour voir si doublons détectés
→ Vérifier que les emails/tels sont identiques

### "Adresse perdue"
→ Impossible avec le nouveau code
→ Vérifier DEBUG_MODE pour voir les logs
→ Toutes les adresses doivent être dans `toutesLesAdresses`

### "Photo non copiée"
→ Vérifier les logs : "⚠️ Impossible d'ajouter la photo"
→ Photo peut-être trop grande (>5 MB)
→ Synchronisation continue normalement

### "Pas d'email de rapport"
→ Cause fréquente : blocage DMARC (domaines personnalisés)
→ Solution : configurer `EMAIL_RAPPORT: 'votre-nom@gmail.com'`
→ Vérifier le dossier spam
→ Les rapports sont aussi visibles dans les logs même si l'email échoue

### "Quota dépassé"
→ Message : "Service invoked too many times"
→ Attendre 24h pour réinitialisation
→ Réduire la fréquence de synchronisation

---

## 📚 ORDRE DE LECTURE RECOMMANDÉ

**Pour Installation :**
1. LISEZMOI_COMPLET.md (ce fichier) ← Vous êtes ici
2. GUIDE_INSTALLATION.md ← Suivre étape par étape
3. GUIDE_SECURITE.md ← Comprendre les protections

**Pour Comprendre les Fonctionnalités :**
4. FUSION_INTELLIGENTE.md ← Comment éviter la perte de données
5. AMELIORATIONS_CRITIQUES.md ← Doublons, adresses, photos
6. CONTACTS_SANS_EMAIL.md ← Gestion des contacts avec téléphone uniquement

**Pour Référence :**
7. RECHERCHE_API_GOOGLE.md ← Pourquoi notre code est nécessaire

---

## ⚡ DÉMARRAGE EXPRESS (Si Pressé)

**Minimum absolu pour commencer :**

1. **Ouvrir** `ContactSync_Advanced.gs`
2. **Modifier** ligne 15 : mettre votre email secondaire
3. **Copier** dans Google Apps Script (sur les 2 comptes)
4. **Exécuter** `configurerSyncDrive()` sur les 2 comptes
5. **Attendre** l'email de confirmation

**Fait ! La synchronisation est active.**

**Recommandé ensuite :**
- Lire GUIDE_INSTALLATION.md complet
- Vérifier les logs après première synchro
- Créer une sauvegarde manuelle externe

---

## 💡 POINTS CLÉS À RETENIR

### ✅ Forces
- Gratuit à 100%
- Fusion intelligente (pas d'écrasement)
- Aucune perte de données
- Sauvegardes automatiques
- Transparent (logs complets)
- Gère tous les cas complexes

### ⚠️ Limitations
- Nécessite installation sur les 2 comptes
- Latence (selon fréquence choisie)
- Quota Google (100 000 ops/jour, largement suffisant)
- Pas de synchronisation instantanée

### 🎯 Idéal Pour
- Contacts perso/pro à fusionner
- Migration entre comptes
- Backup automatique
- Nettoyage de doublons
- Enrichissement de contacts incomplets

---

## 🎓 SUPPORT

### En Cas de Problème
1. Consulter les logs (Apps Script → Exécutions)
2. Lire GUIDE_SECURITE.md pour les procédures
3. Vérifier DEBUG_MODE est activé
4. Consulter les emails de rapport

### Ressources
- Documentation Google Apps Script
- Documentation People API
- Les 7 fichiers de documentation fournis

---

## ✅ CHECKLIST FINALE AVANT INSTALLATION

- [ ] J'ai lu LISEZMOI_COMPLET.md
- [ ] J'ai lu GUIDE_INSTALLATION.md sections importantes
- [ ] J'ai compris que l'installation se fait sur LES DEUX comptes
- [ ] J'ai créé une sauvegarde manuelle (Google Contacts → Exporter)
- [ ] J'ai les emails des deux comptes à portée de main
- [ ] Je suis prêt à tester en mode simulation d'abord
- [ ] Je comprends que DEBUG_MODE doit être true au début
- [ ] Je sais où trouver les logs (Apps Script → Exécutions)

---

## 🎉 PRÊT À COMMENCER

**Maintenant, suivez le GUIDE_INSTALLATION.md étape par étape.**

**Temps estimé : 1 heure pour tout mettre en place**

**Résultat : Synchronisation bidirectionnelle permanente et gratuite de vos contacts Gmail !**

---

**Bonne synchronisation ! 🚀**
