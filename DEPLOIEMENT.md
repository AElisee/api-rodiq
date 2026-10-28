# Déploiement de l'API RODIQ sur LWS

Workflow pour mettre `api-rodiq` (NestJS 12 + MySQL) en ligne sur LWS et le brancher au front `ui-rodiq`.

> **Note** : l'API a besoin de **Node.js** côté serveur. Un hébergement PHP seul ne suffit pas : il faut un **VPS** LWS, ou un **mutualisé cPanel avec « Setup Node.js App »**.

---

## 0. Informations à réunir

| Élément | Exemple | Statut |
| --- | --- | --- |
| Type d'offre LWS | VPS / cPanel | ☐ |
| Accès serveur | IP + user SSH (VPS) ou URL + identifiants cPanel | ☐ |
| Domaine de l'API | `api.rodiq.ci` | ☐ |
| Domaine du front | `rodiq.ci` (LWS ou Vercel) | ☐ |
| Base MySQL | hôte, port, nom, user, mot de passe | ☐ |

> Après la mise en ligne, changer les mots de passe qui ont circulé (panel, SSH, MySQL).

---

## 1. Préparer le code avant la mise en ligne

### 1.1 Création des tables en production

`synchronize` est désactivé quand `NODE_ENV=production` et il n'existe **aucune migration** : sans action, les tables ne seront pas créées.

Choisir une option :

- **Recommandée : migrations TypeORM.**
  1. Ajouter un `data-source.ts` (même config que `app.module.ts`).
  2. Générer la migration initiale depuis une base vide : `typeorm migration:generate src/migrations/Init`.
  3. Mettre `migrations: [...]` et `migrationsRun: true` dans la config TypeORM.
- **Rapide, à usage unique** : démarrer une première fois avec `NODE_ENV=development` sur la base de prod pour créer les tables, puis repasser en `production`. À éviter dès qu'il y a des données réelles.

### 1.2 Cookies de session et CORS

- `FRONT_URL` doit être l'URL exacte du front, par exemple `https://rodiq.ci` (sans slash final).
- Les cookies sont en `sameSite: 'lax'` et `secure` en production (`src/auth/sessions/sessions.service.ts`) :
  - front et API sur le **même domaine parent** (`rodiq.ci` + `api.rodiq.ci`) : rien à changer ;
  - **domaines différents** (par exemple front sur `*.vercel.app`) : passer à `sameSite: 'none'` (HTTPS obligatoire).
- L'API **doit** être servie en HTTPS, sinon les cookies `secure` ne sont pas posés.

### 1.3 Proxy

Derrière Nginx ou Passenger, définir dans `.env` le nombre de proxys placés devant l'API :

```bash
TRUST_PROXY=1
```

Sans ce réglage, l'API voit l'adresse du proxy à la place de celle du visiteur : le rate-limit (`ThrottlerGuard`) traiterait tout le monde comme une seule adresse, et le compteur de visites ne compterait qu'**un visiteur par jour et par navigateur**. Ne pas le définir sans proxy : l'en-tête `X-Forwarded-For` serait alors falsifiable.

### 1.4 Vérifier le build en local

```bash
pnpm install
pnpm run lint
pnpm run build        # produit dist/
```

---

## 2. Base de données MySQL

1. Dans le panel LWS : créer la base et un utilisateur dédié avec tous les droits **sur cette base uniquement**.
2. Noter l'hôte : `localhost` sur un VPS, ou l'hôte MySQL fourni par LWS sur un mutualisé.
3. Tester la connexion : `mysql -h <hôte> -u <user> -p <base>`.

---

## 3A. Déploiement sur VPS LWS (SSH)

### 3A.1 Accès et sécurité

```bash
# En local : créer une clé et l'installer sur le serveur
ssh-keygen -t ed25519
ssh-copy-id <user>@<ip>
```

Sur le serveur :

```bash
apt update && apt upgrade -y
adduser rodiq && usermod -aG sudo rodiq        # ne pas déployer en root
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
```

### 3A.2 Installer les outils

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs nginx git mysql-server certbot python3-certbot-nginx
sudo corepack enable                          # pnpm
sudo npm i -g pm2
sudo mysql_secure_installation               # si MySQL est sur le VPS
```

### 3A.3 Récupérer et construire le code

```bash
cd /home/rodiq
git clone <url-du-repo> api-rodiq && cd api-rodiq
pnpm install --frozen-lockfile
pnpm run build
```

> `argon2` est un module natif : s'il ne compile pas, installer `build-essential` et `python3`.

### 3A.4 Fichier `.env` de production

```env
NODE_ENV=production
PORT=3001

