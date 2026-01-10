const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const usersPath = path.join(__dirname, "../../config/users.json");

// Minimal default admin - will be ensured on startup by server.js logic too
const DEFAULT_ADMIN = {
    username: "admin",
    password: "DSS2025",
    role: "admin",
    id: "admin_default"
};

function getUsers() {
    try {
        if (!fs.existsSync(usersPath)) {
            return [DEFAULT_ADMIN];
        }
        return JSON.parse(fs.readFileSync(usersPath, "utf8"));
    } catch (e) {
        return [DEFAULT_ADMIN];
    }
}

function saveUsers(users) {
    // Ensure dir exists
    const dir = path.dirname(usersPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

// POST /auth/login
router.post("/login", (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users.find(u => u.username === username && u.password === password);

    if (user) {
        // Return simple token/user info (Prototype: No JWT yet, just success)
        res.json({ success: true, user: { username: user.username, role: user.role } });
    } else {
        res.status(401).json({ error: "Invalid credentials" });
    }
});

// GET /auth/users
router.get("/users", (req, res) => {
    const users = getUsers();
    // Return sanitized list, incl. menus
    res.json(users.map(u => ({
        username: u.username,
        role: u.role,
        id: u.id || u.username,
        menus: u.menus || [] // Granular permissions
    })));
});

// POST /auth/users (Add User)
router.post("/users", (req, res) => {
    const { username, password, role, menus } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Missing fields" });

    const users = getUsers();
    if (users.find(u => u.username === username)) {
        return res.status(409).json({ error: "User already exists" });
    }

    const newUser = {
        id: Date.now().toString(),
        username,
        password, // stored as plain text per requirements phase
        role: role || "operator",
        menus: menus || [] // Default menus
    };

    users.push(newUser);
    saveUsers(users);
    res.json({ success: true, user: { username, role } });
});

// PUT /auth/users/:id (Update User)
router.put("/users/:id", (req, res) => {
    const { id } = req.params;
    const { password, role, menus } = req.body;

    let users = getUsers();
    const userIdx = users.findIndex(u => u.id === id || u.username === id);

    if (userIdx === -1) return res.status(404).json({ error: "User not found" });

    // Update fields
    if (password) users[userIdx].password = password;
    if (role) users[userIdx].role = role;
    if (menus) users[userIdx].menus = menus; // Update menu permissions

    saveUsers(users);
    res.json({ success: true });
});

// DELETE /auth/users/:username
router.delete("/users/:username", (req, res) => {
    const { username } = req.params;
    if (username === "admin") return res.status(403).json({ error: "Cannot delete default admin" });

    let users = getUsers();
    const initialLen = users.length;
    users = users.filter(u => u.username !== username);

    if (users.length === initialLen) return res.status(404).json({ error: "User not found" });

    saveUsers(users);
    res.json({ success: true });
});

// Ensure default admin exists helper (exported)
router.limitless_ensureAdmin = function () {
    const users = getUsers();
    if (!users.find(u => u.username === "admin")) {
        users.unshift(DEFAULT_ADMIN);
        saveUsers(users);
        console.log("[Auth] Default admin restored.");
    }
};

module.exports = router;
