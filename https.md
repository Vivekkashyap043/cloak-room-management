# Local HTTPS (mkcert) setup for cloak-room-management

Follow these steps in an elevated (Administrator) PowerShell to create a locally-trusted TLS certificate and configure the server to serve HTTPS on your LAN IP.

1) Install Chocolatey (if you don’t already have it)

Open PowerShell as Administrator and run:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force;
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
```

After install, close and re-open an elevated PowerShell.

2) Install mkcert

In Admin PowerShell:

```powershell
choco install mkcert -y
```

Verify:

```powershell
mkcert -version
```

3) Create and install a local CA (mkcert’s CA)

Still in Admin PowerShell:

```powershell
mkcert -install
```

This creates and installs a local CA into the Windows trust store for the machine where you ran the command.

4) Generate a certificate that includes the IP 192.168.56.1

Run (from any folder — it will create files in the current folder):

```powershell
cd D:\projects\clock-room-management\backend\cert
# generate cert + key named cert.pem and key.pem for the IP and localhost
mkcert -cert-file cert.pem -key-file key.pem 192.168.56.1 localhost 127.0.0.1
```

This produces:

- `cert.pem`
- `key.pem`

(files created in `backend/cert`). Those filenames match the examples used in `server.js`.

If mkcert prints different filenames, you can rename them to `cert.pem` and `key.pem`. Using the `-cert-file` / `-key-file` flags above ensures the correct names.

5) Make sure server reads those files

Your `server.js` should point to the cert folder paths, for example:

```javascript
const keyPath = path.join(__dirname, 'cert', 'key.pem');
const certPath = path.join(__dirname, 'cert', 'cert.pem');
```

(The repository already contains an HTTPS-capable `server.js` variant that reads cert paths via env vars; the example above shows using the cert folder directly.)

6) Open firewall for port 4000 (if needed)

In Admin PowerShell:

```powershell
netsh advfirewall firewall add rule name="CloakRoomBackend4000" dir=in action=allow protocol=TCP localport=4000 profile=Private
```

Also ensure the network profile for the Windows host is set to Private (not Public) so the rule applies.

---

After these steps you can start the backend (which serves the built frontend `frontend/dist`) and browse **https://192.168.56.1:4000** from devices on the same LAN. If the device trusts the mkcert CA, the browser will accept the certificate and getUserMedia (camera) will be allowed on that origin.

If a device does not trust the mkcert CA, either install/trust the CA on the device (mkcert docs), or use a temporary HTTPS tunnel (ngrok/localtunnel) for testing without device CA installation.
