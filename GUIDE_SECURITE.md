# 🔒 GUIDE SÉCURITÉ - Synchronisation Contacts Gmail

## 📊 NIVEAU DE SÉCURITÉ ACTUEL

### ✅ Ce qui est sécurisé

| Aspect | Protection | Détail |
|--------|-----------|---------|
| **Stockage** | ✅ Excellent | Tout reste dans votre Google Drive |
| **Confidentialité** | ✅ Excellent | Aucun tiers n'a accès |
| **Permissions** | ✅ Bon | Uniquement vos données |
| **Transparence** | ✅ Excellent | Code open source visible |
| **Traçabilité** | ✅ Bon | Logs + emails de rapport |

### ⚠️ Risques potentiels (et comment les éviter)

| Risque | Probabilité | Impact | Solution |
|--------|-------------|---------|----------|
| Bug de code | Faible | Moyen | Sauvegarde automatique ✅ |
| Modification simultanée | Moyenne | Faible | Résolution par date ✅ |
| Suppression accidentelle | Faible | Élevé | Pas de suppression auto ✅ |
| Quota dépassé | Très faible | Faible | Logs d'erreur ✅ |
| Corruption de données | Très faible | Élevé | Backups multiples ✅ |

---

## 🛡️ NOUVELLES PROTECTIONS AJOUTÉES

### 1. Sauvegarde automatique avant chaque synchronisation

**Comment ça fonctionne :**
```
Avant la synchro → Snapshot complet des contacts → Stocké dans Drive
                    ↓
              Synchronisation
                    ↓
         Si problème détecté → Restauration possible
```

**Localisation :** Dossier `ContactSync_Backups` dans votre Google Drive

**Rétention :** 7 dernières sauvegardes (1 semaine)

**Automatique :** Oui, à chaque synchronisation

### 2. Validation des données

Avant toute modification, le script vérifie :
- ✅ Chaque contact a un email valide
- ✅ Format email correct (contient @)
- ✅ Pas de données corrompues

### 3. Mode simulation (dry-run)

Testez une synchronisation **sans rien modifier** :

```javascript
simulerSynchronisation()
```

Vous recevrez un email avec :
- Nombre d'ajouts prévus
- Nombre de modifications prévues  
- Impact total

**Utilisez ceci avant la première vraie synchronisation !**

### 4. Fonction de restauration d'urgence

En cas de problème, restaurez vos contacts :

```javascript
restaurerDepuisSauvegarde()
```

Cela liste toutes les sauvegardes disponibles avec leur date.

---

## 📋 PROCÉDURE DE SÉCURITÉ RECOMMANDÉE

### Avant la première synchronisation

```
✅ Étape 1: Sauvegarde manuelle Google
   - Google Contacts → Exporter → Google CSV
   - Télécharger sur votre ordinateur

✅ Étape 2: Tester en mode simulation
   - Exécuter: simulerSynchronisation()
   - Vérifier l'email de rapport
   - Consulter les logs

✅ Étape 3: Première synchro réelle
   - Si simulation OK → Exécuter: syncViaGoogleDrive()
   - Vérifier les résultats
   - Consulter le rapport par email

✅ Étape 4: Validation manuelle
   - Ouvrir Google Contacts sur les deux comptes
   - Vérifier quelques contacts aléatoires
   - Confirmer que tout est correct
```

### Utilisation quotidienne

La synchronisation automatique :
1. Crée une sauvegarde
2. Valide les données
3. Synchronise
4. Envoie un rapport

**Vous n'avez rien à faire**, sauf vérifier les emails de rapport.

---

## 🚨 PLAN D'URGENCE - Si quelque chose se passe mal

### Scénario 1: Contacts dupliqués

**Symptôme :** Vous voyez des contacts en double

**Cause :** Différences mineures dans les emails (ex: majuscules)

**Solution :**
```javascript
// Le script utilise toLowerCase() pour éviter ça
// Si ça arrive quand même:
1. Identifier les doublons dans Google Contacts
2. Fusionner manuellement (Google Contacts le fait bien)
3. Relancer la synchro
```

### Scénario 2: Contact important manquant

**Symptôme :** Un contact a disparu

**Causes possibles :**
- Supprimé manuellement sur un compte
- Pas d'adresse email (le script l'ignore)

