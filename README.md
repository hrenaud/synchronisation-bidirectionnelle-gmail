# 📘 SYNCHRONISATION CONTACTS GMAIL

**Solution gratuite pour synchroniser bidirectionnellement vos contacts entre deux comptes Gmail, avec fusion intelligente et zéro perte de données.**

---

## ✨ FONCTIONNALITÉS

✅ **Synchronisation bidirectionnelle** — Fusion intelligente sans écrasement  
✅ **Aucune perte de données** — TOUS les champs préservés (25 champs People API)  
✅ **Détection de doublons** — Fusionne automatiquement les contacts dupliqués  
✅ **Contacts sans email** — Synchronise aussi les contacts avec téléphone uniquement  
✅ **Adresses multiples** — Toutes conservées (Domicile, Travail, Vacances, etc.)  
✅ **Photos de contacts** — Copiées automatiquement si manquantes  
✅ **Groupes de contacts** — Labels synchronisés et mappés d'un compte à l'autre  
✅ **Sécurité maximale** — Sauvegardes automatiques quotidiennes (7 jours d'historique)  
✅ **Gestion du temps** — Reprise automatique si dépassement du temps d'exécution  
✅ **Logs complets** — Visibilité totale sur ce qui change  

---

## 🚀 DÉMARRAGE EN 30 MIN

1. **Lire** → [GUIDE_INSTALLATION.md](GUIDE_INSTALLATION.md) (pas à pas)
2. **Installer** → Script sur les DEUX comptes Gmail
3. **Configurer** → Emails secondaires dans Propriétés du script
4. **Tester** → `simulerSynchronisation()` pour voir ce qui changerait
5. **Activer** → `configurerSyncDrive()` sur les deux comptes

**Prêt !** La synchronisation est maintenant automatique.

---

## 📋 FICHIERS

| Fichier | Contenu |
|---------|---------|
| **ContactSync_Advanced.gs** | ⭐ Script principal à installer |
| **GUIDE_INSTALLATION.md** | Installation pas à pas |
| **TEST_COVERAGE.md** | Couverture des tests (33 tests, tous réussis) |

---

## 🏗️ COMMENT ÇA MARCHE

### Fusion Intelligente (Pas d'Écrasement)

**Exemple :**
```
Compte A: "Marie" (sans nom de famille) + téléphone
Compte B: "Marie Dupond" + email

Résultat traditionnel ❌ : "Marie" (perte du nom)
Résultat notre code ✅  : "Marie Dupond" avec tous les tels/emails
```

**Logique :**
- ✅ Garde le prénom/nom le **plus complet**
- ✅ **Ajoute** tous les téléphones sans créer de doublons
- ✅ **Ajoute** tous les emails sans créer de doublons
- ✅ **Ajoute** toutes les adresses, organisations, notes
- ✅ Jamais d'écrasement, jamais de perte

### Détection de Doublons (Même Compte)

**Exemple :**
```
Votre compte a 3 fois "marie@gmail.com" :
  Contact 1: marie@gmail.com (ancien)
  Contact 2: marie.dupond@gmail.com (oublié)
  Contact 3: Marie Dupond (nouveau)

Résultat ✅ : 1 seul contact "Marie Dupond" 
             avec tous les emails combinés
```

**Détection par :**
- Email exact
- Téléphone (même format différent : `06 12 34 56 78` = `0612345678`)
- Nom (case-insensitive)

### Contacts Sans Email

**Supportés :**
```
✅ Email + Téléphone
✅ Email uniquement
✅ Téléphone uniquement (NOUVEAU)
✅ Nom complet uniquement

❌ Complètement vide → ignoré
```

**Normalisation des téléphones :**
```
06 12 34 56 78     → +33612345678
0033612345678      → +33612345678
(206) 555-0101     → +2065550101
+33 6 12 34 56 78  → +33612345678

→ Identifiés comme identiques, doublons détectés
```

---

## ⚙️ CONFIGURATION

**Premier lancement :**
```javascript
// Exécuter une seule fois
configurerCompte()
```

Puis vérifier dans **Paramètres du projet** → **Propriétés du script** :
- `COMPTE_SECONDAIRE` : email de l'autre compte
- `EMAIL_RAPPORT` : email pour les rapports (recommandé : `@gmail.com`)
- `COMPTE_PRO` : `'true'` pour Workspace (28 min), `'false'` pour gratuit (5 min)

**Fonctions principales :**
```javascript
simulerSynchronisation()      // Mode test (aucune modif)
syncViaGoogleDrive()          // Synchronisation manuelle
configurerSyncDrive()         // Activation automatique quotidienne
creerSauvegardeSecurite()     // Sauvegarde manuelle
restaurerDepuisSauvegarde()   // Récupération d'une sauvegarde
```

---

## 📊 CE QUI EST SYNCHRONISÉ

**TOUS les 25 champs People API :**

| Catégorie | Champs | Fusion |
|-----------|--------|--------|
| **Identité** | Prénoms, noms, photos | Plus complet |
| **Contact** | Emails, téléphones, adresses | Tous conservés |
| **Professionnel** | Organisations, postes | Tous conservés |
| **Personnel** | Anniversaires, notes | Plus complet + fusion |
| **Autres** | Surnoms, relations, événements, URLs, IM, champs perso | Tous fusionnés |

---

## 🔒 SÉCURITÉ & SAUVEGARDES

### Garanties
✅ **Aucun tiers** — Tout reste dans votre Google Drive  
✅ **Données chiffrées** — Google chiffre tout nativement  
✅ **Sauvegardes automatiques** — 1 par jour, 7 jours d'historique  
✅ **Pas de suppression** — Aucun contact n'est jamais supprimé  
✅ **Validation des données** — Vérification avant synchronisation  
✅ **Erreurs isolées** — Un contact en erreur n'arrête pas la sync  
✅ **Restauration possible** — Fonction `restaurerDepuisSauvegarde()`  

### Sauvegarde
- **Location** : Dossier `ContactSync_Backups` dans Google Drive
- **Fréquence** : 1 max par jour
- **Rétention** : 7 dernières (= 7 jours)
- **Format** : JSON complet, lisible

---

## 🛠️ DÉPANNAGE

| Problema | Solution |
|----------|----------|
| Pas d'email | Mettre EMAIL_RAPPORT en `@gmail.com` |
| Trop lent | Augmenter fréquence sync (compte gratuit) |
| Contacts inchangés | Normal (optimisation), zéro appel API |
| Quota dépassé | Attendre 24h, réduire fréquence |

**Logs détaillés :** Apps Script → Exécutions

---

## ⚡ À RETENIR

**Forces**
- ✅ Gratuit
- ✅ Fusion intelligente (zéro perte)
- ✅ Sauvegardes automatiques
- ✅ Transparent

**Limitations**
- ⚠️ Installe sur 2 comptes
- ⚠️ Pas instantané
- ⚠️ 100k ops/jour max (largement suffisant)

**Parfait pour**
- Fusionner contacts perso/pro
- Migration entre comptes
- Nettoyage de doublons
- Backup automatique

---

**Prêt ? → [GUIDE_INSTALLATION.md](GUIDE_INSTALLATION.md)**

**Questions ?** Voir [TEST_COVERAGE.md](TEST_COVERAGE.md) (tests, architecture)
