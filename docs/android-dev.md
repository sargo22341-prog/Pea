# Test Android local

Ce mode sert a tester l'APK debug contre le backend lance sur Windows, sans push Docker ni deploiement production.

## Principe

- Le backend local ecoute sur `0.0.0.0`, donc il est accessible depuis le reseau local.
- L'APK Android autorise les URLs `http://...` pour le self-hosting local/LAN, y compris en release.
- HTTPS avec un certificat public valide reste recommande pour un usage quotidien.
- Les certificats HTTPS invalides sont acceptes uniquement pour l'hote du backend configure ; les autres hotes restent soumis a la validation Android normale.

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

Utilisez Java 21 ou plus recent (le JBR fourni avec Android Studio convient), ainsi que le SDK Android 37. Si `java -version` indique Java 17, selectionnez le JBR avant le build dans PowerShell :

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
```

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
https://pea.home
```

Pour l'hote du backend configure, l'app accepte aussi les certificats auto-signes, expires ou dont le nom ne correspond pas. Cette exception native remplace l'hote precedent lorsque vous changez de serveur. Elle reduit la protection contre l'interception : privilegiez un certificat public valide. Les autres hotes conservent la validation normale des certificats.
