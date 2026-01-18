class BaseAdapter {
    constructor(config) {
        this.config = config;
        this.connected = false;
    }

    /**
     * Connect to the device (verify login)
     * @returns {Promise<boolean>}
     */
    async connect() {
        throw new Error('Method connect() must be implemented');
    }

    /**
     * Get the RTSP URI for the main stream (or specified channel)
     * @param {string} channelId
     * @returns {Promise<string>}
     */
    async getStreamUri(channelId = '101') {
        throw new Error('Method getStreamUri() must be implemented');
    }

    /**
     * Get device status (health check)
     * @returns {Promise<object>} { online: boolean, status: string, ... }
     */
    async getStatus() {
        throw new Error('Method getStatus() must be implemented');
    }

    /**
     * Reboot the device
     */
    async reboot() {
        throw new Error('Method reboot() must be implemented');
    }

    /**
     * Listen for events (motion, etc.)
     * @param {function} callback
     */
    async listenEvents(callback) {
        throw new Error('Method listenEvents() must be implemented');
    }

    /**
     * Get device information (model, channels, etc.)
     * @returns {Promise<object>}
     */
    async getDeviceInfo() {
        return { manufacturer: this.config.manufacturer };
    }

    /**
     * Apply configuration to the physical device (VMS style)
     * @param {object} config 
     */
    async applyDeviceConfig(config) {
        throw new Error('Method applyDeviceConfig() must be implemented');
    }
}

module.exports = BaseAdapter;
