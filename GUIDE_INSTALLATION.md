# 📘 GUIDE COMPLET : Synchronisation Automatique des Contacts Gmail

## 🎯 Ce que vous allez accomplir

À la fin de ce guide, vos contacts Gmail seront synchronisés automatiquement entre vos deux comptes, tous les jours, gratuitement et de manière permanente.

---

## 📋 ÉTAPE 1 : Créer votre projet Google Apps Script

### 1.1 Accéder à Google Apps Script

1. **Connectez-vous à votre COMPTE PRINCIPAL Gmail** (celui que vous utilisez le plus)
2. Allez sur : https://script.google.com
3. Cliquez sur **"Nouveau projet"** (bouton en haut à gauche)
4. Un éditeur de code s'ouvre avec un fichier vide `Code.gs`

### 1.2 Nommer votre projet

1. En haut à gauche, cliquez sur **"Projet sans titre"**
2. Renommez-le : **"Sync Contacts Gmail"**
3. Le nom sera sauvegardé automatiquement

---

## 📋 ÉTAPE 2 : Copier le code

### 2.1 Remplacer le code par défaut

1. Dans l'éditeur, vous voyez du code par défaut qui commence par `function myFunction()`
2. **Sélectionnez TOUT le code** (Ctrl+A ou Cmd+A)
3. **Supprimez-le** (touche Suppr)
4. **Copiez le code du fichier `ContactSync_Advanced.gs`** que je vous ai fourni
5. **Collez-le** dans l'éditeur (Ctrl+V ou Cmd+V)

### 2.2 Activer le service People API

1. Dans le panneau de gauche, cliquez sur **Services** (icône **+**)
2. Cherchez **People API** dans la liste
3. Cliquez sur **Ajouter**

> **⚠️ Sans cette étape, le script ne fonctionnera pas** (erreur "People is not defined").

### 2.3 Personnaliser la configuration

Trouvez cette section au début du code :

```javascript
const CONFIG = {
  COMPTE_SECONDAIRE: 'votre-email-secondaire@gmail.com',
  PREFIX_NOTES: '[SYNC]',
  DEBUG_MODE: true,
  LABEL_SYNC: 'Synchronisés',
  STRATEGIE_CONFLIT: 'merge',
  INCLURE_CONTACTS_SANS_EMAIL: true,
  SUPPRIMER_CONTACTS_VIDES: false,
  EMAIL_RAPPORT: null
};
```

**Modifiez les lignes suivantes :**

1. **`COMPTE_SECONDAIRE`** (OBLIGATOIRE) :
   - Remplacez `'votre-email-secondaire@gmail.com'` par l'adresse de votre second compte
   - Exemple : `'mon.autre.email@gmail.com'`

2. **`EMAIL_RAPPORT`** (recommandé) :
   - Adresse où recevoir les rapports de synchronisation
   - Mettez une adresse `@gmail.com` pour éviter les blocages DMARC
   - Exemple : `EMAIL_RAPPORT: 'votre-nom@gmail.com'`
   - Si `null`, utilise l'email du compte actif (peut être bloqué par DMARC sur les domaines personnalisés)

- **IMPORTANT : Gardez les guillemets !**

### 2.4 Sauvegarder

1. Cliquez sur l'icône **disquette** 💾 (ou Ctrl+S)
2. Le code est maintenant sauvegardé !

---

## 📋 ÉTAPE 3 : Tester le script

### 3.1 Premier test simple

1. Dans le menu déroulant en haut (à côté du bouton ▶️), sélectionnez : **`simulerSynchronisation`**
2. Cliquez sur le bouton **Exécuter** ▶️
3. **PREMIÈRE FOIS UNIQUEMENT** : Une fenêtre d'autorisation apparaît

### 3.2 Accorder les autorisations (IMPORTANT)

Lors de la première exécution, Google vous demandera des autorisations :

1. Cliquez sur **"Vérifier les autorisations"**
2. Sélectionnez votre compte Gmail principal
3. Vous verrez : "Google n'a pas vérifié cette application"
   - Cliquez sur **"Options avancées"** (en bas à gauche)
   - Cliquez sur **"Accéder à Sync Contacts Gmail (non sécurisé)"**