DB_HOST=localhost
DB_PORT=3306
DB_NAME=rodiq
DB_USER=rodiq
DB_PASSWORD=<mot de passe fort>

FRONT_URL=https://rodiq.ci
# Nombre de proxys devant l'API (voir 1.3)
TRUST_PROXY=1

ADMIN_EMAIL=<email admin>
ADMIN_PASSWORD=<mot de passe fort>
```

```bash
chmod 600 .env
```

### 3A.5 Lancer avec PM2

```bash
pm2 start dist/main.js --name api-rodiq
pm2 save
pm2 startup        # exécuter la commande affichée pour le redémarrage auto
```

### 3A.6 Nginx en reverse proxy

`/etc/nginx/sites-available/api-rodiq` :

```nginx
server {
    server_name api.rodiq.ci;
    client_max_body_size 2m;   # logos en data URL (limite JSON de 1 Mo)

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/api-rodiq /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 3A.7 DNS et HTTPS

1. Dans la zone DNS LWS : ajouter un enregistrement **A** `api` vers l'IP du VPS.
2. Une fois le DNS propagé :

```bash
sudo certbot --nginx -d api.rodiq.ci
```

---

## 3B. Déploiement sur mutualisé cPanel LWS

1. **DNS / sous-domaine** : créer `api.rodiq.ci` dans cPanel (Domaines), puis activer SSL (AutoSSL / Let's Encrypt).
2. **Envoyer le code** : `git pull` dans cPanel (Git Version Control), ou upload de `dist/`, `package.json` et `pnpm-lock.yaml`. Ne pas envoyer `node_modules`.
3. **Setup Node.js App** :
   - Node version : la plus récente proposée (≥ 20) ;
   - Application root : `api-rodiq` ;
   - Application URL : `api.rodiq.ci` ;
   - Startup file : `dist/main.js` ;
   - variables d'environnement : celles du `.env` de la section 3A.4 (le `PORT` est imposé par Passenger, ne pas le fixer).
4. **Installer les dépendances** : bouton « Run NPM Install », ou en terminal SSH (`source <venv>/bin/activate && npm install --omit=dev`).
5. **Redémarrer** l'application depuis l'interface.

> Limite : le `argon2` natif peut échouer sur certains mutualisés. Dans ce cas, le VPS est la seule option fiable.

---

## 4. Vérifications

```bash
curl -I https://api.rodiq.ci/api/parametres          # 404 tant que POST /admin/parametres n'est pas fait, sinon 200
curl https://api.rodiq.ci/api/docs-json | head -c 200
```

- [ ] Swagger accessible sur `https://api.rodiq.ci/api/docs`
- [ ] Connexion admin (`POST /api/admin/auth/sign-in`) qui pose le cookie `rodiq_admin_session`
- [ ] Création des réglages initiaux : `POST /api/admin/parametres`
- [ ] Logs propres : `pm2 logs api-rodiq` (VPS) ou les logs de l'app (cPanel)

> À trancher : exposer ou non Swagger en production (le restreindre ou le désactiver si l'API est publique).

---

## 5. Brancher le front (`ui-rodiq`)

1. Variable d'environnement du front :

   ```env
   NEXT_PUBLIC_API_URL=https://api.rodiq.ci/api
   ```

2. Tous les appels avec les cookies :

   ```ts
   fetch(`${process.env.NEXT_PUBLIC_API_URL}/parametres`, { credentials: 'include' });
   ```

3. Vérifier dans le navigateur : pas d'erreur CORS, cookie de session présent après connexion (onglet Application → Cookies).

---

## 6. Mises à jour (redéploiement)

VPS :

```bash
cd /home/rodiq/api-rodiq
git pull
pnpm install --frozen-lockfile
pnpm run build
pm2 restart api-rodiq
```

cPanel : `git pull`, puis Run NPM Install si des dépendances ont changé, puis Restart.

---

## 7. Sauvegardes

- Activer les sauvegardes LWS si l'offre les propose.
- Sinon, un `mysqldump` quotidien en cron (VPS) :

  ```bash
  0 3 * * * mysqldump -u rodiq -p'<mdp>' rodiq | gzip > /home/rodiq/backups/rodiq-$(date +\%F).sql.gz
  ```
