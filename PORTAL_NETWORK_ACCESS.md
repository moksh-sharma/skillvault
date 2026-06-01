# Portal network URLs (other PCs on same network)

Other devices on your **same Wi-Fi/LAN** can open the portals using your PC’s **network IP** and these ports.

---

## Network URLs (replace `YOUR_PC_IP` with your machine’s IP)

| Portal             | URL |
|--------------------|-----|
| **Guest**          | `http://YOUR_PC_IP:3005/guest` |
| **Freelancer**     | `http://YOUR_PC_IP:3006/freelancer` |
| **Company Employee** | `http://YOUR_PC_IP:3007/employee` |

**Example:** If your PC’s IP is `192.168.1.10`:
- Guest: `http://192.168.1.10:3005/guest`
- Freelancer: `http://192.168.1.10:3006/freelancer`
- Company Employee: `http://192.168.1.10:3007/employee`

---

## How to get your PC’s IP (Windows)

1. **PowerShell**
   ```powershell
   (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -match '^192\.|^10\.' }).IPAddress
   ```
   Use the first address shown (e.g. `192.168.1.10`).

2. **Command Prompt**
   ```cmd
   ipconfig
   ```
   Under your active adapter (e.g. **Wi-Fi** or **Ethernet**), find **IPv4 Address** (e.g. `192.168.1.10`).

3. **After running network portals**
   - Run: `.\start-portals.ps1`
   - The script detects your IP and prints the three URLs.
   - It also writes them to **`PORTAL_NETWORK_LINKS.txt`** in the project folder (with your IP already filled in).

---

## Requirements for network access

1. **Start portals in network mode**
   ```powershell
   .\start-portals.ps1
   ```
   (Do **not** use `.\start-portals-local.ps1` for other PCs; that binds only to localhost.)

2. **Backend**
   - Run `.\start-backend.ps1` so the API is available.
   - In backend `.env`, for CORS from other devices you may need: `CORS_ORIGINS=*` or include `http://YOUR_PC_IP:3005`, etc.

3. **Firewall**
   - Allow inbound TCP for ports **3005**, **3006**, **3007** (and **8000** if the backend is on this PC).

4. **Same network**
   - Other devices must be on the same LAN/Wi-Fi as the PC running the portals.
