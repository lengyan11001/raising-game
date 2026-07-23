# New Site 1 Deploy Notes

## Fixed Target

New site 1 must deploy only to the new server.

- Domain: `https://mystockmarket.top`
- Host: `47.76.175.249`
- Remote root: `/opt/raising-game-cloudtoken`
- Systemd service: `raising-game-cloudtoken`
- Runtime env file: `/etc/raising-game-cloudtoken.env`
- Health check: `https://mystockmarket.top/api/health`

Do not deploy new site 1 to the retired server `8.210.186.75`.

## Git Pull Deploy

Deploy by Git pull on the server. Do not use `scp` or manual file copying.

Recommended local flow:

```powershell
git status --short
git push origin main
$env:DEPLOY_SSH_PASSWORD = "<server-root-password>"
python .\scripts\deploy_pull.py
```

Equivalent server-side flow:

```bash
cd /opt/raising-game-cloudtoken
git fetch origin main
git checkout main
git reset --hard origin/main
systemctl restart raising-game-cloudtoken
curl -sS https://mystockmarket.top/api/health
```

Runtime configuration, database state, logs, uploaded assets, and generated
outputs stay on the server and must not be overwritten by deployment.

## Verification

After every deploy, verify:

```powershell
Invoke-RestMethod https://mystockmarket.top/api/health
(Invoke-WebRequest -Uri 'https://mystockmarket.top/admin.html' -UseBasicParsing).Content |
  Select-String 'admin\.js\?v=adm-[0-9]+' -AllMatches
Invoke-RestMethod https://mystockmarket.top/api/config/pricing
```