**Solution :**
```javascript
// 1. Vérifier les sauvegardes
restaurerDepuisSauvegarde()

// 2. Consulter les logs pour voir ce qui s'est passé
// Menu Apps Script → Exécutions → Voir les logs

// 3. Restaurer depuis sauvegarde Google manuelle
// (celle que vous avez créée avant de commencer)
```

### Scénario 3: Informations modifiées incorrectement

**Symptôme :** Un contact a de mauvaises infos

**Cause :** Version plus récente incorrecte a écrasé la bonne

**Solution :**
```javascript
// 1. Corriger manuellement le contact
// 2. Il sera synchronisé correctement à la prochaine synchro
//    (car il devient le plus récent)

// OU

// 1. Restaurer depuis une sauvegarde
// 2. Identifier la bonne version
// 3. La réinjecter manuellement
```

### Scénario 4: Script ne fonctionne plus

**Symptômes possibles :**
- Pas d'email de rapport
- Erreurs dans les logs
- Quota dépassé

**Diagnostic :**
```
1. Apps Script → Exécutions
2. Voir la dernière exécution
3. Lire le message d'erreur
```

**Solutions courantes :**

| Erreur | Solution |
|--------|----------|
| "Service invoked too many times" | Quota dépassé → Attendre 24h |
| "Permission denied" | Réautoriser le script |
| "File not found" | Vérifier partage Drive entre comptes |
| "Invalid email" | Nettoyer contacts sans email valide |

---

## 🔍 SURVEILLANCE ET AUDIT

### Vérifications hebdomadaires recommandées

**Semaine 1-4 (période de test) :**
- ✅ Lire chaque email de rapport
- ✅ Vérifier manuellement 5-10 contacts aléatoires
- ✅ Consulter les logs une fois par semaine

**Après 1 mois (régime de croisière) :**
- ✅ Lire les emails de rapport (scan rapide)
- ✅ Vérification manuelle mensuelle
- ✅ Logs uniquement si problème

### Dashboard de surveillance

**Où trouver les informations :**

1. **Emails de rapport** → Statistiques quotidiennes
2. **Google Drive** → Voir les fichiers de sync + backups
3. **Apps Script → Exécutions** → Historique complet
4. **Apps Script → Déclencheurs** → Vérifier que c'est actif

### Indicateurs de santé

✅ **Tout va bien si :**
- Vous recevez un email chaque jour
- Nombre de contacts reste stable (±10%)
- Pas de message d'erreur dans les logs

⚠️ **Attention si :**
- Pas d'email pendant 2+ jours
- Nombre de contacts varie de >20%
- Erreurs répétées dans les logs

🚨 **Alarme si :**
- Plus de 50% des contacts manquants
- Échec de synchronisation pendant 7+ jours
- Messages d'erreur "Permission denied"

---

## 🔐 BONNES PRATIQUES

### DO - À faire

✅ **Conserver une sauvegarde manuelle externe**
- Exporter vos contacts 1x/mois
- Les stocker sur votre ordinateur
- Format Google CSV recommandé

✅ **Vérifier les emails de rapport**
- Au moins scanner le sujet
- Lire en détail si chiffres inhabituels

✅ **Tester en simulation avant gros changements**
- Si vous allez importer 100+ contacts
- Si vous fusionnez des listes
- Avant toute opération massive

✅ **Documenter vos modifications**
- Si vous changez la config du script
- Noter la date et le changement
- Garder une copie de l'ancien code

### DON'T - À éviter

❌ **Modifier les contacts sur les 2 comptes en même temps**
- Attendez la synchro entre les deux
- Ou acceptez que la dernière modif gagne

❌ **Désactiver les sauvegardes pour "gagner de l'espace"**
- Les backups sont minuscules
- Le gain est négligeable
- Le risque est énorme

❌ **Ignorer les erreurs dans les logs**
- Une erreur isolée = OK
- Erreurs répétées = problème à investiguer

❌ **Supprimer le script et le recréer fréquemment**
- Vous perdez l'historique des exécutions
- Les déclencheurs doivent être reconfigurés

---

## 📊 MATRICE DE RÉCUPÉRATION

En fonction du problème, voici vos options :