4. Cliquez sur **"Autoriser"**

**Pourquoi ce message ?**
Google affiche cet avertissement car c'est VOTRE script personnel. C'est normal et sans danger - vous vous autorisez vous-même à accéder à vos propres contacts.

### 3.3 Vérifier les résultats du test

1. Après l'exécution, cliquez sur **"Journal d'exécution"** (en bas de l'écran)
2. Vous devriez voir :
   ```
   === MODE SIMULATION (AUCUNE MODIFICATION) ===
   ...
   === RÉSUMÉ SIMULATION ===
   Ajouts prévus: XX
   Modifications prévues: XX
   ```

✅ **Si vous voyez cela, le script fonctionne !**

---

## 📋 ÉTAPE 4 : Activer la synchronisation automatique

### 4.1 Configurer le déclencheur

1. Dans le menu déroulant, sélectionnez : **`configurerSyncDrive`**
2. Cliquez sur **Exécuter** ▶️
3. Attendez quelques secondes

### 4.2 Vérifier que c'est activé

1. Dans le menu de gauche, cliquez sur l'icône **⏰ Déclencheurs** (horloge)
2. Vous devriez voir une ligne avec :
   - Fonction : `syncViaGoogleDrive`
   - Type d'événement : `Déclencheur temporel`
   - Fréquence : `Quotidien`

✅ **C'est fait ! La synchronisation automatique est activée**

### 4.3 Email de confirmation

Vous recevrez un email sur votre compte principal avec le sujet :
**"✅ Synchronisation automatique activée"**

---

## 📋 ÉTAPE 5 : Configuration du compte secondaire (OBLIGATOIRE)

⚠️ **ATTENTION : Cette étape est cruciale pour la synchronisation bidirectionnelle**

Pour que le script puisse accéder à votre compte secondaire, nous devons utiliser l'API Google People.

### 5.1 Activer l'API Google People

1. Dans Google Apps Script, cliquez sur l'icône **⚙️ Services** (roue dentée à gauche)
2. Cliquez sur **"+ Ajouter un service"**
3. Cherchez **"People API"** dans la liste
4. Sélectionnez-la et cliquez sur **"Ajouter"**

### 5.2 Obtenir l'accès au compte secondaire

**MÉTHODE RECOMMANDÉE : Délégation Gmail**

Pour simplifier (car l'API People nécessite OAuth complexe), je recommande plutôt cette approche :

1. **Connectez-vous à votre COMPTE SECONDAIRE**
2. Allez dans **Paramètres Gmail** → **Comptes et importation**
3. Dans la section **"Accorder l'accès à votre compte"**, cliquez sur **"Ajouter un autre compte"**
4. Entrez l'adresse de votre **compte principal**
5. Suivez les étapes de vérification

Cela permettra à votre compte principal d'accéder aux contacts du secondaire.

---

## 🎛️ PERSONNALISATION AVANCÉE (Optionnel)

### Changer la fréquence de synchronisation

Par défaut : quotidien à 3h du matin.

Pour modifier :

1. Ouvrez le code
2. Trouvez la fonction `configurerSyncDrive()`
3. Modifiez cette partie :

```javascript
// Pour synchroniser toutes les heures :
ScriptApp.newTrigger('syncViaGoogleDrive')
  .timeBased()
  .everyHours(1)
  .create();

// Pour synchroniser toutes les 6 heures :
ScriptApp.newTrigger('syncViaGoogleDrive')
  .timeBased()
  .everyHours(6)
  .create();

// Pour synchroniser tous les lundis à 9h :
ScriptApp.newTrigger('syncViaGoogleDrive')
  .timeBased()
  .onWeekDay(ScriptApp.WeekDay.MONDAY)
  .atHour(9)
  .create();
```

4. Sauvegardez et réexécutez `configurerSyncDrive`

---

## 🔍 DÉPANNAGE

### Le script ne s'exécute pas

**Vérifiez :**
1. Que vous avez bien autorisé le script (Étape 3.2)
2. Que le déclencheur est activé (Étape 4.2)
3. Les logs d'exécution pour voir les erreurs

**Pour voir les logs :**
- Menu de gauche → **Exécutions** (icône 📋)
- Cliquez sur une exécution pour voir les détails

### Message d'erreur "Exception: Service invoked too many times"

**Solution :** Vous avez atteint la limite quotidienne Google (100 000 opérations).
- Réduisez la fréquence de synchronisation
- Attendez 24h pour la réinitialisation du quota

### Les contacts ne se synchronisent pas

**Vérifiez :**
1. Que les contacts ont bien des adresses email (obligatoire)
2. Que vous avez configuré l'accès au compte secondaire (Étape 5)
3. Les emails de rapport pour voir le nombre de contacts traités

### Je ne reçois pas d'emails de rapport

**Cause la plus fréquente : blocage DMARC**

Si votre compte utilise un domaine personnalisé (ex: `@entreprise.fr`), les emails envoyés par Google Apps Script peuvent être bloqués par la politique DMARC de votre domaine.

**Solution :** Configurez `EMAIL_RAPPORT` avec une adresse `@gmail.com` :
```javascript
EMAIL_RAPPORT: 'votre-nom@gmail.com'
```

**Autres vérifications :**
1. Votre dossier spam
2. Que les notifications Gmail sont activées
3. Les logs d'exécution (le contenu du rapport y est affiché même si l'email échoue)

