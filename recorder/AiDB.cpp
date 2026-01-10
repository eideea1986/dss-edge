#include <sqlite3.h>
#include <string>
#include <iostream>

static sqlite3* aidb = nullptr;

void initAiDB(const std::string& path) {
    if (sqlite3_open(path.c_str(), &aidb) != SQLITE_OK) {
        std::cerr << "[AiDB] Can't open database: " << sqlite3_errmsg(aidb) << std::endl;
        return;
    }
    const char* sql = "CREATE TABLE IF NOT EXISTS events(ts INTEGER, type TEXT, confidence REAL, bbox TEXT);";
    char* errMsg = nullptr;
    if (sqlite3_exec(aidb, sql, nullptr, nullptr, &errMsg) != SQLITE_OK) {
        std::cerr << "[AiDB] SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
    }
}

void insertAiEvent(int64_t ts, const std::string& type, float conf, const std::string& bbox) {
    if (!aidb) return;
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO events (ts, type, confidence, bbox) VALUES (?, ?, ?, ?);";
    if (sqlite3_prepare_v2(aidb, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(stmt, 1, ts);
        sqlite3_bind_text(stmt, 2, type.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_double(stmt, 3, conf);
        sqlite3_bind_text(stmt, 4, bbox.c_str(), -1, SQLITE_STATIC);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
}
