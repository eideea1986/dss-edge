#include <sqlite3.h>
#include <string>
#include <iostream>
#include <chrono>

static sqlite3* db = nullptr;
static int64_t current_segment_id = -1;
static int64_t stream_start_time = 0;
static std::string current_segment_file;

void initIndexDB(const std::string& path) {
    if (sqlite3_open(path.c_str(), &db) != SQLITE_OK) {
        std::cerr << "[IndexDB] Can't open database: " << sqlite3_errmsg(db) << std::endl;
        return;
    }
    
    const char* sql = 
        "CREATE TABLE IF NOT EXISTS frames(ts INTEGER, keyframe INTEGER, segment_id INTEGER);"
        "CREATE TABLE IF NOT EXISTS segments(id INTEGER PRIMARY KEY AUTOINCREMENT, file TEXT, start_ts INTEGER, end_ts INTEGER);"
        "CREATE TABLE IF NOT EXISTS gops(ts INTEGER, file TEXT, segment_id INTEGER);";
        
    char* errMsg = nullptr;
    if (sqlite3_exec(db, sql, nullptr, nullptr, &errMsg) != SQLITE_OK) {
        std::cerr << "[IndexDB] SQL error: " << errMsg << std::endl;
        sqlite3_free(errMsg);
    }
}

void insertSegment(const std::string& filename, int64_t start_pts) {
    if (!db) return;
    
    // Use CURRENT epoch time for segment start
    int64_t abs_start_ts = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
    
    if (stream_start_time == 0) {
        stream_start_time = abs_start_ts;
    }
    
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO segments (file, start_ts, end_ts) VALUES (?, ?, 0);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_text(stmt, 1, filename.c_str(), -1, SQLITE_STATIC);
        sqlite3_bind_int64(stmt, 2, abs_start_ts);
        sqlite3_step(stmt);
        current_segment_id = sqlite3_last_insert_rowid(db);
        current_segment_file = filename;
        sqlite3_finalize(stmt);
        
        std::cerr << "[IndexDB] Inserted segment " << filename 
                  << " with start_ts=" << abs_start_ts << " (epoch ms)" << std::endl;
    }
}

void closeSegment(int64_t end_pts) {
    if (!db || current_segment_id == -1) return;
    
    // Use CURRENT epoch time for segment end
    int64_t abs_end_ts = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
    
    sqlite3_stmt* stmt;
    const char* sql = "UPDATE segments SET end_ts = ? WHERE id = ?;";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(stmt, 1, abs_end_ts);
        sqlite3_bind_int64(stmt, 2, current_segment_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
        
        std::cerr << "[IndexDB] Closed segment " << current_segment_id 
                  << " with end_ts=" << abs_end_ts << " (epoch ms)" << std::endl;
    }
}

void insertFrame(int64_t pts, bool key) {
    if (!db) return;
    
    // Use CURRENT epoch time
    int64_t abs_ts = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
    
    sqlite3_stmt* stmt;
    const char* sql = "INSERT INTO frames (ts, keyframe, segment_id) VALUES (?, ?, ?);";
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) == SQLITE_OK) {
        sqlite3_bind_int64(stmt, 1, abs_ts);
        sqlite3_bind_int(stmt, 2, key ? 1 : 0);
        sqlite3_bind_int64(stmt, 3, current_segment_id);
        sqlite3_step(stmt);
        sqlite3_finalize(stmt);
    }
    
    // GOP tracking for keyframes
    if (key) {
        const char* gopSql = "INSERT INTO gops (ts, file, segment_id) VALUES (?, ?, ?);";
        if (sqlite3_prepare_v2(db, gopSql, -1, &stmt, nullptr) == SQLITE_OK) {
            sqlite3_bind_int64(stmt, 1, abs_ts);
            sqlite3_bind_text(stmt, 2, current_segment_file.c_str(), -1, SQLITE_TRANSIENT);
            sqlite3_bind_int64(stmt, 3, current_segment_id);
            sqlite3_step(stmt);
            sqlite3_finalize(stmt);
        }
    }
}