| Problème | Solution Rapide | Solution Complète | Perte de données |
|----------|----------------|-------------------|------------------|
| Contact dupliqué | Fusionner manuellement | - | Aucune |
| Contact manquant | Vérifier corbeille Gmail | Restaurer backup | Aucune |
| Infos incorrectes | Corriger manuellement | Restaurer backup | Aucune |
| 10-50 contacts perdus | Restaurer backup auto | Restaurer backup manuel | Récupérable |
| >50% contacts perdus | Restaurer backup manuel | Contact Google Support | Récupérable |
| Script corrompu | Recopier code original | - | Aucune |

**Temps de récupération estimé :** 5-30 minutes selon le scénario

---

## 🎯 CHECKLIST PRÉ-LANCEMENT

Avant d'activer la synchronisation automatique :

### Sécurité
- [ ] Sauvegarde manuelle créée et téléchargée
- [ ] Dossier ContactSync_Backups créé dans Drive
- [ ] Fonction simulerSynchronisation() testée
- [ ] Email de rapport reçu et lu

### Configuration
- [ ] Les deux scripts installés (un par compte)
- [ ] Emails configurés correctement dans CONFIG
- [ ] Partage Drive configuré entre les comptes
- [ ] Déclencheurs activés sur les deux comptes

### Tests
- [ ] Mode simulation exécuté avec succès
- [ ] Première synchro manuelle testée
- [ ] Vérification manuelle des résultats OK
- [ ] Logs consultés et compris

### Documentation
- [ ] Vous savez où trouver les backups
- [ ] Vous savez restaurer en cas de problème
- [ ] Vous avez ce guide sous la main
- [ ] Vous avez noté vos identifiants/config

---

## 🆘 CONTACTS D'URGENCE

### Ressources internes (votre système)
- **Backups automatiques :** `ContactSync_Backups` dans Drive
- **Logs système :** Apps Script → Exécutions
- **Code source :** Apps Script → Éditeur

### Ressources Google
- **Aide Contacts :** https://support.google.com/contacts
- **Aide Apps Script :** https://support.google.com/apps-script
- **Récupération compte :** https://support.google.com/accounts

### Documentation
- Ce guide de sécurité
- GUIDE_INSTALLATION.md
- RECAPITULATIF.md

---

## 💡 CONSEILS FINAUX

### Pour une tranquillité d'esprit maximale

1. **Les 7 premiers jours :** Mode surveillance renforcée
   - Vérifiez chaque rapport quotidien
   - Consultez vos contacts sur les deux comptes
   - Gardez vos sauvegardes manuelles

2. **Après 1 mois :** Mode normal
   - Scan rapide des rapports
   - Vérification mensuelle
   - Confiance dans le système

3. **Sauvegarde externe trimestrielle**
   - Tous les 3 mois
   - Export manuel Google CSV
   - Stockage hors ligne

### Le script est sûr SI

✅ Vous suivez ce guide de sécurité
✅ Vous gardez des sauvegardes externes
✅ Vous lisez les rapports d'erreur
✅ Vous testez en simulation avant gros changements

---

## ✅ GARANTIES

Ce que le script garantit :

✅ **Jamais de suppression automatique de contacts**
✅ **Sauvegarde avant chaque synchronisation**
✅ **Logs complets de toutes les opérations**
✅ **Résolution de conflits transparente (dernière modif)**
✅ **Validation des données avant traitement**
✅ **Notification par email de chaque synchronisation**
✅ **Possibilité de restauration à J-7**

Ce que le script NE garantit PAS :

⚠️ Protection contre une suppression manuelle par vous
⚠️ Résolution intelligente de conflits complexes
⚠️ Fusion automatique de contacts similaires
⚠️ Détection de corruptions Google-side

---

## 🎓 CONCLUSION

**Votre synchronisation est aussi sécurisée qu'elle peut l'être** pour une solution gratuite et automatisée.

**Niveau de sécurité : 8/10**

Points forts :
- Sauvegardes automatiques ✅
- Pas de suppression auto ✅
- Validations multiples ✅
- Traçabilité complète ✅

Point d'amélioration :
- Nécessite vigilance utilisateur ⚠️

**Recommandation finale :** Utilisez en confiance, mais gardez une sauvegarde manuelle externe mensuelle "au cas où".

---

**Questions ? Besoin de clarifications sur un aspect de sécurité ?**
