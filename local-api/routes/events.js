const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

// In-memory cache or file read (Mock for MVP)
router.get("/recent", (req, res) => {
    try {
        const logPath = path.join(__dirname, "../../events.log");
        if (fs.existsSync(logPath)) {
            const data = fs.readFileSync(logPath, "utf8");
            const events = JSON.parse(data);
            // Return top 10
            res.json(events.slice(0, 10));
        } else {
            res.json([]);
        }
    } catch (e) {
        console.error(e);
        res.json([]);
    }
});

module.exports = router;
