# Test Android local

Ce mode sert a tester l'APK debug contre le backend lance sur Windows, sans push Docker ni deploiement production.

## Principe

- Le backend local ecoute sur `0.0.0.0`, donc il est accessible depuis le reseau local.
- L'APK Android autorise les URLs `http://...` pour le self-hosting local/LAN, y compris en release.
- HTTPS avec un certificat public valide reste recommande pour un usage quotidien.
- Si vous utilisez un certificat auto-signe, installez le certificat racine dans Android : l'APK fait confiance aux certificats systeme et utilisateur Android, sans bypass SSL natif.

## Trouver l'IP Windows

Dans PowerShell :

```powershell
ipconfig
```

Reperez l'adresse IPv4 de l'interface Wi-Fi ou Ethernet utilisee par le telephone, par exemple :

```text
IPv4 Address . . . . . . . . . . . : 192.168.1.42
```

## Lancer le backend local

Depuis la racine du projet :

```powershell
npm run dev:backend
```

Le backend logue maintenant les URLs LAN disponibles, par exemple :

```text
localNetworkUrls: ["http://192.168.1.42:4000"]
```

Si vous lancez toute l'app en dev :

```powershell
npm run dev
```

Le backend reste disponible sur le port `4000`.

## Verifier depuis le telephone

Le telephone Android doit etre sur le meme Wi-Fi que Windows.

Depuis le navigateur du telephone, ouvrez :

```text
http://192.168.1.42:4000/api/health
```

La reponse attendue est :

```json
{"ok":true}
```

Si cela ne repond pas :

- verifiez que Windows et le telephone sont sur le meme reseau ;
- verifiez que le pare-feu Windows autorise le port `4000` ;
- verifiez que l'IP choisie est bien celle de l'interface reseau active.

## Builder et installer l'APK debug

```powershell
npm run build:android -w frontend
cd frontend/android
.\gradlew.bat assembleDebug
```

APK genere :

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Installation USB :

```powershell
%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe install -r frontend\android\app\build\outputs\apk\debug\app-debug.apk
```

## Configurer l'app Android

Au premier lancement, saisissez l'URL du serveur local :

```text
http://192.168.1.42:4000
```

L'app testera automatiquement :

```text
http://192.168.1.42:4000/api/health
```

Puis utilisera :

```text
http://192.168.1.42:4000/api/...
```

## Points a tester

- Login APK local
- Reconnexion APK local
- Dashboard
- Refresh marche
- SSE marche
- Images de profil
- Changement d'URL serveur dans les parametres

## HTTP local et certificats Android

HTTP est accepte par l'APK pour les serveurs self-hosted locaux, par exemple `http://192.168.1.42:4000` ou `http://mon-nas.local:4000`.

Pour un serveur expose durablement, utilisez HTTPS avec un certificat public valide, par exemple :

```text
https://pea.nas.home
```

Si votre serveur HTTPS utilise un certificat auto-signe ou une autorite interne, installez le certificat racine correspondant dans les certificats utilisateur Android. L'app acceptera alors ce certificat via la configuration reseau Android, sans option "desactiver SSL".
