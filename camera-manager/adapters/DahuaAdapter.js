const BaseAdapter = require('./BaseAdapter');
let koffi = null; // Lazy load

class DahuaAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.loginHandle = 0;
        this.lib = null;
        this.structs = {};
    }

    loadLibrary() {
        if (this.lib) return;
        try {
            // Lazy load Koffi
            try {
                koffi = require('koffi');
            } catch (kErr) {
                console.error('[DahuaAdapter] Koffi not found. Dahua support disabled.', kErr.message);
                throw kErr;
            }

            // Define Structs ONLY after Koffi is loaded
            if (!this.structs.NET_DEVICEINFO_Ex) {
                this.structs.NET_DEVICEINFO_Ex = koffi.struct('NET_DEVICEINFO_Ex', {
                    sSerialNumber: koffi.array('char', 48),
                    nAlarmInPortNum: 'int',
                    nAlarmOutPortNum: 'int',
                    nDiskNum: 'int',
                    nDVRType: 'int',
                    nChanNum: 'int',
                    byReserved: koffi.array('uint8_t', 520)
                });
            }

            // Updated to absolute path where the SDK was found
            const sdkPath = '/opt/dss-edge/dahua-sdk-temp/libs/lin64/libdhnetsdk.so';
            this.lib = koffi.load(sdkPath);

            // Define functions
            // bool CLIENT_Init(fDisConnect cbDisConnect, LDWORD dwUser);
            const DisConnectCallback = koffi.proto('void DisConnectCallback(long long lLoginID, const char *pchDVRIP, int nDVRPort, long long dwUser)');

            // CLIENT_Init - signature: int CLIENT_Init(fDisConnect cbDisConnect, LDWORD dwUser);
            this.CLIENT_Init = this.lib.func('CLIENT_Init', 'int', ['void *', 'long long']);

            // CLIENT_Cleanup - signature: void CLIENT_Cleanup();
            this.CLIENT_Cleanup = this.lib.func('CLIENT_Cleanup', 'void', []);

            // CLIENT_LoginEx2
            this.CLIENT_LoginEx2 = this.lib.func('CLIENT_LoginEx2', 'long long', [
                'const char *', 'uint16_t', 'const char *', 'const char *', 'int', 'void *', 'void *', 'int *'
            ]);

            // CLIENT_Logout
            this.CLIENT_Logout = this.lib.func('CLIENT_Logout', 'int', ['long long']);

            // CLIENT_GetLastError
            this.CLIENT_GetLastError = this.lib.func('CLIENT_GetLastError', 'uint32_t', []);

            // Init
            console.log('[DahuaSDK] Calling CLIENT_Init...');
            this.CLIENT_Init(null, 0);
            console.log('[DahuaSDK] Initialized (Koffi)');

        } catch (e) {
            console.error('[DahuaAdapter] Failed to load libdhnetsdk (Koffi):', e.message);
            // Do NOT throw if you want server to survive. 
            // But if we don't throw, calls to this.lib will fail.
            // Better to throw here so connection fails, but catch it in connect()
            throw e;
        }
    }

    async connect() {
        try {
            if (!this.lib) this.loadLibrary();
        } catch (e) {
            console.error(`[Dahua] CRITICAL: Library load failed for ${this.config.ip}: ${e.message}`);
            return false;
        }

        if (this.loginHandle && this.loginHandle > 0) return true;

        // Auto-fix Port for Dahua: Default 37777. 
        // If user entered 80 or 554, try 37777 first as it's the SDK port.
        let port = this.config.port || 37777;
        if (port === 80 || port === 554) {
            console.log(`[Dahua] User entered port ${port}. SDK usually needs 37777. Trying 37777...`);
            port = 37777;
        }

        try {
            const NET_DEVICEINFO_Ex = this.structs.NET_DEVICEINFO_Ex;
            const pDevInfo = koffi.alloc(NET_DEVICEINFO_Ex);
            const pErr = koffi.alloc('int');

            const handle = this.CLIENT_LoginEx2(
                this.config.ip,
                port,
                this.config.user,
                this.config.pass,
                0,
                null,
                pDevInfo,
                pErr
            );

            const handleNum = Number(handle);

            if (handleNum !== 0) {
                this.loginHandle = handleNum;
                this.connected = true;

                // Decode struct
                const devInfo = koffi.decode(pDevInfo, NET_DEVICEINFO_Ex);
                this.serial = String.fromCharCode(...devInfo.sSerialNumber).replace(/\0/g, '');
                this.channelCount = devInfo.nChanNum;
                this.dvrType = `Dahua Type ${devInfo.nDVRType}`;
                console.log(`[Dahua] Login Success: ${this.config.ip}:${port}. Handle: ${this.loginHandle}, Serial: ${this.serial}, Chans: ${this.channelCount}`);
                return true;
            } else {
                const errCode = koffi.decode(pErr, 'int');
                const lastErr = this.CLIENT_GetLastError();
                console.warn(`[Dahua] Login Failed: ${this.config.ip}:${port}. Handle: ${handleNum}, Err: ${errCode}, Last: 0x${lastErr.toString(16)}`);
                this.connected = false;
                return false;
            }
        } catch (e) {
            console.error(`[Dahua] Connect Exception for ${this.config.ip}: ${e.message}`);
            return false;
        }
    }

    async getStreamUri(channelId = '101') {
        const ch = parseInt(channelId) || 1;
        // Parse channel logic: '101' -> channel 1, '102' -> channel 1 (sub), '201' -> channel 2
        let channelIndex = 1;
        let subtype = 0;

        if (ch > 100) {
            // Hypothesis: 101 = ch1 main, 102 = ch1 sub. 201 = ch2 main...
            // Extract hundreds digit as channel? Warning: 101 could be channel 10, stream 1 in some schemas.
            // But usually in our system: 1xx -> Ch 1, 2xx -> Ch 2.
            const chStr = ch.toString();
            channelIndex = parseInt(chStr.substring(0, chStr.length - 2));
            const lastDigit = parseInt(chStr.substring(chStr.length - 1));
            subtype = (lastDigit === 2) ? 1 : 0;
        } else {
            channelIndex = ch; // Raw index
        }

        const safeUser = encodeURIComponent(this.config.user);
        const safePass = encodeURIComponent(this.config.pass);
        const model = (this.config.model || this.dvrType || "").toUpperCase();

        // --- RTSP LIBRARY (Dahua) ---
        // 1. Old DVRs / Non-standard
        if (model.includes("DVR") && model.includes("OLD")) {
            // Some very old Dahua DVRs use a different path
            // return `rtsp://${safeUser}:${safePass}@${this.config.ip}:554/live/main`; 
        }

        // 2. Standard Dahua (IPC / NVR / XVR) - This works for 99%
        return `rtsp://${safeUser}:${safePass}@${this.config.ip}:554/cam/realmonitor?channel=${channelIndex}&subtype=${subtype}`;
    }

    async getDeviceInfo() {
        return {
            manufacturer: 'Dahua',
            model: this.dvrType || 'Dahua Device',
            serial: this.serial || 'Unknown',
            channels: this.channelCount || 1,
            streams: {
                main: await this.getStreamUri('101'),
                sub: await this.getStreamUri('102')
            }
        };
    }

    async reboot() {
        // Implementation later
    }
}

module.exports = DahuaAdapter;