---

## 📊 SURVEILLANCE

### Rapports automatiques

Vous recevrez un email après chaque synchronisation avec :
- Nombre total de contacts traités
- Contacts ajoutés
- Contacts modifiés
- Contacts supprimés

### Consulter l'historique

1. Dans Google Apps Script → **Exécutions**
2. Vous verrez toutes les synchronisations passées
3. Cliquez sur une ligne pour voir les détails et logs

---

## ⚠️ LIMITATIONS À CONNAÎTRE

### Quotas Google gratuits

- **100 000** opérations/jour sur l'API Contacts
- Largement suffisant pour la plupart des utilisateurs
- Si dépassé, la synchronisation reprendra le lendemain

### Délai de synchronisation

- La synchronisation n'est pas instantanée
- Selon votre configuration : de 1h à 24h de délai
- Pour une synchronisation immédiate, exécutez manuellement `syncViaGoogleDrive`

### Conflits

- En cas de modification simultanée d'un contact sur les deux comptes
- Le script garde la version la plus récente (dernière modification)

---

## 🔒 SÉCURITÉ ET CONFIDENTIALITÉ

### Vos données restent privées

- Le script s'exécute uniquement sur VOTRE compte Google
- Aucune donnée n'est envoyée à des tiers
- Le code est open-source et visible par vous

### Révoquer l'accès

Si vous souhaitez arrêter la synchronisation :

1. Google Apps Script → **Déclencheurs**
2. Cliquez sur les **...** à droite
3. **Supprimer le déclencheur**

Ou supprimez complètement le projet Apps Script.

---

## 📞 BESOIN D'AIDE ?

Si vous rencontrez des problèmes :

1. **Consultez les logs** : Menu Exécutions dans Apps Script
2. **Vérifiez les emails de rapport** : ils contiennent des informations utiles
3. **Réexécutez le test** : Fonction `simulerSynchronisation` pour diagnostiquer

---

## ✅ CHECKLIST FINALE

Avant de fermer ce guide, vérifiez que :

- [ ] Le projet Apps Script est créé et nommé
- [ ] Le code est copié et personnalisé (email secondaire)
- [ ] Le script a été testé avec succès (`simulerSynchronisation`)
- [ ] Le déclencheur automatique est configuré
- [ ] Vous avez reçu l'email de confirmation
- [ ] L'accès au compte secondaire est configuré
- [ ] Vous savez où consulter les logs et rapports

---

## 🎉 FÉLICITATIONS !

Vos contacts Gmail se synchronisent maintenant automatiquement !

**Prochaines étapes suggérées :**
- Attendez 24-48h et vérifiez les emails de rapport
- Testez en créant un contact sur un compte et en vérifiant qu'il apparaît sur l'autre
- Ajustez la fréquence de synchronisation selon vos besoins

**Profitez de votre synchronisation automatique et gratuite !** 🚀
