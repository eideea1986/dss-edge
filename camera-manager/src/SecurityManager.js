const armingLogic = require('../armingLogic');

class SecurityManager {
    /**
     * Verifică dacă o cameră este armată în momentul actual conform orarului.
     */
    isCameraArmed(camId) {
        // În viitor aici putem adăuga logica de "Global Arming" Toggle (Home/Away mode)
        return armingLogic.isArmed(camId);
    }

    /**
     * Obține starea curentă a tuturor camerelor pentru UI.
     */
    getGlobalArmingStatus() {
        // Logică pentru a returna un obiect { camId: true/false }
        return {};
    }
}

module.exports = new SecurityManager();
