#include <sqlite3.h>
#include <string>
#include <iostream>

static sqlite3* db = nullptr;

void initIndexDB(const std::string& path) {
    if (sqlite3_open(path.c_str(), &db) != SQLITE_OK) {
        std::cerr << "[IndexDB] Can't open database: " << sqlite3_errmsg(db) << std::endl;
        return;
    }
    
    const char* sql = 
        "CREATE TABLE IF NOT EXISTS frames(ts INTEGER, keyframe INTEGER, segment_id INTEGER);"
        "CREATE TABLE IF NOT EXISTS segments(id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT, start_ts INTEGER, end_ts INTEGER);";
        
    char* errMsg = nullptr;
    if (sqlite3_exec(db, sql, nullptr, nullptr, &errMsg) != SQLITE_OK) {
        std::cerr << "[IndexDB] SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
    }
}

int64_t current_segment_id = -1;

void insertSegment(const std::string& filename, int64_t start_ts) {
    if (!db) return;
    
    // Close previous segment if exists (update end_ts w/ logic if needed, but for now we just insert new)
    // Ideally we'd update the previous segment's end_ts here, but simpler to just insert new one.
    
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO segments (file, start_ts, end_ts) VALUES (?, ?, 0);"; // 0 end_ts initially
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, filename.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_int64(stmt, 2, start_ts);
        sqlite3_step(stmt);
        current_segment_id = sqlite3_last_insert_rowid(db);
        sqlite3_finalize(stmt);
    }
}

void closeSegment(int64_t end_ts) {
    if (!db || current_segment_id == -1) return;
    sqlite3_stmt* stmt;
    const char* sql = "UPDATE segments SET end_ts = ? WHERE id = ?;";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(stmt, 1, end_ts);
        sqlite3_bind_int64(stmt, 2, current_segment_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
}

void insertFrame(int64_t ts, bool key) {
    if (!db) return;
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO frames (ts, keyframe, segment_id) VALUES (?, ?, ?);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(stmt, 1, ts);
        sqlite3_bind_int(stmt, 2, key ? 1 : 0);
        sqlite3_bind_int64(stmt, 3, current_segment_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
}
