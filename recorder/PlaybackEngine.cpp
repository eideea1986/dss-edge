#include <iostream>
#include <vector>
#include <string>
#include <sqlite3.h>
#include <filesystem>
#include <cstdio>
#include <cstdlib>

struct Segment {
    int id;
    std::string file;
    int64_t start_ts;
    int64_t end_ts;
};

sqlite3* db;

/* ================= OPEN INDEX ================= */
void openIndex(const std::string& path) {
    if (sqlite3_open(path.c_str(), &db)) {
        std::cerr << "Cannot open index DB: " << path << "\n";
        exit(1);
    }
}

/* ================= QUERY SEGMENTS ================= */
std::vector<Segment> getSegments(int64_t from, int64_t to) {
    std::vector<Segment> list;

    // Adjusted query to find any segment overlapping or strictly inside
    // If we want STRICT containment, use between. 
    // Usually for playback we want anything that covers the interval.
    // User provided: WHERE end_ts >= ? AND start_ts <= ?
    const char* sql =
        "SELECT id, file, start_ts, end_ts "
        "FROM segments "
        "WHERE end_ts >= ? AND start_ts <= ? "
        "ORDER BY id";

    sqlite3_stmt* stmt;
    if (sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr) != SQLITE_OK) {
        std::cerr << "SQL Prepare error: " << sqlite3_errmsg(db) << "\n";
        return list;
    }
    
    sqlite3_bind_int64(stmt, 1, from);
    sqlite3_bind_int64(stmt, 2, to);

    while (sqlite3_step(stmt) == SQLITE_ROW) {
        Segment s;
        s.id = sqlite3_column_int(stmt, 0);
        s.file = (const char*)sqlite3_column_text(stmt, 1);
        s.start_ts = sqlite3_column_int64(stmt, 2);
        s.end_ts = sqlite3_column_int64(stmt, 3);
        list.push_back(s);
    }

    sqlite3_finalize(stmt);
    return list;
}

/* ================= BUILD CONCAT FILE ================= */
std::string buildConcat(const std::vector<Segment>& segs, const std::string& base) {
    std::string concat = "/tmp/concat_playlist.txt";
    FILE* f = fopen(concat.c_str(), "w");
    if (!f) return "";

    for (auto& s : segs) {
        std::string path = base + "/segments/" + s.file;
        if (std::filesystem::exists(path)) {
            // ffmpeg concat demuxer format
            fprintf(f, "file '%s'\n", path.c_str());
        } else {
            std::cerr << "Missing segment file: " << path << "\n";
        }
    }

    fclose(f);
    return concat;
}

/* ================= PLAYBACK ================= */
void play(
    const std::string& archivePath,
    int64_t from,
    int64_t to,
    double speed,
    const std::string& outputTarget
) {
    auto segs = getSegments(from, to);

    if (segs.empty()) {
        std::cout << "[Playback] No video segments found in interval [" << from << ", " << to << "]\n";
        
        // Debug: Dump all segments to see what's wrong (or if any exist)
        const char* sql = "SELECT COUNT(*) FROM segments";
        sqlite3_stmt* stmt;
        sqlite3_prepare_v2(db, sql, -1, &stmt, nullptr);
        if (sqlite3_step(stmt) == SQLITE_ROW) {
            std::cout << "[Debug] Total segments in DB: " << sqlite3_column_int(stmt, 0) << "\n";
        }
        sqlite3_finalize(stmt);
        
        return;
    }
    
    std::cout << "[Playback] Found " << segs.size() << " segments for playback.\n";

    std::string concat = buildConcat(segs, archivePath);

    char cmd[2048];
    // If output is "test", we simply verify concat generation or write to null
    // If output is generic, we try to use it.
    
    std::string outputArgs = "";
    if (outputTarget == "sdl") {
         outputArgs = "-f sdl \"Playback\"";
    } else {
         outputArgs = "-y \"" + outputTarget + "\"";
    }

    snprintf(cmd, sizeof(cmd),
        "ffmpeg -loglevel error "
        "-fflags +genpts "
        "-f concat -safe 0 -i %s "
        "-vf setpts=PTS/%.2f "
        "%s", // Output args (no -an forced unless needed)
        concat.c_str(),
        speed,
        outputArgs.c_str()
    );

    std::cout << "[Exec] " << cmd << "\n";
    int ret = system(cmd);
    std::cout << "[Playback] FFmpeg exit code: " << ret << "\n";
}

/* ================= MAIN ================= */
int main(int argc, char** argv) {
    if (argc < 4) {
        std::cout << "Usage: ./playback_engine <archive_path> <start_ts> <end_ts> [output_file]\n";
        std::cout << "Example: ./playback_engine /opt/dss-edge/storage/cam_01 1000 5000 output.mp4\n";
        return 1;
    }
    
    std::string archive = argv[1];
    int64_t start = std::stoll(argv[2]);
    int64_t end = std::stoll(argv[3]);
    std::string output = (argc >= 5) ? argv[4] : "sdl";

    openIndex(archive + "/index.db");

    std::cout << "=== DSS Playback Engine V1.0 ===\n";
    std::cout << "Archive: " << archive << "\n";
    std::cout << "Range: " << start << " -> " << end << "\n";

    play(archive, start, end, 1.0, output);

    sqlite3_close(db);
    return 0;
}
